/**
 * NDEF (NFC Data Exchange Format) encoder/decoder.
 * Supports: URL, Text, vCard, Wi-Fi, Geo, Phone, Email, SMS records.
 */

// ─── URI Prefix table (NFC Forum RTD URI) ─────────────────
const URI_PREFIXES = [
  "", "http://www.", "https://www.", "http://", "https://",
  "tel:", "mailto:", "ftp://anonymous:anonymous@", "ftp://ftp.",
  "ftps://", "sftp://", "smb://", "nfs://", "ftp://", "dav://",
  "news:", "telnet://", "imap:", "rtsp://", "urn:", "pop:",
  "sip:", "sips:", "tftp:", "btspp://", "btl2cap://", "btgoep://",
  "tcpobex://", "irdaobex://", "file://", "urn:epc:id:",
  "urn:epc:tag:", "urn:epc:pat:", "urn:epc:raw:", "urn:epc:",
  "urn:nfc:",
];

// ─── NDEF Record Flags ─────────────────────────────────────
const MB = 0x80; // Message Begin
const ME = 0x40; // Message End
const CF = 0x20; // Chunk Flag
const SR = 0x10; // Short Record
const IL = 0x08; // ID Length present
const TNF_WELL_KNOWN = 0x01;
const TNF_MEDIA = 0x02;
const TNF_ABSOLUTE_URI = 0x03;
const TNF_EXTERNAL = 0x04;

// ─── Parse NDEF Message ────────────────────────────────────
export function parseNDEF(buffer) {
  const records = [];
  let pos = 0;

  while (pos < buffer.length) {
    const header = buffer[pos++];
    const tnf = header & 0x07;
    const isMB = !!(header & MB);
    const isME = !!(header & ME);
    const isSR = !!(header & SR);
    const hasIL = !!(header & IL);

    if (tnf === 0x00 && !isMB) break; // Empty or end

    const typeLength = buffer[pos++];
    const payloadLength = isSR
      ? buffer[pos++]
      : (buffer[pos++] << 24) | (buffer[pos++] << 16) | (buffer[pos++] << 8) | buffer[pos++];
    const idLength = hasIL ? buffer[pos++] : 0;

    const type = buffer.subarray(pos, pos + typeLength);
    pos += typeLength;

    const id = idLength > 0 ? buffer.subarray(pos, pos + idLength) : null;
    pos += idLength;

    const payload = buffer.subarray(pos, pos + payloadLength);
    pos += payloadLength;

    const decoded = decodeRecord(tnf, type, payload);
    if (decoded) records.push(decoded);

    if (isME) break;
  }

  return records;
}

function decodeRecord(tnf, type, payload) {
  const typeStr = type.toString("ascii");

  if (tnf === TNF_WELL_KNOWN) {
    if (typeStr === "U") return decodeURI(payload);
    if (typeStr === "T") return decodeText(payload);
  }

  if (tnf === TNF_MEDIA) {
    const mimeType = typeStr;
    if (mimeType === "text/vcard" || mimeType === "text/x-vCard") {
      return decodeVCard(payload);
    }
    if (mimeType === "application/vnd.wfa.wsc") {
      return decodeWiFi(payload);
    }
    return { type: "text", value: payload.toString("utf8") };
  }

  if (tnf === TNF_ABSOLUTE_URI) {
    return { type: "url", value: typeStr };
  }

  // Fallback
  return { type: "text", value: payload.toString("utf8") };
}

function decodeURI(payload) {
  const prefixCode = payload[0];
  const prefix = URI_PREFIXES[prefixCode] || "";
  const rest = payload.subarray(1).toString("utf8");
  const uri = prefix + rest;

  // Detect special URI schemes
  if (uri.startsWith("tel:")) return { type: "phone", value: uri.slice(4) };
  if (uri.startsWith("mailto:")) return decodeMailtoURI(uri);
  if (uri.startsWith("sms:")) return decodeSmsURI(uri);
  if (uri.startsWith("geo:")) return decodeGeoURI(uri);

  return { type: "url", value: uri };
}

