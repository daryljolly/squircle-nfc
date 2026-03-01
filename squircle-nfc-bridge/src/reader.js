/**
 * PC/SC NFC Reader abstraction layer.
 * Wraps nfc-pcsc to provide a clean event-based API for the bridge.
 */
import { NFC } from "nfc-pcsc";
import { EventEmitter } from "node:events";
import { parseNDEF } from "./ndef.js";

// NTAG type identification by CC-reported capacity (CC byte 2 × 8)
// NTAG213: CC=0x12 → 144B, NTAG215: CC=0x3E → 496B, NTAG216: CC=0x6D → 872B
const NTAG_TYPES = {
  144: "NTAG213",
  496: "NTAG215",
  872: "NTAG216",
};

function identifyTagType(capacity) {
  return NTAG_TYPES[capacity] || `NTAG (${capacity}B)`;
}

export class NFCReader extends EventEmitter {
  constructor() {
    super();
    this.nfc = new NFC();
    this.readers = new Map();  // track all PC/SC interfaces
    this.reader = null;        // the interface that has the active card
    this.card = null;
    this._setupNFC();
  }

  _setupNFC() {
    this.nfc.on("reader", (reader) => {
      const name = reader.reader.name;
      this.readers.set(name, reader);
      console.log(`[pcsc] interface registered: ${name}`);
      this.emit("reader:connect", { name });

      // When a card is detected on THIS interface, pin it as the active reader.
      reader.on("card", async (card) => {
        this.reader = reader;  // pin to the interface that actually sees the tag
        this.card = card;
        console.log(`[pcsc] card on ${name}  uid=${card.uid}`);
        try {
          const tagInfo = await this._readTagInfo(reader, card);
          this.emit("tag:connect", tagInfo);
        } catch (err) {
          this.emit("error", { source: "card", message: err.message });
        }
      });

      reader.on("card.off", (card) => {
        this.card = null;
        this.emit("tag:disconnect", { uid: card.uid });
      });

      reader.on("error", (err) => {
        this.emit("error", { source: "reader", message: err.message });
      });

      reader.on("end", () => {
        this.readers.delete(name);
        if (this.reader === reader) {
          this.reader = null;
          this.card = null;
        }
        this.emit("reader:disconnect");
      });
    });

    this.nfc.on("error", (err) => {
      this.emit("error", { source: "nfc", message: err.message });
    });
  }

  async _readTagInfo(reader, card) {
    // Read capability container (CC) at page 3 via raw APDU
    const cc = await this._rawRead(reader, 3, 4);
    const capacityByte = cc[2];
    const totalBytes = capacityByte * 8;
    const writable = cc[3] === 0x00;

    // Determine used bytes by reading NDEF TLV
    let used = 0;
    let records = [];
    try {
      const result = await this._readNDEFData(reader);
      used = result.rawLength;
      records = result.records;
    } catch {
      // Tag may be empty or unformatted
    }

    const tagType = identifyTagType(totalBytes);

    return {
      uid: this._formatUID(card.uid),
      atr: card.atr?.toString("hex") || null,
      type: tagType,
      capacity: totalBytes,
      used,
      writable,
      records,
    };
  }

  async _readNDEFData(reader) {
    // NDEF data starts at page 4 on NTAG chips.
    // NTAG READ returns 4 pages (16 bytes) per command.
    const chunks = [];
    const startPage = 4;
    const pagesPerRead = 4;
    const maxReads = 10; // up to 40 pages (160 bytes)

    for (let i = 0; i < maxReads; i++) {
      try {
        const data = await this._rawRead(reader, startPage + i * pagesPerRead, 16);
        chunks.push(data);
      } catch {
        break;
      }
    }

    const raw = Buffer.concat(chunks);

    // Find NDEF TLV (type 0x03)
    let pos = 0;
    while (pos < raw.length) {
      const tlvType = raw[pos];
      if (tlvType === 0x00) {
        pos++;
        continue; // NULL TLV
      }
      if (tlvType === 0xFE) break; // Terminator TLV

      const tlvLen =
        raw[pos + 1] === 0xFF
          ? (raw[pos + 2] << 8) | raw[pos + 3]
          : raw[pos + 1];
      const headerLen = raw[pos + 1] === 0xFF ? 4 : 2;

      if (tlvType === 0x03) {
        // NDEF Message TLV
        const ndefBytes = raw.subarray(pos + headerLen, pos + headerLen + tlvLen);
        const records = parseNDEF(ndefBytes);
        return { rawLength: headerLen + tlvLen, records };
      }

      pos += headerLen + tlvLen;
    }

    return { rawLength: 0, records: [] };
  }

