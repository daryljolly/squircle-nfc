import { useState, useEffect, useCallback } from "react";
import { useBridge } from "./useBridge.js";

// ─── SVG ICONS ────────────────────────────────────────────
const svgProps = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" };
const Icon = ({ children, size = 24, ...rest }) => <svg width={size} height={size} {...svgProps} {...rest}>{children}</svg>;

const Icons = {
  url: (p) => <Icon {...p}><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" /></Icon>,
  text: (p) => <Icon {...p}><line x1="4" y1="6" x2="20" y2="6" /><line x1="4" y1="10" x2="20" y2="10" /><line x1="4" y1="14" x2="16" y2="14" /><line x1="4" y1="18" x2="12" y2="18" /></Icon>,
  vcard: (p) => <Icon {...p}><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></Icon>,
  wifi: (p) => <Icon {...p}><path d="M5 12.55a11 11 0 0114 0" /><path d="M8.53 16.11a6 6 0 016.95 0" /><circle cx="12" cy="20" r="1" fill="currentColor" stroke="none" /></Icon>,
  phone: (p) => <Icon {...p}><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" /></Icon>,
  email: (p) => <Icon {...p}><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M22 7l-10 7L2 7" /></Icon>,
  geo: (p) => <Icon {...p}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" /></Icon>,
  sms: (p) => <Icon {...p}><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></Icon>,
  read: (p) => <Icon {...p}><path d="M12 3v12" /><path d="M5 12l7 7 7-7" /><path d="M5 20h14" /></Icon>,
  write: (p) => <Icon {...p}><path d="M12 21V9" /><path d="M5 12l7-7 7 7" /><path d="M5 4h14" /></Icon>,
  erase: (p) => <Icon {...p}><circle cx="12" cy="12" r="10" /><path d="M15 9l-6 6M9 9l6 6" /></Icon>,
  lock: (p) => <Icon {...p}><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></Icon>,
  nfcWaves: (p) => <Icon {...p}><path d="M6 18C6 12 12 6 18 6" /><path d="M6 14C6 10 10 6 14 6" /><path d="M6 10C6 8 8 6 10 6" /></Icon>,
  check: (p) => <Icon {...p}><path d="M20 6L9 17l-5-5" /></Icon>,
  x: (p) => <Icon {...p}><path d="M18 6L6 18M6 6l12 12" /></Icon>,
  lockLarge: (p) => <Icon size={48} {...p}><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></Icon>,
};

const recordIcon = (type, size = 20) => {
  const Fn = Icons[type];
  return Fn ? <Fn size={size} /> : <Icons.text size={size} />;
};
const actionIcon = (action, size = 16) => {
  const Fn = Icons[action];
  return Fn ? <Fn size={size} /> : null;
};

// ─── CONSTANTS ────────────────────────────────────────────
const RECORD_TYPES = [
  { id: "url", label: "URL" },
  { id: "text", label: "Text" },
  { id: "vcard", label: "Contact" },
  { id: "wifi", label: "Wi-Fi" },
  { id: "phone", label: "Phone" },
  { id: "email", label: "Email" },
  { id: "geo", label: "Location" },
  { id: "sms", label: "SMS" },
];

const STARTER_TEMPLATES = [
  { id: "t1", name: "Business Card", type: "vcard", records: [{ type: "vcard", value: { name: "Your Name", phone: "+1234567890", email: "you@email.com", org: "Squircle Labs" } }] },
  { id: "t2", name: "WiFi Guest", type: "wifi", records: [{ type: "wifi", value: { ssid: "GuestNetwork", password: "welcome123", encryption: "WPA2" } }] },
  { id: "t3", name: "Website Link", type: "url", records: [{ type: "url", value: "https://squirclelabs.com" }] },
  { id: "t4", name: "Portfolio", type: "url", records: [{ type: "url", value: "https://portfolio.dev" }] },
];

const MOCK_HISTORY = [
  { id: 1, uid: "04:A2:FB:1A:3C:80:84", action: "read", records: [{ type: "url", value: "https://github.com/squircle" }], created_at: "2026-02-28T14:30:00Z", label: "DJ's GitHub" },
  { id: 2, uid: "04:B7:CC:2D:4E:91:A3", action: "write", records: [{ type: "wifi", value: { ssid: "SelkirkGuest" } }], created_at: "2026-02-27T09:15:00Z", label: "Lab WiFi Tag" },
  { id: 3, uid: "04:A2:FB:1A:3C:80:84", action: "write", records: [{ type: "vcard", value: { name: "DJ" } }], created_at: "2026-02-26T16:45:00Z", label: null },
  { id: 4, uid: "04:D1:EE:5F:7A:B2:C8", action: "erase", records: [], created_at: "2026-02-25T11:00:00Z", label: "Old demo tag" },
  { id: 5, uid: "04:F3:AA:8B:2C:D4:E6", action: "read", records: [{ type: "text", value: "Hello NFC World" }], created_at: "2026-02-24T13:20:00Z", label: null },
];

