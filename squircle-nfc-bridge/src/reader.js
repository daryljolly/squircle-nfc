/**
 * PC/SC NFC Reader abstraction layer.
 * Wraps nfc-pcsc to provide a clean event-based API for the bridge.
 */
import { NFC } from "nfc-pcsc";
import { EventEmitter } from "node:events";
import { parseNDEF } from "./ndef.js";

// NTAG type identification by ATR or capacity
const NTAG_TYPES = {
  137: "NTAG213",
  496: "NTAG215",
  868: "NTAG216",
};

function identifyTagType(capacity) {
  return NTAG_TYPES[capacity] || `NTAG (${capacity}B)`;
}

export class NFCReader extends EventEmitter {
  constructor() {
    super();
    this.nfc = new NFC();
    this.reader = null;
    this.card = null;
    this._setupNFC();
  }

  _setupNFC() {
    this.nfc.on("reader", (reader) => {
      this.reader = reader;
      this.emit("reader:connect", {
        name: reader.reader.name,
      });

      reader.on("card", async (card) => {
        this.card = card;
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
        this.reader = null;
        this.card = null;
        this.emit("reader:disconnect");
      });
    });

    this.nfc.on("error", (err) => {
      this.emit("error", { source: "nfc", message: err.message });
    });
  }

  async _readTagInfo(reader, card) {
    // Read capability container (CC) at page 3 to get capacity
    const cc = await reader.read(3, 4);
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
    // NDEF data starts at page 4 on NTAG chips
    // Read in 4-page (16 byte) chunks
    const chunks = [];
    let offset = 4;
    const maxPages = 40; // Read up to 160 bytes to find NDEF message

    for (let i = 0; i < maxPages; i += 4) {
      try {
        const data = await reader.read(offset + i, 16);
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

  // ─── Public API ─────────────────────────────────────

  get isReaderConnected() {
    return this.reader !== null;
  }

  get isTagPresent() {
    return this.card !== null;
  }

  async readTag() {
    if (!this.reader || !this.card) {
      throw new Error("No reader or tag available");
    }
    return this._readTagInfo(this.reader, this.card);
  }

  async writeTag(ndefBytes) {
    if (!this.reader) throw new Error("No reader connected");
    if (!this.card) throw new Error("No tag present");

    // Build TLV: 0x03 (NDEF) + length + data + 0xFE (terminator)
    const tlv = Buffer.alloc(ndefBytes.length + 3);
    tlv[0] = 0x03; // NDEF message TLV
    tlv[1] = ndefBytes.length;
    ndefBytes.copy(tlv, 2);
    tlv[tlv.length - 1] = 0xFE; // Terminator

    // Write starting at page 4
    const pageSize = 4;
    for (let i = 0; i < tlv.length; i += pageSize) {
      const page = 4 + i / pageSize;
      const chunk = Buffer.alloc(pageSize);
      tlv.copy(chunk, 0, i, Math.min(i + pageSize, tlv.length));
      await this.reader.write(page, chunk, pageSize);
    }

    return { bytesWritten: tlv.length };
  }

  async eraseTag() {
    if (!this.reader) throw new Error("No reader connected");
    if (!this.card) throw new Error("No tag present");

    // Write empty NDEF TLV + terminator at page 4
    const empty = Buffer.from([0x03, 0x00, 0xFE, 0x00]);
    await this.reader.write(4, empty, 4);

    return { success: true };
  }

  async lockTag() {
    if (!this.reader) throw new Error("No reader connected");
    if (!this.card) throw new Error("No tag present");

    // Set CC byte 3 (access bits) to read-only
    // Read current CC
    const cc = await this.reader.read(3, 4);
    cc[3] = 0x0F; // Read-only access

    // Write updated CC
    await this.reader.write(3, cc, 4);

    // Set dynamic lock bits (pages vary by tag type)
    // For NTAG21x, dynamic lock bytes are at the end of user memory
    // This is a simplified version - full implementation would check tag type
    const lockBits = Buffer.from([0xFF, 0xFF, 0xFF, 0x00]);
    // NTAG213: page 40, NTAG215: page 130, NTAG216: page 226
    // We'll try the common location first
    try {
      await this.reader.write(40, lockBits, 4);
    } catch {
      // Different tag type, try alternatives
      try {
        await this.reader.write(130, lockBits, 4);
      } catch {
        // Last resort
        await this.reader.write(226, lockBits, 4);
      }
    }

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