  _formatUID(uid) {
    if (!uid) return null;
    // uid from nfc-pcsc comes as hex string like "04a2fb1a3c8084"
    const hex = uid.toUpperCase();
    const parts = [];
    for (let i = 0; i < hex.length; i += 2) {
      parts.push(hex.substring(i, i + 2));
    }
    return parts.join(":");
  }

  // ─── NTAG page write via UPDATE BINARY ───────────────

  /**
   * Write a single 4-byte page to the NTAG via UPDATE BINARY.
   *
   * The ACR1252U firmware natively translates UPDATE BINARY into the
   * correct NTAG WRITE command when P2 is the page number (not byte
   * offset). nfc-pcsc's reader.write() also uses UPDATE BINARY but
   * its transmit() wrapper gates on reader.card which the pcsclite
   * polling loop may have cleared. We bypass the wrapper and call the
   * raw pcsclite reader.transmit() directly.
   *
   * APDU: FF D6 00 <page> 04 <4 bytes>
   *   FF    = CLA
   *   D6    = INS (UPDATE BINARY)
   *   00    = P1
   *   <page> = P2: NTAG page number
   *   04    = Lc (4 data bytes)
   *   <4 bytes> = page data
   *
   * Response on success: 90 00
   */
  async _writeNTAGPage(reader, page, data) {
    const apdu = Buffer.from([
      0xFF, 0xD6, 0x00,
      page & 0xFF,
      0x04,
      data[0] ?? 0x00, data[1] ?? 0x00, data[2] ?? 0x00, data[3] ?? 0x00,
    ]);

    console.log(`  [write] page ${page}  data=${data.toString("hex")}  apdu=${apdu.toString("hex")}`);

    // Re-establish the PC/SC connection if nfc-pcsc's polling loop dropped it.
    if (!reader.connection) {
      console.log("  [write] PC/SC connection lost, reconnecting...");
      await reader.connect();
      console.log("  [write] reconnected, protocol:", reader.connection.protocol);
    }

    // Bypass nfc-pcsc's transmit() wrapper — it gates on reader.card which
    // the polling loop may have cleared even though the physical tag is still
    // on the reader. The raw pcsclite reader.transmit() has no such guard.
    const rawReader = reader.reader;
    const protocol = reader.connection.protocol;

    const res = await new Promise((resolve, reject) => {
      rawReader.transmit(apdu, 64, protocol, (err, response) => {
        if (err) return reject(new Error(`NTAG WRITE transmit error page ${page}: ${err.message}`));
        resolve(response);
      });
    });

    console.log(`  [write] page ${page}  response=${res.toString("hex")}`);

    // Check SW1 SW2 (last 2 bytes must be 90 00)
    const sw1 = res[res.length - 2];
    const sw2 = res[res.length - 1];
    if (sw1 !== 0x90 || sw2 !== 0x00) {
      // SW=6300 means the page is locked/write-protected
      if (sw1 === 0x63 && sw2 === 0x00) {
        throw new Error("This NFC tag has been locked. It cannot be erased or re-written.");
      }
      throw new Error(
        `NTAG WRITE failed page ${page}: SW=${sw1.toString(16).padStart(2, "0")}${sw2.toString(16).padStart(2, "0")}`
      );
    }
  }

  // ─── NTAG page read via READ BINARY ─────────────────