// ─── HELPERS ──────────────────────────────────────────────
const F = "'Space Grotesk', sans-serif";
const M = "'Space Mono', monospace";

function truncUID(uid) { return uid ? uid.split(":").slice(0, 3).join(":") + "\u2026" : "\u2014"; }
function formatTime(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function recordSummary(records) {
  if (!records?.length) return "Empty";
  const r = records[0];
  if (r.type === "url") return r.value;
  if (r.type === "text") return r.value;
  if (r.type === "vcard") return r.value?.name || "Contact";
  if (r.type === "wifi") return r.value?.ssid || "Network";
  if (r.type === "geo") return `${r.value?.lat || "0"}, ${r.value?.lng || "0"}`;
  if (r.type === "phone") return r.value;
  if (r.type === "email") return r.value?.to || r.value;
  return r.type;
}
function actionColor(a) { return { read: "#3b82f6", write: "#10b981", erase: "#dc2626", lock: "#8b5cf6" }[a] || "#9ca3af"; }
function actionBg(a) { return { read: "#eff6ff", write: "#ecfdf5", erase: "#fef2f2", lock: "#f5f3ff" }[a] || "#fafaf8"; }

// ─── SMALL COMPONENTS ─────────────────────────────────────
function StatusDot({ active }) {
  const c = active ? "#10b981" : "#dc2626";
  return (
    <span style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center", width: 10, height: 10 }}>
      <span style={{ position: "absolute", width: 10, height: 10, borderRadius: "50%", backgroundColor: c, animation: active ? "pulse 2s ease-in-out infinite" : "none", opacity: 0.4 }} />
      <span style={{ position: "relative", width: 6, height: 6, borderRadius: "50%", backgroundColor: c }} />
    </span>
  );
}

function DonutChart({ used, total }) {
  const pct = total > 0 ? Math.min((used / total) * 100, 100) : 0;
  const r = 50, circ = 2 * Math.PI * r, offset = circ - (pct / 100) * circ;
  const color = pct > 90 ? "#dc2626" : pct > 70 ? "#f59e0b" : "#10b981";
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", position: "relative" }}>
      <svg width="120" height="120" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={r} fill="none" stroke="#e8e5df" strokeWidth="12" />
        <circle cx="60" cy="60" r={r} fill="none" stroke={color} strokeWidth="12"
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          transform="rotate(-90 60 60)" style={{ transition: "stroke-dashoffset 0.8s cubic-bezier(0.22,1,0.36,1), stroke 0.3s" }} />
      </svg>
      <div style={{ position: "absolute", textAlign: "center" }}>
        <div style={{ fontSize: 24, fontWeight: 700, fontFamily: F, color: "#1a1a1a" }}>{Math.round(pct)}%</div>
        <div style={{ fontSize: 10, color: "#9ca3af", fontFamily: F, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>used</div>
      </div>
    </div>
  );
}

function TagCard({ tag }) {
  return (
    <div style={{
      background: "linear-gradient(135deg, #059669, #34d399)", borderRadius: 20, padding: "20px 24px",
      color: "#fff", position: "relative", overflow: "hidden", height: "100%",
      display: "flex", flexDirection: "column", justifyContent: "space-between",
    }}>
      <div style={{ position: "absolute", top: -30, right: -30, width: 100, height: 100, borderRadius: "50%", background: "rgba(255,255,255,0.1)" }} />
      <div style={{ position: "absolute", bottom: -15, left: -15, width: 60, height: 60, borderRadius: "50%", background: "rgba(255,255,255,0.06)" }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", position: "relative" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <svg width="32" height="24" viewBox="0 0 32 24" fill="none">
            <rect x="1" y="1" width="30" height="22" rx="3" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" />
            <rect x="7" y="7" width="18" height="10" rx="2" fill="rgba(255,255,255,0.2)" />
            <line x1="13" y1="7" x2="13" y2="17" stroke="rgba(255,255,255,0.3)" /><line x1="19" y1="7" x2="19" y2="17" stroke="rgba(255,255,255,0.3)" />
            <line x1="7" y1="12" x2="25" y2="12" stroke="rgba(255,255,255,0.3)" />
          </svg>
          <Icons.nfcWaves size={18} style={{ color: "rgba(255,255,255,0.5)" }} />
        </div>
        <div style={{ fontSize: 10, fontWeight: 600, fontFamily: M, background: "rgba(255,255,255,0.2)", padding: "3px 10px", borderRadius: 16 }}>{tag.type}</div>
      </div>
      <div style={{ position: "relative" }}>
        <div style={{ fontSize: 14, fontFamily: M, letterSpacing: "0.1em", marginBottom: 8, opacity: 0.9 }}>{tag.uid}</div>
        <div style={{ display: "flex", gap: 16 }}>
          {[["Capacity", `${tag.capacity}B`], ["Writable", tag.writable ? "Yes" : "Locked"], ["Records", `${tag.records?.length || 0}`]].map(([l, v]) => (
            <div key={l}>
              <div style={{ fontSize: 8, textTransform: "uppercase", letterSpacing: "0.1em", opacity: 0.5, fontFamily: F, fontWeight: 600 }}>{l}</div>
              <div style={{ fontSize: 13, fontWeight: 600, fontFamily: F }}>{v}</div>
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
  const inp = { width: "100%", padding: "8px 12px", backgroundColor: "#fafaf8", border: "1px solid #e8e6e1", borderRadius: 10, color: "#1a1a1a", fontSize: 13, fontFamily: M, outline: "none", transition: "border-color 0.2s" };
  const lbl = { fontSize: 10, color: "#9ca3af", fontFamily: F, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 };
  switch (record.type) {
    case "url": return <div><div style={lbl}>URL</div><input style={inp} placeholder="https://example.com" value={record.value || ""} onChange={e => onChange({ ...record, value: e.target.value })} /></div>;
    case "text": return <div><div style={lbl}>Text</div><textarea style={{ ...inp, minHeight: 56, resize: "vertical" }} placeholder="Hello NFC world" value={record.value || ""} onChange={e => onChange({ ...record, value: e.target.value })} /></div>;
    case "vcard": return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {[["name", "Name"], ["phone", "Phone"], ["email", "Email"], ["org", "Org"]].map(([k, l]) => (
          <div key={k}><div style={lbl}>{l}</div><input style={inp} placeholder={l} value={record.value?.[k] || ""} onChange={e => update(k, e.target.value)} /></div>
        ))}
      </div>
    );
    case "wifi": return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        <div><div style={lbl}>SSID</div><input style={inp} placeholder="Network" value={record.value?.ssid || ""} onChange={e => update("ssid", e.target.value)} /></div>
        <div><div style={lbl}>Password</div><input style={inp} type="password" placeholder="Password" value={record.value?.password || ""} onChange={e => update("password", e.target.value)} /></div>
        <div><div style={lbl}>Encryption</div>
          <select style={{ ...inp, cursor: "pointer" }} value={record.value?.encryption || "WPA2"} onChange={e => update("encryption", e.target.value)}>
            <option value="WPA2">WPA2</option><option value="WPA3">WPA3</option><option value="WEP">WEP</option><option value="OPEN">Open</option>
          </select>
        </div>
      </div>
    );
    case "geo": return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8, alignItems: "end" }}>
        <div><div style={lbl}>Latitude</div><input style={inp} placeholder="49.3267" value={record.value?.lat || ""} onChange={e => update("lat", e.target.value)} /></div>
        <div><div style={lbl}>Longitude</div><input style={inp} placeholder="-117.6593" value={record.value?.lng || ""} onChange={e => update("lng", e.target.value)} /></div>
        <button style={{ padding: "8px 12px", background: "linear-gradient(135deg,#059669,#34d399)", border: "none", borderRadius: 10, color: "#fff", fontSize: 11, fontFamily: F, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}
          onClick={() => { if (navigator.geolocation) navigator.geolocation.getCurrentPosition((p) => onChange({ ...record, value: { lat: p.coords.latitude.toFixed(6), lng: p.coords.longitude.toFixed(6) } }), () => {}); }}>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Icons.geo size={14} /> Locate</span>
        </button>
      </div>
    );
    case "phone": return <div><div style={lbl}>Phone Number</div><input style={inp} placeholder="+1 250 555 0123" value={record.value || ""} onChange={e => onChange({ ...record, value: e.target.value })} /></div>;
    case "email": return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <div><div style={lbl}>To</div><input style={inp} placeholder="someone@email.com" value={record.value?.to || ""} onChange={e => update("to", e.target.value)} /></div>
        <div><div style={lbl}>Subject</div><input style={inp} placeholder="Subject" value={record.value?.subject || ""} onChange={e => update("subject", e.target.value)} /></div>
        <div style={{ gridColumn: "1/-1" }}><div style={lbl}>Body</div><textarea style={{ ...inp, minHeight: 48, resize: "vertical" }} placeholder="Message" value={record.value?.body || ""} onChange={e => update("body", e.target.value)} /></div>
      </div>
    );
    case "sms": return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <div><div style={lbl}>Phone</div><input style={inp} placeholder="+1 250 555 0123" value={record.value?.number || ""} onChange={e => update("number", e.target.value)} /></div>
        <div><div style={lbl}>Message</div><input style={inp} placeholder="Pre-composed message" value={record.value?.body || ""} onChange={e => update("body", e.target.value)} /></div>
      </div>
    );
    default: return null;
  }
}

// ─── LOCK MODAL ───────────────────────────────────────────
function LockModal({ onConfirm, onCancel }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.25)", backdropFilter: "blur(8px)" }} onClick={onCancel}>
      <div onClick={e => e.stopPropagation()} style={{ backgroundColor: "#fff", borderRadius: 24, boxShadow: "0 20px 60px rgba(0,0,0,0.15)", padding: "32px 36px", maxWidth: 400, width: "90%", animation: "popIn 0.3s ease" }}>
        <div style={{ color: "#8b5cf6", marginBottom: 12 }}><Icons.lockLarge /></div>
        <div style={{ fontSize: 22, fontWeight: 700, color: "#1a1a1a", marginBottom: 8, fontFamily: F }}>Lock Tag?</div>
        <p style={{ color: "#6b7280", fontSize: 14, lineHeight: 1.7, marginBottom: 24, fontFamily: F }}>
          This action is <span style={{ color: "#dc2626", fontWeight: 700 }}>permanent</span>. Once locked, this tag can never be written to or erased again.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
          <button onClick={onCancel} style={{ padding: "10px 22px", borderRadius: 12, border: "1px solid #e8e6e1", backgroundColor: "transparent", color: "#6b7280", cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: F }}>Cancel</button>
          <button onClick={onConfirm} style={{ padding: "10px 22px", borderRadius: 12, border: "none", backgroundColor: "#dc2626", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: F }}>Lock Forever</button>
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
        <div style={{ width: 72, height: 72, borderRadius: 20, background: "linear-gradient(135deg, #ecfdf5, #d1fae5)", margin: "0 auto 20px", display: "flex", alignItems: "center", justifyContent: "center", color: "#059669" }}>
          <Icons.nfcWaves size={32} />
        </div>
        <h2 style={{ fontSize: 28, fontWeight: 800, color: "#1a1a1a", fontFamily: F, marginBottom: 10 }}>Bridge Not Connected</h2>
        <p style={{ color: "#6b7280", fontSize: 15, maxWidth: 400, margin: "0 auto", fontFamily: F, lineHeight: 1.6 }}>
          The local bridge relays commands between this dashboard and your NFC reader.
        </p>
      </div>
      <div style={{ display: "grid", gap: 12 }}>
        {steps.map((s, i) => (
          <div key={s.num} style={{ display: "flex", gap: 14, padding: "16px 20px", borderRadius: 18, backgroundColor: "#fff", boxShadow: "0 2px 12px rgba(0,0,0,0.06)", animation: `popIn 0.4s ease ${i * 0.08}s both` }}>
            <div style={{ width: 32, height: 32, borderRadius: 10, background: "linear-gradient(135deg, #059669, #34d399)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, fontFamily: F, flexShrink: 0 }}>{s.num}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#1a1a1a", marginBottom: 4, fontFamily: F }}>{s.title}</div>
              {s.cmd ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", backgroundColor: "#ecfdf5", borderRadius: 10 }}>
                  <code style={{ flex: 1, color: "#059669", fontFamily: M, fontSize: 12 }}>{s.cmd}</code>
                  <button onClick={() => { navigator.clipboard.writeText(s.cmd); setCopied(true); setTimeout(() => setCopied(false), 2000); }} style={{ padding: "3px 10px", borderRadius: 6, border: "1px solid rgba(5,150,105,0.2)", backgroundColor: "transparent", color: "#059669", fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: F }}>{copied ? "Copied!" : "Copy"}</button>
                </div>
              ) : <div style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.5, fontFamily: F }}>{s.desc}</div>}
            </div>
          </div>
        ))}
      </div>
      <p style={{ textAlign: "center", marginTop: 28, fontSize: 11, color: "#9ca3af", fontFamily: F }}>Tip: On macOS, if the reader isn't detected, you may need to disable com.apple.ifdreader</p>
    </div>
  );
}

