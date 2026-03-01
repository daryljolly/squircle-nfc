import { useState, useEffect, useCallback, useRef } from "react";
import { useBridge } from "./useBridge.js";

// ─── CONSTANTS ────────────────────────────────────────────
const RECORD_TYPES = [
  { id: "url", label: "URL", icon: "\u{1F517}", cardIcon: "\u{1F310}" },
  { id: "text", label: "Text", icon: "\u{1F4DD}", cardIcon: "\u{1F4C4}" },
  { id: "vcard", label: "Contact", icon: "\u{1F464}", cardIcon: "\u{1F4C7}" },
  { id: "wifi", label: "Wi-Fi", icon: "\u{1F4F6}", cardIcon: "\u{1F4E1}" },
  { id: "phone", label: "Phone", icon: "\u{1F4DE}", cardIcon: "\u{1F4F1}" },
  { id: "email", label: "Email", icon: "\u2709\uFE0F", cardIcon: "\u{1F4E8}" },
  { id: "geo", label: "Location", icon: "\u{1F4CD}", cardIcon: "\u{1F5FA}\uFE0F" },
  { id: "sms", label: "SMS", icon: "\u{1F4AC}", cardIcon: "\u{1F4AC}" },
];

const STARTER_TEMPLATES = [
  { id: "t1", name: "Business Card", icon: "\u{1F4C7}", records: [{ type: "vcard", value: { name: "Your Name", phone: "+1234567890", email: "you@email.com", org: "Squircle Labs" } }] },
  { id: "t2", name: "WiFi Guest", icon: "\u{1F4E1}", records: [{ type: "wifi", value: { ssid: "GuestNetwork", password: "welcome123", encryption: "WPA2" } }] },
  { id: "t3", name: "Website Link", icon: "\u{1F310}", records: [{ type: "url", value: "https://squirclelabs.com" }] },
  { id: "t4", name: "Portfolio", icon: "\u{1F3A8}", records: [{ type: "url", value: "https://portfolio.dev" }] },
];

const MOCK_HISTORY = [
  { id: 1, uid: "04:A2:FB:1A:3C:80:84", action: "read", tag_type: "NTAG215", records: [{ type: "url", value: "https://github.com/squircle" }], created_at: "2026-02-28T14:30:00Z", label: "DJ's GitHub" },
  { id: 2, uid: "04:B7:CC:2D:4E:91:A3", action: "write", tag_type: "NTAG216", records: [{ type: "wifi", value: { ssid: "SelkirkGuest", password: "****", encryption: "WPA2" } }], created_at: "2026-02-27T09:15:00Z", label: "Lab WiFi Tag" },
  { id: 3, uid: "04:A2:FB:1A:3C:80:84", action: "write", tag_type: "NTAG215", records: [{ type: "vcard", value: { name: "DJ", email: "dj@selkirk.ca", org: "Selkirk College" } }], created_at: "2026-02-26T16:45:00Z", label: null },
  { id: 4, uid: "04:D1:EE:5F:7A:B2:C8", action: "erase", tag_type: "NTAG213", records: [], created_at: "2026-02-25T11:00:00Z", label: "Old demo tag" },
  { id: 5, uid: "04:F3:AA:8B:2C:D4:E6", action: "read", tag_type: "NTAG215", records: [{ type: "text", value: "Hello NFC World" }], created_at: "2026-02-24T13:20:00Z", label: null },
];

// ─── HELPERS ──────────────────────────────────────────────
function truncUID(uid) { return uid ? uid.split(":").slice(0, 3).join(":") + "\u2026" : "\u2014"; }