  /**
   * Read via READ BINARY using raw pcsclite transmit (bypasses nfc-pcsc
   * reader.card gate).  NTAG READ always returns 4 pages (16 bytes)
   * regardless of Le, so we request 16 and slice to the desired length.
   *
   * @param {object} reader  - nfc-pcsc reader instance
   * @param {number} page    - NTAG page number
   * @param {number} length  - bytes to return (default 4 = single page)
   */
  async _rawRead(reader, page, length = 4) {
    const apdu = Buffer.from([0xFF, 0xB0, 0x00, page & 0xFF, 0x10]);

    if (!reader.connection) {
      console.log("  [read] PC/SC connection lost, reconnecting...");
      await reader.connect();
      console.log("  [read] reconnected, protocol:", reader.connection.protocol);
    }

    const rawReader = reader.reader;
    const protocol = reader.connection.protocol;

    const res = await new Promise((resolve, reject) => {
      rawReader.transmit(apdu, 64, protocol, (err, response) => {
        if (err) return reject(new Error(`READ BINARY transmit error page ${page}: ${err.message}`));
        resolve(response);
      });
    });

    const sw1 = res[res.length - 2];
    const sw2 = res[res.length - 1];
    if (sw1 !== 0x90 || sw2 !== 0x00) {
      throw new Error(
        `READ BINARY failed page ${page}: SW=${sw1.toString(16).padStart(2, "0")}${sw2.toString(16).padStart(2, "0")}`
      );
    }

    return res.subarray(0, Math.min(length, res.length - 2));
  }

  // ─── Public API ─────────────────────────────────────

  get isReaderConnected() {
    return this.reader !== null;
  }

  get isTagPresent() {
    return this.card !== null;
  }

  async readTag() {
    if (!this.reader) throw new Error("No reader connected");
    if (!this.card) throw new Error("No tag present");

    // Re-establish PC/SC connection if the polling loop dropped it
    if (!this.reader.connection) {
      console.log("[readTag] PC/SC connection lost, reconnecting...");
      await this.reader.connect();
    }

    return this._readTagInfo(this.reader, this.card);
  }

  async writeTag(ndefBytes) {
    if (!this.reader) throw new Error("No reader connected");
    if (!this.card) throw new Error("No tag present");

    console.log(`[writeTag] NDEF message: ${ndefBytes.length} bytes  hex=${ndefBytes.toString("hex")}`);

    // Build TLV: 0x03 (NDEF) + length + data + 0xFE (terminator)
    let tlv;
    if (ndefBytes.length >= 0xFF) {
      tlv = Buffer.alloc(ndefBytes.length + 5);
      tlv[0] = 0x03;
      tlv[1] = 0xFF;
      tlv[2] = (ndefBytes.length >> 8) & 0xFF;
      tlv[3] = ndefBytes.length & 0xFF;
      ndefBytes.copy(tlv, 4);
      tlv[tlv.length - 1] = 0xFE;
    } else {
      tlv = Buffer.alloc(ndefBytes.length + 3);
      tlv[0] = 0x03;
      tlv[1] = ndefBytes.length;
      ndefBytes.copy(tlv, 2);
      tlv[tlv.length - 1] = 0xFE;
    }

    console.log(`[writeTag] TLV wrapped: ${tlv.length} bytes  hex=${tlv.toString("hex")}`);

    // Write page-by-page starting at NTAG page 4 (first user data page).
    // Uses raw NTAG WRITE via InCommunicateThru — page numbers, not byte offsets.
    const startPage = 4;
    const totalPages = Math.ceil(tlv.length / 4);
    console.log(`[writeTag] Writing ${totalPages} pages starting at page ${startPage}`);

    for (let i = 0; i < tlv.length; i += 4) {
      const page = startPage + (i / 4);
      const chunk = Buffer.alloc(4);
      tlv.copy(chunk, 0, i, Math.min(i + 4, tlv.length));
      await this._writeNTAGPage(this.reader, page, chunk);
    }

    console.log(`[writeTag] Done — ${tlv.length} bytes written to pages ${startPage}–${startPage + totalPages - 1}`);
    return { bytesWritten: tlv.length };
  }