// ─── WAITING STATE ────────────────────────────────────────
function WaitingState() {
  return (
    <div style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", backgroundColor: "#fff", borderRadius: 24, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", animation: "popIn 0.5s ease", padding: "60px 20px" }}>
      <div style={{ position: "relative", width: 120, height: 120, marginBottom: 28 }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{ position: "absolute", inset: `${i * 18}px`, borderRadius: "50%", border: "2px solid rgba(16,185,129,0.15)", animation: `ripple 2.4s ease-in-out ${i * 0.4}s infinite` }} />
        ))}
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(16,185,129,0.5)" }}>
          <Icons.nfcWaves size={32} />
        </div>
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: "#1a1a1a", fontFamily: F, marginBottom: 6 }}>Place a tag on the reader</div>
      <div style={{ fontSize: 14, color: "#9ca3af", fontFamily: F }}>The dashboard will detect it automatically</div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────
export default function NFCDashboard() {
  const bridge = useBridge();
  const bridgeStatus = bridge.bridgeStatus;
  const readerStatus = bridge.bridgeStatus === "connected" ? bridge.readerStatus : "connected";
  const mockTag = { uid: "04:A2:FB:1A:3C:80:84", type: "NTAG215", capacity: 504, used: 137, writable: true, records: [{ type: "url", value: "https://github.com/squircle" }] };
  const tag = bridge.bridgeStatus === "connected" ? bridge.tag : mockTag;

  const [activeTab, setActiveTab] = useState("history");
  const [showLockModal, setShowLockModal] = useState(false);
  const [writeRecords, setWriteRecords] = useState([{ type: "url", value: "" }]);
  const [history] = useState(MOCK_HISTORY);
  const [templates] = useState(STARTER_TEMPLATES);
  const [toast, setToast] = useState(null);
  const [opInProgress, setOpInProgress] = useState(null);

  const showToast = useCallback((msg, type = "success") => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000); }, []);

  const simulateOp = useCallback((op, duration = 1200) => {
    setOpInProgress(op);
    if (bridge.bridgeStatus === "connected") {
      const opFn = op === "read" ? bridge.readTag : op === "write" ? () => bridge.writeTag(writeRecords) : op === "erase" ? bridge.eraseTag : op === "lock" ? bridge.lockTag : null;
      if (opFn) { opFn().then(() => { setOpInProgress(null); showToast(op === "read" ? "Tag read" : op === "write" ? "Written!" : op === "erase" ? "Erased" : "Locked", "success"); }).catch((err) => { setOpInProgress(null); showToast(err.message, "error"); }); return; }
    }
    setTimeout(() => { setOpInProgress(null); showToast(op === "read" ? "Tag read" : op === "write" ? "Written!" : op === "erase" ? "Erased" : "Locked", "success"); }, duration);
  }, [bridge, writeRecords, showToast]);

  const updateRecord = (i, rec) => setWriteRecords(writeRecords.map((r, idx) => idx === i ? rec : r));
  const loadTemplate = (t) => { setWriteRecords(JSON.parse(JSON.stringify(t.records))); setActiveTab("history"); showToast(`Loaded "${t.name}"`); };

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

  const card = { backgroundColor: "#fff", borderRadius: 20, boxShadow: "0 2px 12px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)" };
  const actions = [
    { label: "Read", op: "read", color: "#3b82f6", bg: "#eff6ff" },
    { label: "Write", op: "write", color: "#10b981", bg: "#ecfdf5" },
    { label: "Erase", op: "erase", color: "#dc2626", bg: "#fef2f2" },
    { label: "Lock", op: "lock", color: "#8b5cf6", bg: "#f5f3ff" },
  ];
  const toastC = { success: { bg: "#ecfdf5", color: "#059669", border: "#05966933" }, error: { bg: "#fef2f2", color: "#dc2626", border: "#dc262633" } };

  const HEADER_H = 60;

  return (
    <div style={{ height: "100vh", overflow: "hidden", backgroundColor: "#f0ede8", fontFamily: F }}>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::selection { background: #d1fae5; color: #059669; }
        input:focus, textarea:focus, select:focus { border-color: #10b981 !important; outline: none; box-shadow: 0 0 0 3px rgba(16,185,129,0.1) !important; }
        select option { background: #fff; color: #1a1a1a; }
        @keyframes pulse { 0%, 100% { transform: scale(1); opacity: 0.4; } 50% { transform: scale(1.8); opacity: 0; } }
        @keyframes ripple { 0% { transform: scale(0.8); opacity: 0.6; } 50% { transform: scale(1.1); opacity: 0; } 100% { transform: scale(0.8); opacity: 0; } }
        @keyframes popIn { from { opacity: 0; transform: scale(0.96) translateY(6px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        @keyframes slideToast { from { opacity: 0; transform: translateX(-50%) translateY(-12px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
        ::-webkit-scrollbar { width: 5px; } ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #e8e6e1; border-radius: 3px; }
      `}</style>

      {toast && (
        <div style={{ position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", zIndex: 1001, padding: "10px 20px", borderRadius: 14, fontSize: 13, fontWeight: 600, fontFamily: F, backgroundColor: toastC[toast.type]?.bg || "#ecfdf5", color: toastC[toast.type]?.color || "#059669", border: `1px solid ${toastC[toast.type]?.border || "#05966933"}`, animation: "slideToast 0.3s ease", boxShadow: "0 4px 20px rgba(0,0,0,0.08)", display: "flex", alignItems: "center", gap: 8 }}>
          {toast.type === "success" ? <Icons.check size={16} /> : <Icons.x size={16} />}
          {toast.msg}
        </div>
      )}

      {showLockModal && <LockModal onConfirm={() => { setShowLockModal(false); simulateOp("lock"); }} onCancel={() => setShowLockModal(false)} />}

      {/* HEADER */}
      <div style={{ padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between", height: HEADER_H, backgroundColor: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.04)", position: "relative", zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: "linear-gradient(135deg, #059669, #34d399)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>
            <Icons.nfcWaves size={18} />
          </div>
          <span style={{ fontWeight: 700, fontSize: 16, color: "#1a1a1a" }}>NFC Tag Manager</span>
          <span style={{ fontSize: 11, color: "#9ca3af", marginLeft: 4 }}>by Squircle Labs</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {[
            { label: "Bridge", active: bridgeStatus === "connected", detail: bridgeStatus === "connected" ? `v${bridge.bridgeVersion || "1.0.0"}` : "offline" },
            { label: "Reader", active: readerStatus === "connected", detail: readerStatus === "connected" ? (bridge.readerName || "ACR1252U") : "not found" },
            { label: "Tag", active: !!tag, detail: tag ? truncUID(tag.uid) : "no tag" },
          ].map(s => (
            <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: 10, backgroundColor: s.active ? "#ecfdf5" : "#fafaf8" }}>
              <StatusDot active={s.active} />
              <div>
                <div style={{ fontSize: 9, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, lineHeight: 1 }}>{s.label}</div>
                <div style={{ fontSize: 10, color: s.active ? "#1a1a1a" : "#9ca3af", fontFamily: M, lineHeight: 1.4 }}>{s.detail}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* BODY */}
      {bridgeStatus === "disconnected" && bridge.bridgeStatus === "disconnected" ? (
        <div style={{ height: `calc(100vh - ${HEADER_H}px)`, overflow: "auto" }}><SetupGuide /></div>
      ) : (
        <div style={{ height: `calc(100vh - ${HEADER_H}px)`, padding: "16px 20px 0", overflow: "hidden" }}>
          {!tag ? (
            <div style={{ display: "grid", height: "100%" }}><WaitingState /></div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 340px", gridTemplateRows: "auto auto 1fr", gap: "14px 16px", height: "100%" }}>

              {/* Greeting - spans cols 1-2 */}
              <div style={{ gridColumn: "1 / 3", animation: "popIn 0.3s ease", display: "flex", alignItems: "baseline", gap: 12 }}>
                <h1 style={{ fontSize: 26, fontWeight: 800, color: "#1a1a1a" }}>Tag Connected</h1>
                <p style={{ fontSize: 14, color: "#6b7280" }}>{tag.type} · {tag.capacity} bytes · {tag.records?.length || 0} records</p>
              </div>

              {/* Sidebar - col 3, spans all rows */}
              <div style={{ ...card, gridColumn: 3, gridRow: "1 / -1", padding: 0, overflow: "hidden", display: "flex", flexDirection: "column", animation: "popIn 0.4s ease 0.1s both" }}>
                <div style={{ padding: "12px 14px 0", flexShrink: 0 }}>
                  <div style={{ display: "flex", backgroundColor: "#f0ede8", borderRadius: 10, padding: 3 }}>
                    {[["history", "History"], ["templates", "Templates"]].map(([id, label]) => (
                      <button key={id} onClick={() => setActiveTab(id)} style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: F, transition: "all 0.2s", backgroundColor: activeTab === id ? "#fff" : "transparent", color: activeTab === id ? "#1a1a1a" : "#9ca3af", boxShadow: activeTab === id ? "0 1px 3px rgba(0,0,0,0.08)" : "none" }}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ padding: "10px 14px 14px", overflowY: "auto", flex: 1 }}>
                  {activeTab === "history" && history.map((h, i) => (
                    <div key={h.id} style={{ padding: "10px 12px", borderRadius: 14, marginBottom: 6, backgroundColor: "#fafaf8", cursor: "pointer", transition: "transform 0.15s", animation: `popIn 0.3s ease ${i * 0.03}s both` }}
                      onMouseEnter={e => e.currentTarget.style.transform = "translateY(-1px)"}
                      onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, borderRadius: 6, backgroundColor: actionBg(h.action), color: actionColor(h.action) }}>{actionIcon(h.action, 13)}</span>
                          <span style={{ fontSize: 10, color: "#9ca3af", fontFamily: M }}>{truncUID(h.uid)}</span>
                        </div>
                        <span style={{ fontSize: 10, color: "#9ca3af", fontFamily: M }}>{formatTime(h.created_at)}</span>
                      </div>
                      {h.label && <div style={{ fontSize: 12, color: "#1a1a1a", fontWeight: 500, marginBottom: 2 }}>{h.label}</div>}
                      <div style={{ fontSize: 11, color: "#9ca3af", fontFamily: M, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{recordSummary(h.records)}</div>
                      <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                        <button onClick={e => { e.stopPropagation(); setWriteRecords(JSON.parse(JSON.stringify(h.records))); showToast("Loaded"); }} style={{ padding: "3px 8px", fontSize: 10, borderRadius: 6, border: "none", cursor: "pointer", backgroundColor: "#ecfdf5", color: "#059669", fontWeight: 600, fontFamily: F }}>Re-write</button>
                        <button style={{ padding: "3px 8px", fontSize: 10, borderRadius: 6, border: "1px solid #e8e6e1", backgroundColor: "transparent", color: "#9ca3af", cursor: "pointer", fontWeight: 600, fontFamily: F }}>Label</button>
                      </div>
                    </div>
                  ))}
                  {activeTab === "templates" && (
                    <>
                      {templates.map((t, i) => (
                        <div key={t.id} style={{ padding: "10px 12px", borderRadius: 14, marginBottom: 6, backgroundColor: "#fafaf8", display: "flex", alignItems: "center", gap: 10, animation: `popIn 0.3s ease ${i * 0.04}s both` }}>
                          <div style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: "#ecfdf5", color: "#059669", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{recordIcon(t.type, 18)}</div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: "#1a1a1a" }}>{t.name}</div>
                            <div style={{ fontSize: 10, color: "#9ca3af", fontFamily: M }}>{t.records.length} rec · {t.records.map(r => r.type).join(", ")}</div>
                          </div>
                          <button onClick={() => loadTemplate(t)} style={{ padding: "5px 12px", fontSize: 10, borderRadius: 8, cursor: "pointer", border: "1px solid #10b981", backgroundColor: "transparent", color: "#059669", fontWeight: 600, fontFamily: F }}>Use</button>
                        </div>
                      ))}
                      <button style={{ width: "100%", padding: "10px", borderRadius: 12, border: "1px dashed rgba(16,185,129,0.4)", backgroundColor: "transparent", color: "#059669", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: F, marginTop: 4 }}>+ Save Current</button>
                    </>
                  )}
                </div>
              </div>

              {/* Tag card + Donut - row 2 cols 1-2 */}
              <div style={{ animation: "popIn 0.4s ease 0.05s both" }}>
                <TagCard tag={tag} />
              </div>
              <div style={{ ...card, padding: "16px", display: "flex", alignItems: "center", justifyContent: "center", position: "relative", animation: "popIn 0.4s ease 0.08s both" }}>
                <DonutChart used={tag.used} total={tag.capacity} />
              </div>

              {/* Actions + Records + Write - row 3 cols 1-2, scrolls internally */}
              <div style={{ gridColumn: "1 / 3", overflow: "auto", paddingBottom: 60, animation: "popIn 0.4s ease 0.12s both" }}>
                {/* Action buttons */}
                <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
                  {actions.map(a => (
                    <button key={a.op} disabled={opInProgress !== null}
                      onClick={() => a.op === "lock" ? setShowLockModal(true) : simulateOp(a.op)}
                      style={{ flex: 1, padding: "10px", borderRadius: 14, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: F, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, transition: "all 0.15s", backgroundColor: opInProgress === a.op ? a.color : a.bg, color: opInProgress === a.op ? "#fff" : a.color, opacity: opInProgress && opInProgress !== a.op ? 0.5 : 1 }}
                      onMouseEnter={e => { if (!opInProgress) { e.currentTarget.style.backgroundColor = a.color; e.currentTarget.style.color = "#fff"; }}}
                      onMouseLeave={e => { if (!opInProgress) { e.currentTarget.style.backgroundColor = a.bg; e.currentTarget.style.color = a.color; }}}>
                      {actionIcon(a.op, 16)}
                      {opInProgress === a.op ? "\u2026" : a.label}
                    </button>
                  ))}
                </div>

                {/* Current records */}
                {tag.records?.length > 0 && (
                  <div style={{ display: "flex", gap: 8, marginBottom: 12, overflowX: "auto" }}>
                    {tag.records.map((r, i) => (
                      <div key={i} style={{ ...card, padding: "10px 14px", display: "flex", alignItems: "center", gap: 8, minWidth: 180, flex: "0 0 auto" }}>
                        <span style={{ color: "#6b7280" }}>{recordIcon(r.type, 18)}</span>
                        <div>
                          <div style={{ fontSize: 9, color: "#9ca3af", textTransform: "uppercase", fontWeight: 600 }}>{r.type}</div>
                          <div style={{ fontSize: 12, color: "#1a1a1a", fontFamily: M, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{recordSummary([r])}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Write panel */}
                <div style={{ ...card, padding: "18px 22px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: "#1a1a1a" }}>Write Records</div>
                    <div style={{ fontSize: 11, color: "#9ca3af", fontFamily: M }}>~{Math.min(writeRecords.length * 40, tag.capacity)}/{tag.capacity}B</div>
                  </div>
                  {writeRecords.map((rec, i) => (
                    <div key={i} style={{ marginBottom: 14, position: "relative" }}>
                      {writeRecords.length > 1 && (
                        <button onClick={() => setWriteRecords(writeRecords.filter((_, idx) => idx !== i))} style={{ position: "absolute", top: 0, right: 0, width: 24, height: 24, borderRadius: 6, border: "1px solid #e8e6e1", backgroundColor: "#fff", color: "#9ca3af", cursor: "pointer", fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2 }}>
                          <Icons.x size={12} />
                        </button>
                      )}
                      {/* Type selector - single horizontal row */}
                      <div style={{ display: "flex", gap: 4, marginBottom: 12, flexWrap: "nowrap", overflowX: "auto" }}>
                        {RECORD_TYPES.map(rt => (
                          <button key={rt.id}
                            onClick={() => updateRecord(i, { type: rt.id, value: ["vcard","wifi","geo","email","sms"].includes(rt.id) ? {} : "" })}
                            style={{ padding: "6px 12px", borderRadius: 10, border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap", transition: "all 0.15s", fontSize: 12, fontWeight: 600, fontFamily: F, flexShrink: 0, background: rec.type === rt.id ? "linear-gradient(135deg, #059669, #34d399)" : "#fafaf8", color: rec.type === rt.id ? "#fff" : "#6b7280" }}>
                            {recordIcon(rt.id, 14)}{rt.label}
                          </button>
                        ))}
                      </div>
                      <RecordFields record={rec} onChange={r => updateRecord(i, r)} />
                    </div>
                  ))}
                  <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                    <button onClick={() => setWriteRecords([...writeRecords, { type: "url", value: "" }])} style={{ flex: 1, padding: "10px", borderRadius: 12, border: "1px dashed rgba(16,185,129,0.4)", backgroundColor: "transparent", color: "#059669", fontSize: 12, fontWeight: 600, fontFamily: F, cursor: "pointer" }}>+ Add Record</button>
                    <button disabled={!tag || opInProgress !== null} onClick={() => simulateOp("write", 1500)}
                      style={{ flex: 2, padding: "12px", borderRadius: 12, border: "none", cursor: "pointer", background: "linear-gradient(135deg, #059669, #34d399)", color: "#fff", fontSize: 14, fontWeight: 700, fontFamily: F, opacity: !tag ? 0.5 : 1, boxShadow: "0 4px 16px rgba(16,185,129,0.3)", transition: "all 0.15s", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                      onMouseEnter={e => { if (tag && !opInProgress) { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 6px 24px rgba(16,185,129,0.4)"; }}}
                      onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 4px 16px rgba(16,185,129,0.3)"; }}>
                      {opInProgress === "write" ? "Writing\u2026" : <><Icons.write size={16} /> Write to Tag</>}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* KEYBOARD SHORTCUTS */}
      <div style={{ position: "fixed", bottom: 12, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 14, padding: "8px 20px", borderRadius: 14, backgroundColor: "#fff", boxShadow: "0 4px 20px rgba(0,0,0,0.08)", zIndex: 50 }}>
        {[["R", "Read"], ["W", "Write"], ["Esc", "Cancel"]].map(([key, label]) => (
          <div key={key} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <kbd style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 24, height: 22, padding: "0 5px", borderRadius: 6, fontSize: 10, fontFamily: M, fontWeight: 700, backgroundColor: "#f0ede8", color: "#6b7280", border: "1px solid #e8e6e1", boxShadow: "0 1px 2px rgba(0,0,0,0.06)" }}>{key}</kbd>
            <span style={{ fontSize: 11, color: "#9ca3af", fontFamily: F }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