function formatTime(iso) {
  const d = new Date(iso);
  const now = new Date();
  const diff = now - d;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function recordSummary(records) {
  if (!records || records.length === 0) return "Empty";
  const r = records[0];
  if (r.type === "url") return r.value;
  if (r.type === "text") return r.value;
  if (r.type === "vcard") return r.value?.name || "Contact";
  if (r.type === "wifi") return `${r.value?.ssid || "Network"}`;
  if (r.type === "geo") return `${r.value?.lat || "0"}, ${r.value?.lng || "0"}`;
  if (r.type === "phone") return r.value;
  if (r.type === "email") return r.value?.to || r.value;
  return r.type;
}

function actionColor(action) {
  if (action === "read") return "#3b82f6";
  if (action === "write") return "#10b981";
  if (action === "erase") return "#dc2626";
  if (action === "lock") return "#8b5cf6";
  return "#9ca3af";
}
function actionBg(action) {
  if (action === "read") return "#eff6ff";
  if (action === "write") return "#ecfdf5";
  if (action === "erase") return "#fef2f2";
  if (action === "lock") return "#f5f3ff";
  return "#fafaf8";
}

const font = "'Space Grotesk', sans-serif";
const mono = "'Space Mono', monospace";

// ─── STATUS DOT ───────────────────────────────────────────
function StatusDot({ active }) {
  const color = active ? "#10b981" : "#dc2626";
  return (
    <span style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center", width: 10, height: 10 }}>
      <span style={{
        position: "absolute", width: 10, height: 10, borderRadius: "50%", backgroundColor: color,
        animation: active ? "pulse 2s ease-in-out infinite" : "none", opacity: 0.4,
      }} />
      <span style={{ position: "relative", width: 6, height: 6, borderRadius: "50%", backgroundColor: color }} />
    </span>
  );
}

// ─── DONUT CHART ──────────────────────────────────────────
function DonutChart({ used, total }) {
  const pct = total > 0 ? Math.min((used / total) * 100, 100) : 0;
  const r = 54;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  const color = pct > 90 ? "#dc2626" : pct > 70 ? "#f59e0b" : "#10b981";
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%" }}>
      <svg width="140" height="140" viewBox="0 0 140 140">
        <circle cx="70" cy="70" r={r} fill="none" stroke="#e8e5df" strokeWidth="12" />
        <circle cx="70" cy="70" r={r} fill="none" stroke={color} strokeWidth="12"
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round" transform="rotate(-90 70 70)"
          style={{ transition: "stroke-dashoffset 0.8s cubic-bezier(0.22,1,0.36,1), stroke 0.3s" }}
        />
      </svg>
      <div style={{ position: "absolute", textAlign: "center" }}>
        <div style={{ fontSize: 28, fontWeight: 700, fontFamily: font, color: "#1a1a1a" }}>{Math.round(pct)}%</div>
        <div style={{ fontSize: 11, color: "#9ca3af", fontFamily: font, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.08em" }}>used</div>
      </div>
    </div>
  );
}

// ─── TAG CARD VISUAL ──────────────────────────────────────
function TagCard({ tag }) {
  return (
    <div style={{
      background: "linear-gradient(135deg, #059669, #34d399)", borderRadius: 24, padding: "28px 32px",
      color: "#fff", position: "relative", overflow: "hidden", aspectRatio: "1.6",
      display: "flex", flexDirection: "column", justifyContent: "space-between",
      animation: "popIn 0.4s cubic-bezier(0.22,1,0.36,1)",
    }}>
      {/* Decorative circles */}
      <div style={{ position: "absolute", top: -30, right: -30, width: 120, height: 120, borderRadius: "50%", background: "rgba(255,255,255,0.1)" }} />
      <div style={{ position: "absolute", bottom: -20, left: -20, width: 80, height: 80, borderRadius: "50%", background: "rgba(255,255,255,0.06)" }} />
      <div style={{ position: "absolute", top: "50%", right: 40, width: 60, height: 60, borderRadius: "50%", background: "rgba(255,255,255,0.05)", transform: "translateY(-50%)" }} />

      {/* Top: chip icon + NFC waves */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", position: "relative" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Chip icon */}
          <svg width="36" height="28" viewBox="0 0 36 28" fill="none">
            <rect x="1" y="1" width="34" height="26" rx="4" stroke="rgba(255,255,255,0.6)" strokeWidth="1.5" />
            <rect x="8" y="8" width="20" height="12" rx="2" fill="rgba(255,255,255,0.25)" />
            <line x1="14" y1="8" x2="14" y2="20" stroke="rgba(255,255,255,0.4)" strokeWidth="1" />
            <line x1="22" y1="8" x2="22" y2="20" stroke="rgba(255,255,255,0.4)" strokeWidth="1" />
            <line x1="8" y1="14" x2="28" y2="14" stroke="rgba(255,255,255,0.4)" strokeWidth="1" />
          </svg>
          {/* NFC waves */}
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" strokeLinecap="round">
            <path d="M6 18C6 12 12 6 18 6" /><path d="M6 14C6 10 10 6 14 6" /><path d="M6 10C6 8 8 6 10 6" />
          </svg>
        </div>
        <div style={{ fontSize: 11, fontWeight: 600, fontFamily: mono, background: "rgba(255,255,255,0.2)", padding: "4px 12px", borderRadius: 20, backdropFilter: "blur(4px)" }}>
          {tag.type}
        </div>
      </div>

      {/* Bottom: UID + stats */}
      <div style={{ position: "relative" }}>
        <div style={{ fontSize: 17, fontFamily: mono, letterSpacing: "0.12em", marginBottom: 12, fontWeight: 400, opacity: 0.95 }}>
          {tag.uid}
        </div>
        <div style={{ display: "flex", gap: 20 }}>
          {[
            ["Capacity", `${tag.capacity}B`],
            ["Writable", tag.writable ? "Yes" : "Locked"],
            ["Records", `${tag.records?.length || 0}`],
          ].map(([l, v]) => (
            <div key={l}>
              <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", opacity: 0.6, fontFamily: font, fontWeight: 600 }}>{l}</div>
              <div style={{ fontSize: 14, fontWeight: 600, fontFamily: font }}>{v}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── RECORD FORM FIELDS ──────────────────────────────────
function RecordFields({ record, onChange }) {
  const update = (key, val) => onChange({ ...record, value: typeof record.value === "object" ? { ...record.value, [key]: val } : val });
  const inputStyle = {
    width: "100%", padding: "12px 16px", backgroundColor: "#fafaf8", border: "1px solid #e8e6e1",
    borderRadius: 14, color: "#1a1a1a", fontSize: 13, fontFamily: mono, outline: "none",
    transition: "border-color 0.2s, box-shadow 0.2s",
  };
  const labelStyle = { fontSize: 11, color: "#9ca3af", fontFamily: font, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 };
  const focusHandlers = {
    onFocus: (e) => { e.target.style.borderColor = "#10b981"; e.target.style.boxShadow = "0 0 0 3px rgba(16,185,129,0.1)"; },
    onBlur: (e) => { e.target.style.borderColor = "#e8e6e1"; e.target.style.boxShadow = "none"; },
  };
  switch (record.type) {
    case "url": return (
      <div><div style={labelStyle}>URL</div><input style={inputStyle} placeholder="https://example.com" value={record.value || ""} onChange={e => onChange({ ...record, value: e.target.value })} {...focusHandlers} /></div>
    );
    case "text": return (
      <div><div style={labelStyle}>Text Content</div><textarea style={{ ...inputStyle, minHeight: 80, resize: "vertical" }} placeholder="Hello NFC world" value={record.value || ""} onChange={e => onChange({ ...record, value: e.target.value })} {...focusHandlers} /></div>
    );
    case "vcard": return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {[["name", "Full Name"], ["phone", "Phone"], ["email", "Email"], ["org", "Organization"]].map(([k, l]) => (
          <div key={k}><div style={labelStyle}>{l}</div><input style={inputStyle} placeholder={l} value={record.value?.[k] || ""} onChange={e => update(k, e.target.value)} {...focusHandlers} /></div>
        ))}
      </div>
    );
    case "wifi": return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div><div style={labelStyle}>SSID</div><input style={inputStyle} placeholder="Network name" value={record.value?.ssid || ""} onChange={e => update("ssid", e.target.value)} {...focusHandlers} /></div>
        <div><div style={labelStyle}>Password</div><input style={inputStyle} type="password" placeholder="Password" value={record.value?.password || ""} onChange={e => update("password", e.target.value)} {...focusHandlers} /></div>
        <div><div style={labelStyle}>Encryption</div>
          <select style={{ ...inputStyle, cursor: "pointer" }} value={record.value?.encryption || "WPA2"} onChange={e => update("encryption", e.target.value)}>
            <option value="WPA2">WPA2</option><option value="WPA3">WPA3</option><option value="WEP">WEP</option><option value="OPEN">Open</option>
          </select>
        </div>
      </div>
    );
    case "geo": return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div><div style={labelStyle}>Latitude</div><input style={inputStyle} placeholder="49.3267" value={record.value?.lat || ""} onChange={e => update("lat", e.target.value)} {...focusHandlers} /></div>
          <div><div style={labelStyle}>Longitude</div><input style={inputStyle} placeholder="-117.6593" value={record.value?.lng || ""} onChange={e => update("lng", e.target.value)} {...focusHandlers} /></div>
        </div>
        <button style={{
          padding: "10px 16px", background: "linear-gradient(135deg, #059669, #34d399)", border: "none",
          borderRadius: 12, color: "#fff", fontSize: 12, fontFamily: font, fontWeight: 600, cursor: "pointer",
        }} onClick={() => {
          if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
              (pos) => onChange({ ...record, value: { lat: pos.coords.latitude.toFixed(6), lng: pos.coords.longitude.toFixed(6) } }),
              () => {}
            );
          }
        }}>{"\u{1F4CD}"} Use My Location</button>
      </div>
    );
    case "phone": return (
      <div><div style={labelStyle}>Phone Number</div><input style={inputStyle} placeholder="+1 250 555 0123" value={record.value || ""} onChange={e => onChange({ ...record, value: e.target.value })} {...focusHandlers} /></div>
    );
    case "email": return (
      <div style={{ display: "grid", gap: 12 }}>
        <div><div style={labelStyle}>To</div><input style={inputStyle} placeholder="someone@email.com" value={record.value?.to || ""} onChange={e => update("to", e.target.value)} {...focusHandlers} /></div>
        <div><div style={labelStyle}>Subject</div><input style={inputStyle} placeholder="Subject line" value={record.value?.subject || ""} onChange={e => update("subject", e.target.value)} {...focusHandlers} /></div>
        <div><div style={labelStyle}>Body</div><textarea style={{ ...inputStyle, minHeight: 60, resize: "vertical" }} placeholder="Message body" value={record.value?.body || ""} onChange={e => update("body", e.target.value)} {...focusHandlers} /></div>
      </div>
    );
    case "sms": return (
      <div style={{ display: "grid", gap: 12 }}>
        <div><div style={labelStyle}>Phone Number</div><input style={inputStyle} placeholder="+1 250 555 0123" value={record.value?.number || ""} onChange={e => update("number", e.target.value)} {...focusHandlers} /></div>
        <div><div style={labelStyle}>Message</div><textarea style={{ ...inputStyle, minHeight: 60, resize: "vertical" }} placeholder="Pre-composed message" value={record.value?.body || ""} onChange={e => update("body", e.target.value)} {...focusHandlers} /></div>
      </div>
    );
    default: return null;
  }
}

// ─── LOCK MODAL ───────────────────────────────────────────
function LockModal({ onConfirm, onCancel }) {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center",
      backgroundColor: "rgba(0,0,0,0.25)", backdropFilter: "blur(8px)",
    }} onClick={onCancel}>
      <div onClick={e => e.stopPropagation()} style={{
        backgroundColor: "#fff", borderRadius: 24, boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
        padding: "36px 40px", maxWidth: 420, width: "90%", animation: "popIn 0.3s ease",
      }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>{"\u{1F512}"}</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: "#1a1a1a", marginBottom: 8, fontFamily: font }}>
          Lock Tag?
        </div>
        <p style={{ color: "#6b7280", fontSize: 14, lineHeight: 1.7, marginBottom: 28, fontFamily: font }}>
          This action is <span style={{ color: "#dc2626", fontWeight: 700 }}>permanent</span>. Once locked, this tag can never be written to or erased again. The current data will be frozen forever.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
          <button onClick={onCancel} style={{
            padding: "11px 24px", borderRadius: 14, border: "1px solid #e8e6e1",
            backgroundColor: "transparent", color: "#6b7280", cursor: "pointer", fontSize: 14, fontWeight: 600, fontFamily: font,
          }}>Cancel</button>
          <button onClick={onConfirm} style={{
            padding: "11px 24px", borderRadius: 14, border: "none",
            backgroundColor: "#dc2626", color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 600, fontFamily: font,
          }}>Lock Forever</button>
        </div>
      </div>
    </div>
  );
}