  async eraseTag() {
    if (!this.reader) throw new Error("No reader connected");
    if (!this.card) throw new Error("No tag present");

    console.log("[eraseTag] Writing empty NDEF TLV to page 4");

    // Write empty NDEF TLV + terminator to page 4
    const empty = Buffer.from([0x03, 0x00, 0xFE, 0x00]);
    await this._writeNTAGPage(this.reader, 4, empty);

    console.log("[eraseTag] Done");
    return { success: true };
  }

  async lockTag() {
    if (!this.reader) throw new Error("No reader connected");
    if (!this.card) throw new Error("No tag present");

    const reader = this.reader;
    console.log("[lockTag] === PERMANENTLY LOCKING TAG ===");

    // Step 1: Read CC at page 3 to determine tag type
    console.log("[lockTag] Step 1: Reading CC at page 3...");
    const cc = await this._rawRead(reader, 3, 4);
    const capacityByte = cc[2];
    const totalBytes = capacityByte * 8;
    const tagType = identifyTagType(totalBytes);
    console.log(`[lockTag] Tag type: ${tagType}, capacity: ${totalBytes}B, CC=${cc.toString("hex")}`);

    // Step 2: Set CC access byte to 0x0F (read-only) and write back
    console.log("[lockTag] Step 2: Setting CC access byte to 0x0F (read-only)...");
    const ccUpdated = Buffer.from([cc[0], cc[1], cc[2], 0x0F]);
    await this._writeNTAGPage(reader, 3, ccUpdated);

    // Verify CC was written
    const ccVerify = await this._rawRead(reader, 3, 4);
    console.log(`[lockTag] CC verify: ${ccVerify.toString("hex")} (expect byte3=0f)`);
    if (ccVerify[3] !== 0x0F) {
      throw new Error(`CC write failed: expected access=0F, got=${ccVerify[3].toString(16)}`);
    }

    // Step 3: Write dynamic lock bytes BEFORE static locks
    // (static locks cover pages 3-15; dynamic lock pages are beyond that range
    //  but we write them first as a precaution)
    // NTAG213: page 40, NTAG215: page 130, NTAG216: page 226
    const dynamicLockPage = totalBytes <= 144 ? 40 : totalBytes <= 496 ? 130 : 226;
    const dynamicLockBits = Buffer.from([0xFF, 0xFF, 0xFF, 0x00]);
    console.log(`[lockTag] Step 3: Writing dynamic lock bits to page ${dynamicLockPage}...`);
    await this._writeNTAGPage(reader, dynamicLockPage, dynamicLockBits);

    // Verify dynamic lock bytes
    const dlVerify = await this._rawRead(reader, dynamicLockPage, 4);
    console.log(`[lockTag] Dynamic lock verify: ${dlVerify.toString("hex")} (expect ffffff00)`);

    // Step 4: Set static lock bytes at page 2 (bytes 2-3 = 0xFF 0xFF)
    // Page 2 layout: SN2(byte0), Internal(byte1), Lock0(byte2), Lock1(byte3)
    // This is done LAST because it locks pages 3-15 permanently.
    console.log("[lockTag] Step 4: Setting static lock bytes at page 2...");
    const page2 = await this._rawRead(reader, 2, 4);
    console.log(`[lockTag] Page 2 before: ${page2.toString("hex")}`);
    const page2Updated = Buffer.from([page2[0], page2[1], 0xFF, 0xFF]);
    await this._writeNTAGPage(reader, 2, page2Updated);

    // Verify static lock bytes
    const p2Verify = await this._rawRead(reader, 2, 4);
    console.log(`[lockTag] Page 2 verify: ${p2Verify.toString("hex")} (expect bytes2-3=ffff)`);
    if (p2Verify[2] !== 0xFF || p2Verify[3] !== 0xFF) {
      throw new Error(`Static lock write failed: got Lock0=${p2Verify[2].toString(16)} Lock1=${p2Verify[3].toString(16)}`);
    }

    console.log("[lockTag] === TAG PERMANENTLY LOCKED ===");
    return { success: true };
  }

  destroy() {
    if (this.reader) {
      try {
        this.reader.close();
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}