function decodeText(payload) {
  const statusByte = payload[0];
  const langLen = statusByte & 0x3F;
  const isUTF16 = !!(statusByte & 0x80);
  const text = payload
    .subarray(1 + langLen)
    .toString(isUTF16 ? "utf16le" : "utf8");
  return { type: "text", value: text };
}

function decodeVCard(payload) {
  const text = payload.toString("utf8");
  const getValue = (field) => {
    const match = text.match(new RegExp(`${field}[;:]([^\\r\\n]+)`, "i"));
    return match ? match[1].replace(/^.*:/, "").trim() : "";
  };
  return {
    type: "vcard",
    value: {
      name: getValue("FN") || getValue("N"),
      phone: getValue("TEL"),
      email: getValue("EMAIL"),
      org: getValue("ORG"),
    },
  };
}

function decodeWiFi(payload) {
  // WFA Wi-Fi Simple Configuration TLV format
  const result = { ssid: "", password: "", encryption: "WPA2" };
  let pos = 0;

  while (pos + 4 <= payload.length) {
    const attrId = (payload[pos] << 8) | payload[pos + 1];
    const attrLen = (payload[pos + 2] << 8) | payload[pos + 3];
    const attrData = payload.subarray(pos + 4, pos + 4 + attrLen);
    pos += 4 + attrLen;

    if (attrId === 0x1045) result.ssid = attrData.toString("utf8");
    if (attrId === 0x1027) result.password = attrData.toString("utf8");
    if (attrId === 0x1003) {
      const authType = (attrData[0] << 8) | attrData[1];
      if (authType === 0x0020) result.encryption = "WPA2";
      else if (authType === 0x0002) result.encryption = "WPA";
      else if (authType === 0x0001) result.encryption = "WEP";
      else result.encryption = "OPEN";
    }
  }

  return { type: "wifi", value: result };
}

function decodeMailtoURI(uri) {
  const url = new URL(uri);
  const to = url.pathname;
  const subject = url.searchParams.get("subject") || "";
  const body = url.searchParams.get("body") || "";
  return { type: "email", value: { to, subject, body } };
}

function decodeSmsURI(uri) {
  const parts = uri.slice(4).split("?");
  const number = parts[0];
  const params = new URLSearchParams(parts[1] || "");
  return { type: "sms", value: { number, body: params.get("body") || "" } };
}

function decodeGeoURI(uri) {
  const coords = uri.slice(4).split(",");
  return {
    type: "geo",
    value: { lat: coords[0] || "", lng: coords[1]?.split("?")[0] || "" },
  };
}

// ─── Encode NDEF Message ───────────────────────────────────
export function encodeNDEF(records) {
  const encoded = records.map((r, i) => encodeRecord(r, i === 0, i === records.length - 1));
  return Buffer.concat(encoded);
}

function encodeRecord(record, isFirst, isLast) {
  const { tnf, type, payload } = buildRecordPayload(record);
  const typeBytes = Buffer.from(type, "ascii");

  let flags = tnf;
  if (isFirst) flags |= MB;
  if (isLast) flags |= ME;
  if (payload.length < 256) flags |= SR;

  const header = [flags, typeBytes.length];

  if (payload.length < 256) {
    header.push(payload.length);
  } else {
    header.push(
      (payload.length >> 24) & 0xFF,
      (payload.length >> 16) & 0xFF,
      (payload.length >> 8) & 0xFF,
      payload.length & 0xFF
    );
  }

  return Buffer.concat([Buffer.from(header), typeBytes, payload]);
}

function buildRecordPayload(record) {
  switch (record.type) {
    case "url":
      return encodeURL(record.value);
    case "text":
      return encodeText(record.value);
    case "vcard":
      return encodeVCard(record.value);
    case "wifi":
      return encodeWiFi(record.value);
    case "geo":
      return encodeGeo(record.value);
    case "phone":
      return encodePhone(record.value);
    case "email":
      return encodeEmail(record.value);
    case "sms":
      return encodeSMS(record.value);
    default:
      return encodeText(String(record.value));
  }
}