// ─── SETUP GUIDE ──────────────────────────────────────────
function SetupGuide() {
  const [copied, setCopied] = useState(false);
  const steps = [
    { num: 1, title: "Install ACS Driver", desc: "Download and install the ACR1252U driver from ACS." },
    { num: 2, title: "Install Node.js", desc: "macOS: brew install node \u2022 Or download from nodejs.org" },
    { num: 3, title: "Run the Bridge", cmd: "npx squircle-nfc-bridge" },
    { num: 4, title: "Connect Reader", desc: "Plug in your ACR1252U via USB. The bridge will detect it automatically." },
  ];
  return (
    <div style={{ maxWidth: 520, margin: "0 auto", padding: "80px 24px", animation: "popIn 0.5s ease" }}>
      <div style={{ textAlign: "center", marginBottom: 48 }}>
        <div style={{
          width: 80, height: 80, borderRadius: 24, background: "linear-gradient(135deg, #ecfdf5, #d1fae5)", margin: "0 auto 24px",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36,
        }}>{"\u26A1"}</div>
        <h2 style={{ fontSize: 28, fontWeight: 800, color: "#1a1a1a", fontFamily: font, marginBottom: 10 }}>
          Bridge Not Connected
        </h2>
        <p style={{ color: "#6b7280", fontSize: 15, maxWidth: 400, margin: "0 auto", fontFamily: font, lineHeight: 1.6 }}>
          The local bridge relays commands between this dashboard and your NFC reader. Follow these steps to get started.
        </p>
      </div>
      <div style={{ display: "grid", gap: 14 }}>
        {steps.map((s, i) => (
          <div key={s.num} style={{
            display: "flex", gap: 16, padding: "20px 24px", borderRadius: 20,
            backgroundColor: "#fff", boxShadow: "0 2px 12px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)",
            animation: `popIn 0.4s ease ${i * 0.08}s both`,
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: "50%", background: "linear-gradient(135deg, #059669, #34d399)",
              color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 15, fontWeight: 700, fontFamily: font, flexShrink: 0,
            }}>{s.num}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#1a1a1a", marginBottom: 4, fontFamily: font }}>{s.title}</div>
              {s.cmd ? (
                <div style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "10px 14px",
                  backgroundColor: "#ecfdf5", borderRadius: 12, marginTop: 4,
                }}>
                  <code style={{ flex: 1, color: "#059669", fontFamily: mono, fontSize: 13 }}>{s.cmd}</code>
                  <button onClick={() => { navigator.clipboard.writeText(s.cmd); setCopied(true); setTimeout(() => setCopied(false), 2000); }} style={{
                    padding: "4px 12px", borderRadius: 8, border: "1px solid rgba(5,150,105,0.2)", backgroundColor: "transparent",
                    color: "#059669", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: font,
                  }}>{copied ? "Copied!" : "Copy"}</button>
                </div>
              ) : (
                <div style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.6, fontFamily: font }}>{s.desc}</div>
              )}
            </div>
          </div>
        ))}
      </div>
      <div style={{ textAlign: "center", marginTop: 32 }}>
        <p style={{ fontSize: 12, color: "#9ca3af", fontFamily: font }}>
          Tip: On macOS, if the reader isn't detected, you may need to disable com.apple.ifdreader
        </p>
      </div>
    </div>
  );
}

// ─── WAITING STATE ────────────────────────────────────────
function WaitingState() {
  return (
    <div style={{
      gridColumn: "1 / -1", display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", padding: "80px 20px", backgroundColor: "#fff", borderRadius: 24,
      boxShadow: "0 2px 12px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)",
      animation: "popIn 0.5s ease",
    }}>
      <div style={{ position: "relative", width: 140, height: 140, marginBottom: 32 }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            position: "absolute", inset: `${i * 20}px`, borderRadius: "50%",
            border: "2px solid rgba(16,185,129,0.15)",
            animation: `ripple 2.4s ease-in-out ${i * 0.4}s infinite`,
          }} />
        ))}
        <div style={{
          position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="1.5" strokeLinecap="round" opacity="0.6">
            <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" fill="#10b981" opacity="0.5" />
          </svg>
        </div>
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, color: "#1a1a1a", fontFamily: font, marginBottom: 8 }}>
        Place a tag on the reader
      </div>
      <div style={{ fontSize: 14, color: "#9ca3af", fontFamily: font }}>
        The dashboard will detect it automatically
      </div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────
export default function NFCDashboard() {
  const bridge = useBridge();

  const bridgeStatus = bridge.bridgeStatus;
  const readerStatus = bridge.bridgeStatus === "connected" ? bridge.readerStatus : "connected";

  const mockTag = {
    uid: "04:A2:FB:1A:3C:80:84", type: "NTAG215", capacity: 504, used: 137, writable: true,
    records: [{ type: "url", value: "https://github.com/squircle" }],
  };
  const tag = bridge.bridgeStatus === "connected" ? bridge.tag : mockTag;

  const [activeTab, setActiveTab] = useState("history");
  const [showLockModal, setShowLockModal] = useState(false);
  const [writeRecords, setWriteRecords] = useState([{ type: "url", value: "" }]);
  const [history] = useState(MOCK_HISTORY);
  const [templates] = useState(STARTER_TEMPLATES);
  const [toast, setToast] = useState(null);
  const [opInProgress, setOpInProgress] = useState(null);

  const showToast = useCallback((msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const simulateOp = useCallback((op, duration = 1200) => {
    setOpInProgress(op);
    if (bridge.bridgeStatus === "connected") {
      const opFn = op === "read" ? bridge.readTag
        : op === "write" ? () => bridge.writeTag(writeRecords)
        : op === "erase" ? bridge.eraseTag
        : op === "lock" ? bridge.lockTag
        : null;
      if (opFn) {
        opFn()
          .then(() => { setOpInProgress(null); showToast(op === "read" ? "Tag read successfully" : op === "write" ? "Tag written!" : op === "erase" ? "Tag erased" : "Tag locked", "success"); })
          .catch((err) => { setOpInProgress(null); showToast(err.message, "error"); });
        return;
      }
    }
    setTimeout(() => { setOpInProgress(null); showToast(op === "read" ? "Tag read" : op === "write" ? "Tag written!" : op === "erase" ? "Tag erased" : "Tag locked", "success"); }, duration);
  }, [bridge, writeRecords, showToast]);

  const addRecord = () => setWriteRecords([...writeRecords, { type: "url", value: "" }]);
  const removeRecord = (i) => setWriteRecords(writeRecords.filter((_, idx) => idx !== i));
  const updateRecord = (i, rec) => setWriteRecords(writeRecords.map((r, idx) => idx === i ? rec : r));
  const loadTemplate = (t) => {
    setWriteRecords(JSON.parse(JSON.stringify(t.records)));
    setActiveTab("history");
    showToast(`Loaded "${t.name}"`, "success");
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") return;
      if (e.key === "r" && tag && !opInProgress) simulateOp("read");
      if (e.key === "w" && tag && !opInProgress) simulateOp("write");
      if (e.key === "Escape") setOpInProgress(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [tag, opInProgress, simulateOp]);

  const card = {
    backgroundColor: "#fff", borderRadius: 24, padding: "24px 28px",
    boxShadow: "0 2px 12px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)",
  };

  const actionButtons = [
    { label: "Read", op: "read", color: "#3b82f6", bg: "#eff6ff", icon: "\u2193" },
    { label: "Write", op: "write", color: "#10b981", bg: "#ecfdf5", icon: "\u2191" },
    { label: "Erase", op: "erase", color: "#dc2626", bg: "#fef2f2", icon: "\u2715" },
    { label: "Lock", op: "lock", color: "#8b5cf6", bg: "#f5f3ff", icon: "\u{1F512}" },
  ];

  const toastMap = { success: { bg: "#ecfdf5", color: "#059669", border: "#05966933" }, error: { bg: "#fef2f2", color: "#dc2626", border: "#dc262633" }, info: { bg: "#eff6ff", color: "#3b82f6", border: "#3b82f633" } };

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#f0ede8", fontFamily: font }}>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::selection { background: #d1fae5; color: #059669; }
        input:focus, textarea:focus, select:focus { border-color: #10b981 !important; outline: none; box-shadow: 0 0 0 3px rgba(16,185,129,0.1) !important; }
        select option { background: #fff; color: #1a1a1a; }
        @keyframes pulse { 0%, 100% { transform: scale(1); opacity: 0.4; } 50% { transform: scale(1.8); opacity: 0; } }
        @keyframes ripple { 0% { transform: scale(0.8); opacity: 0.6; } 50% { transform: scale(1.1); opacity: 0; } 100% { transform: scale(0.8); opacity: 0; } }
        @keyframes popIn { from { opacity: 0; transform: scale(0.95) translateY(8px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        @keyframes slideToast { from { opacity: 0; transform: translateX(-50%) translateY(-12px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
        ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #e8e6e1; border-radius: 3px; } ::-webkit-scrollbar-thumb:hover { background: #d1d0cd; }
      `}</style>

      {/* TOAST */}
      {toast && (
        <div style={{
          position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)", zIndex: 1001,
          padding: "12px 24px", borderRadius: 16, fontSize: 13, fontWeight: 600, fontFamily: font,
          backgroundColor: toastMap[toast.type]?.bg || "#ecfdf5",
          color: toastMap[toast.type]?.color || "#059669",
          border: `1px solid ${toastMap[toast.type]?.border || "#05966933"}`,
          animation: "slideToast 0.3s ease", boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
        }}>{toast.msg}</div>
      )}

      {showLockModal && <LockModal onConfirm={() => { setShowLockModal(false); simulateOp("lock"); }} onCancel={() => setShowLockModal(false)} />}

      {/* ─── STATUS BAR ────────────────────────────────── */}
      <div style={{
        padding: "0 32px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 68,
        backgroundColor: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
        position: "sticky", top: 0, zIndex: 100,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 12, background: "linear-gradient(135deg, #059669, #34d399)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" fill="#fff" />
            </svg>
          </div>
          <div>
            <span style={{ fontWeight: 700, fontSize: 17, color: "#1a1a1a" }}>NFC Tag Manager</span>
            <span style={{ fontSize: 12, color: "#9ca3af", marginLeft: 10 }}>by Squircle Labs</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {[
            { label: "Bridge", active: bridgeStatus === "connected", detail: bridgeStatus === "connected" ? `v${bridge.bridgeVersion || "1.0.0"}` : "offline" },
            { label: "Reader", active: readerStatus === "connected", detail: readerStatus === "connected" ? (bridge.readerName || "ACR1252U") : "not found" },
            { label: "Tag", active: !!tag, detail: tag ? truncUID(tag.uid) : "no tag" },
          ].map(s => (
            <div key={s.label} style={{
              display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", borderRadius: 14,
              backgroundColor: s.active ? "#ecfdf5" : "#fafaf8",
              transition: "background-color 0.2s",
            }}>
              <StatusDot active={s.active} />
              <div>
                <div style={{ fontSize: 10, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, lineHeight: 1 }}>{s.label}</div>
                <div style={{ fontSize: 11, color: s.active ? "#1a1a1a" : "#9ca3af", fontFamily: mono, lineHeight: 1.4 }}>{s.detail}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ─── MAIN CONTENT ──────────────────────────────── */}
      {bridgeStatus === "disconnected" && bridge.bridgeStatus === "disconnected" ? (
        <SetupGuide />
      ) : (
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 24px 100px" }}>
          {!tag ? (
            <WaitingState />
          ) : (
            <>
              {/* Greeting */}
              <div style={{ marginBottom: 24, animation: "popIn 0.4s ease" }}>
                <h1 style={{ fontSize: 30, fontWeight: 800, color: "#1a1a1a", marginBottom: 4 }}>
                  Tag Connected {"\u2728"}
                </h1>
                <p style={{ fontSize: 15, color: "#6b7280" }}>{tag.type} \u00B7 {tag.capacity} bytes \u00B7 {tag.records?.length || 0} records</p>
              </div>

              {/* BENTO GRID */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 380px", gap: 20 }}>

                {/* Col 1: Tag Card */}
                <div style={{ animation: "popIn 0.4s ease 0.05s both" }}>
                  <TagCard tag={tag} />
                </div>

                {/* Col 2: Donut Chart */}
                <div style={{
                  ...card, display: "flex", alignItems: "center", justifyContent: "center",
                  position: "relative", animation: "popIn 0.4s ease 0.1s both",
                }}>
                  <DonutChart used={tag.used} total={tag.capacity} />
                </div>

                {/* Col 3: Sidebar */}
                <div style={{
                  ...card, padding: 0, gridRow: "1 / 4", overflow: "hidden",
                  display: "flex", flexDirection: "column", maxHeight: "calc(100vh - 180px)",
                  animation: "popIn 0.4s ease 0.15s both",
                }}>
                  {/* Tab toggle */}
                  <div style={{ padding: "16px 20px 0", flexShrink: 0 }}>
                    <div style={{
                      display: "flex", backgroundColor: "#f0ede8", borderRadius: 12, padding: 3,
                    }}>
                      {[["history", "History"], ["templates", "Templates"]].map(([id, label]) => (
                        <button key={id} onClick={() => setActiveTab(id)} style={{
                          flex: 1, padding: "10px 0", borderRadius: 10, border: "none", cursor: "pointer",
                          fontSize: 13, fontWeight: 600, fontFamily: font, transition: "all 0.2s",
                          backgroundColor: activeTab === id ? "#fff" : "transparent",
                          color: activeTab === id ? "#1a1a1a" : "#9ca3af",
                          boxShadow: activeTab === id ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                        }}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div style={{ padding: "14px 20px 20px", overflowY: "auto", flex: 1 }}>
                    {activeTab === "history" && (
                      <div>
                        {history.map((h, i) => (
                          <div key={h.id} style={{
                            padding: "12px 14px", borderRadius: 16, marginBottom: 8,
                            backgroundColor: "#fafaf8", transition: "transform 0.15s", cursor: "pointer",
                            animation: `popIn 0.3s ease ${i * 0.04}s both`,
                          }}
                            onMouseEnter={e => e.currentTarget.style.transform = "translateY(-1px)"}
                            onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{
                                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                                  width: 24, height: 24, borderRadius: 8,
                                  backgroundColor: actionBg(h.action), color: actionColor(h.action), fontSize: 11,
                                }}>{h.action === "read" ? "\u2193" : h.action === "write" ? "\u2191" : h.action === "erase" ? "\u2715" : "\u{1F512}"}</span>
                                <span style={{ fontSize: 11, color: "#9ca3af", fontFamily: mono }}>{truncUID(h.uid)}</span>
                              </div>
                              <span style={{ fontSize: 10, color: "#9ca3af", fontFamily: mono }}>{formatTime(h.created_at)}</span>
                            </div>
                            {h.label && <div style={{ fontSize: 12, color: "#1a1a1a", fontWeight: 500, marginBottom: 2 }}>{h.label}</div>}
                            <div style={{ fontSize: 11, color: "#9ca3af", fontFamily: mono, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {recordSummary(h.records)}
                            </div>
                            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                              <button onClick={(e) => { e.stopPropagation(); setWriteRecords(JSON.parse(JSON.stringify(h.records))); showToast("Loaded into write panel", "success"); }} style={{
                                padding: "4px 10px", fontSize: 10, borderRadius: 8, border: "none", cursor: "pointer",
                                backgroundColor: "#ecfdf5", color: "#059669", fontWeight: 600, fontFamily: font,
                              }}>Re-write</button>
                              <button style={{
                                padding: "4px 10px", fontSize: 10, borderRadius: 8, border: "1px solid #e8e6e1",
                                backgroundColor: "transparent", color: "#9ca3af", cursor: "pointer", fontWeight: 600, fontFamily: font,
                              }}>Label</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {activeTab === "templates" && (
                      <div>
                        {templates.map((t, i) => (
                          <div key={t.id} style={{
                            padding: "14px 16px", borderRadius: 16, marginBottom: 8,
                            backgroundColor: "#fafaf8", display: "flex", alignItems: "center", gap: 12,
                            animation: `popIn 0.3s ease ${i * 0.04}s both`,
                          }}>
                            <div style={{
                              width: 40, height: 40, borderRadius: 12, backgroundColor: "#ecfdf5",
                              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0,
                            }}>{t.icon}</div>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a", marginBottom: 2 }}>{t.name}</div>
                              <div style={{ fontSize: 11, color: "#9ca3af", fontFamily: mono }}>
                                {t.records.length} rec \u00B7 {t.records.map(r => r.type).join(", ")}
                              </div>
                            </div>
                            <button onClick={() => loadTemplate(t)} style={{
                              padding: "6px 14px", fontSize: 11, borderRadius: 10, cursor: "pointer",
                              border: "1px solid #10b981", backgroundColor: "transparent",
                              color: "#059669", fontWeight: 600, fontFamily: font,
                            }}>Use</button>
                          </div>
                        ))}
                        <button style={{
                          width: "100%", padding: "12px", borderRadius: 14, marginTop: 8,
                          border: "1px dashed rgba(16,185,129,0.4)", backgroundColor: "transparent",
                          color: "#059669", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: font,
                        }}>+ Save Current as Template</button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Row 2: Action Buttons + Current Records (span cols 1-2) */}
                <div style={{ gridColumn: "1 / 3", animation: "popIn 0.4s ease 0.2s both" }}>
                  {/* Action Buttons */}
                  <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
                    {actionButtons.map(a => (
                      <button key={a.op}
                        disabled={opInProgress !== null}
                        onClick={() => a.op === "lock" ? setShowLockModal(true) : simulateOp(a.op)}
                        style={{
                          flex: 1, padding: "16px", borderRadius: 18, border: "none", cursor: "pointer",
                          fontSize: 14, fontWeight: 600, fontFamily: font, display: "flex", alignItems: "center",
                          justifyContent: "center", gap: 8, transition: "all 0.15s",
                          backgroundColor: opInProgress === a.op ? a.color : a.bg,
                          color: opInProgress === a.op ? "#fff" : a.color,
                          opacity: opInProgress && opInProgress !== a.op ? 0.5 : 1,
                          boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
                        }}
                        onMouseEnter={e => { if (!opInProgress) { e.currentTarget.style.backgroundColor = a.color; e.currentTarget.style.color = "#fff"; e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.1)"; }}}
                        onMouseLeave={e => { if (!opInProgress) { e.currentTarget.style.backgroundColor = a.bg; e.currentTarget.style.color = a.color; e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.04)"; }}}
                      >
                        <span>{a.icon}</span>
                        {opInProgress === a.op ? "\u2026" : a.label}
                      </button>
                    ))}
                  </div>

                  {/* Current Records */}
                  {tag.records?.length > 0 && (
                    <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4 }}>
                      {tag.records.map((r, i) => (
                        <div key={i} style={{
                          ...card, padding: "14px 18px", display: "flex", alignItems: "center", gap: 10,
                          minWidth: 200, flex: "0 0 auto",
                        }}>
                          <span style={{ fontSize: 22 }}>{RECORD_TYPES.find(t => t.id === r.type)?.icon || "\u{1F4E6}"}</span>
                          <div>
                            <div style={{ fontSize: 10, color: "#9ca3af", textTransform: "uppercase", fontWeight: 600, letterSpacing: "0.04em" }}>{r.type}</div>
                            <div style={{ fontSize: 13, color: "#1a1a1a", fontFamily: mono, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{recordSummary([r])}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Row 3: Write Panel (span cols 1-2) */}
                <div style={{ gridColumn: "1 / 3", ...card, animation: "popIn 0.4s ease 0.25s both" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: "#1a1a1a" }}>Write Records</div>
                    <div style={{ fontSize: 12, color: "#9ca3af", fontFamily: mono }}>
                      ~{Math.min(writeRecords.length * 40, tag.capacity)}/{tag.capacity} bytes
                    </div>
                  </div>

                  {writeRecords.map((rec, i) => (
                    <div key={i} style={{ marginBottom: 20, position: "relative" }}>
                      {writeRecords.length > 1 && (
                        <button onClick={() => removeRecord(i)} style={{
                          position: "absolute", top: 0, right: 0, width: 28, height: 28, borderRadius: 8, zIndex: 2,
                          border: "1px solid #e8e6e1", backgroundColor: "#fff", color: "#9ca3af",
                          cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center",
                        }}>{"\u2715"}</button>
                      )}

                      {/* Type selector as visual cards */}
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 18 }}>
                        {RECORD_TYPES.slice(0, 8).map(rt => (
                          <button key={rt.id}
                            onClick={() => updateRecord(i, { type: rt.id, value: rt.id === "vcard" || rt.id === "wifi" || rt.id === "geo" || rt.id === "email" || rt.id === "sms" ? {} : "" })}
                            style={{
                              padding: "14px 8px", borderRadius: 16, border: "none", cursor: "pointer",
                              display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                              transition: "all 0.15s",
                              background: rec.type === rt.id ? "linear-gradient(135deg, #059669, #34d399)" : "#fafaf8",
                              color: rec.type === rt.id ? "#fff" : "#6b7280",
                            }}
                          >
                            <span style={{ fontSize: 22 }}>{rt.cardIcon}</span>
                            <span style={{ fontSize: 11, fontWeight: 600, fontFamily: font }}>{rt.label}</span>
                          </button>
                        ))}
                      </div>

                      <RecordFields record={rec} onChange={r => updateRecord(i, r)} />
                    </div>
                  ))}

                  <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
                    <button onClick={addRecord} style={{
                      flex: 1, padding: "14px", borderRadius: 16, cursor: "pointer",
                      border: "1px dashed rgba(16,185,129,0.4)", backgroundColor: "transparent",
                      color: "#059669", fontSize: 13, fontWeight: 600, fontFamily: font,
                    }}>+ Add Record</button>
                    <button
                      disabled={!tag || opInProgress !== null}
                      onClick={() => simulateOp("write", 1500)}
                      style={{
                        flex: 2, padding: "16px", borderRadius: 16, border: "none", cursor: "pointer",
                        background: "linear-gradient(135deg, #059669, #34d399)", color: "#fff",
                        fontSize: 15, fontWeight: 700, fontFamily: font,
                        opacity: !tag ? 0.5 : 1, transition: "all 0.15s",
                        boxShadow: "0 4px 16px rgba(16,185,129,0.3)",
                      }}
                      onMouseEnter={e => { if (tag && !opInProgress) { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 6px 24px rgba(16,185,129,0.4)"; }}}
                      onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 4px 16px rgba(16,185,129,0.3)"; }}
                    >
                      {opInProgress === "write" ? "Writing\u2026" : "\u26A1 Write to Tag"}
                    </button>
                  </div>
                </div>

              </div>
            </>
          )}
        </div>
      )}

      {/* ─── KEYBOARD SHORTCUTS ─────────────────────────── */}
      <div style={{
        position: "fixed", bottom: 16, left: "50%", transform: "translateX(-50%)",
        display: "flex", gap: 16, padding: "10px 24px", borderRadius: 18,
        backgroundColor: "#fff", boxShadow: "0 4px 20px rgba(0,0,0,0.08)", zIndex: 50,
      }}>
        {[["R", "Read"], ["W", "Write"], ["Esc", "Cancel"]].map(([key, label]) => (
          <div key={key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <kbd style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              minWidth: 28, height: 26, padding: "0 6px", borderRadius: 8, fontSize: 11,
              fontFamily: mono, fontWeight: 700, backgroundColor: "#f0ede8", color: "#6b7280",
              border: "1px solid #e8e6e1", boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
            }}>{key}</kbd>
            <span style={{ fontSize: 12, color: "#9ca3af", fontFamily: font }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