function encodeURL(url) {
  // Find the longest matching prefix
  let prefixIdx = 0;
  let prefixLen = 0;
  for (let i = 1; i < URI_PREFIXES.length; i++) {
    if (url.startsWith(URI_PREFIXES[i]) && URI_PREFIXES[i].length > prefixLen) {
      prefixIdx = i;
      prefixLen = URI_PREFIXES[i].length;
    }
  }
  const rest = url.slice(prefixLen);
  const payload = Buffer.alloc(1 + Buffer.byteLength(rest, "utf8"));
  payload[0] = prefixIdx;
  payload.write(rest, 1, "utf8");

  return { tnf: TNF_WELL_KNOWN, type: "U", payload };
}

function encodeText(text) {
  const lang = "en";
  const textBytes = Buffer.from(text, "utf8");
  const payload = Buffer.alloc(1 + lang.length + textBytes.length);
  payload[0] = lang.length; // UTF-8, language code length
  payload.write(lang, 1, "ascii");
  textBytes.copy(payload, 1 + lang.length);

  return { tnf: TNF_WELL_KNOWN, type: "T", payload };
}

function encodeVCard(value) {
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
  ];
  if (value.name) lines.push(`FN:${value.name}`);
  if (value.phone) lines.push(`TEL:${value.phone}`);
  if (value.email) lines.push(`EMAIL:${value.email}`);
  if (value.org) lines.push(`ORG:${value.org}`);
  lines.push("END:VCARD");

  const payload = Buffer.from(lines.join("\r\n"), "utf8");
  return { tnf: TNF_MEDIA, type: "text/vcard", payload };
}

function encodeWiFi(value) {
  const parts = [];

  // SSID (0x1045)
  if (value.ssid) {
    const ssidBuf = Buffer.from(value.ssid, "utf8");
    const attr = Buffer.alloc(4 + ssidBuf.length);
    attr.writeUInt16BE(0x1045, 0);
    attr.writeUInt16BE(ssidBuf.length, 2);
    ssidBuf.copy(attr, 4);
    parts.push(attr);
  }

  // Auth Type (0x1003)
  const authMap = { WPA2: 0x0020, WPA3: 0x0020, WPA: 0x0002, WEP: 0x0001, OPEN: 0x0000 };
  const authAttr = Buffer.alloc(6);
  authAttr.writeUInt16BE(0x1003, 0);
  authAttr.writeUInt16BE(2, 2);
  authAttr.writeUInt16BE(authMap[value.encryption] || 0x0020, 4);
  parts.push(authAttr);

  // Network Key (0x1027)
  if (value.password) {
    const keyBuf = Buffer.from(value.password, "utf8");
    const attr = Buffer.alloc(4 + keyBuf.length);
    attr.writeUInt16BE(0x1027, 0);
    attr.writeUInt16BE(keyBuf.length, 2);
    keyBuf.copy(attr, 4);
    parts.push(attr);
  }

  const payload = Buffer.concat(parts);
  return { tnf: TNF_MEDIA, type: "application/vnd.wfa.wsc", payload };
}

function encodeGeo(value) {
  const uri = `geo:${value.lat},${value.lng}`;
  return encodeURL(uri);
}

function encodePhone(value) {
  const uri = `tel:${value}`;
  return encodeURL(uri);
}

function encodeEmail(value) {
  let uri = `mailto:${value.to || ""}`;
  const params = [];
  if (value.subject) params.push(`subject=${encodeURIComponent(value.subject)}`);
  if (value.body) params.push(`body=${encodeURIComponent(value.body)}`);
  if (params.length) uri += `?${params.join("&")}`;
  return encodeURL(uri);
}

function encodeSMS(value) {
  let uri = `sms:${value.number || ""}`;
  if (value.body) uri += `?body=${encodeURIComponent(value.body)}`;
  return encodeURL(uri);
}
