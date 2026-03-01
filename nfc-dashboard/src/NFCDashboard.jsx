import { useState, useEffect, useCallback, useRef } from "react";
import { useBridge } from "./useBridge.js";

// ─── CONSTANTS ────────────────────────────────────────────
const RECORD_TYPES = [
  { id: "url", label: "URL", icon: "\u{1F517}" },
  { id: "text", label: "Text", icon: "\u{1F4DD}" },
  { id: "vcard", label: "vCard", icon: "\u{1F464}" },
  { id: "wifi", label: "Wi-Fi", icon: "\u{1F4F6}" },
  { id: "geo", label: "Location", icon: "\u{1F4CD}" },
  { id: "phone", label: "Phone", icon: "\u{1F4DE}" },
  { id: "email", label: "Email", icon: "\u2709\uFE0F" },
  { id: "sms", label: "SMS", icon: "\u{1F4AC}" },
];

const STARTER_TEMPLATES = [
  { id: "t1", name: "Business Card", records: [{ type: "vcard", value: { name: "Your Name", phone: "+1234567890", email: "you@email.com", org: "Squircle Labs" } }] },
  { id: "t2", name: "WiFi Guest Access", records: [{ type: "wifi", value: { ssid: "GuestNetwork", password: "welcome123", encryption: "WPA2" } }] },
  { id: "t3", name: "Website Link", records: [{ type: "url", value: "https://squirclelabs.com" }] },
  { id: "t4", name: "Portfolio Link", records: [{ type: "url", value: "https://portfolio.dev" }] },
];

const MOCK_HISTORY = [
  { id: 1, uid: "04:A2:FB:1A:3C:80:84", action: "read", tag_type: "NTAG215", records: [{ type: "url", value: "https://github.com/squircle" }], created_at: "2026-02-28T14:30:00Z", label: "DJ's GitHub" },
  { id: 2, uid: "04:B7:CC:2D:4E:91:A3", action: "write", tag_type: "NTAG216", records: [{ type: "wifi", value: { ssid: "SelkirkGuest", password: "****", encryption: "WPA2" } }], created_at: "2026-02-27T09:15:00Z", label: "Lab WiFi Tag" },
  { id: 3, uid: "04:A2:FB:1A:3C:80:84", action: "write", tag_type: "NTAG215", records: [{ type: "vcard", value: { name: "DJ", email: "dj@selkirk.ca", org: "Selkirk College" } }], created_at: "2026-02-26T16:45:00Z", label: null },
  { id: 4, uid: "04:D1:EE:5F:7A:B2:C8", action: "erase", tag_type: "NTAG213", records: [], created_at: "2026-02-25T11:00:00Z", label: "Old demo tag" },
  { id: 5, uid: "04:F3:AA:8B:2C:D4:E6", action: "read", tag_type: "NTAG215", records: [{ type: "text", value: "Hello NFC World" }], created_at: "2026-02-24T13:20:00Z", label: null },
];

// ─── HELPERS ──────────────────────────────────────────────
function cn(...classes) { return classes.filter(Boolean).join(" "); }
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
  if (r.type === "wifi") return `WiFi: ${r.value?.ssid}`;
  if (r.type === "geo") return `\u{1F4CD} ${r.value?.lat}, ${r.value?.lng}`;
  if (r.type === "phone") return `\u{1F4DE} ${r.value}`;
  if (r.type === "email") return `\u2709 ${r.value?.to || r.value}`;
  return r.type;
}

function actionColor(action) {
  if (action === "read") return "#6EBBF7";
  if (action === "write") return "#D4915E";
  if (action === "erase") return "#E87272";
  if (action === "lock") return "#9B7FD4";
  return "#888";
}

// ─── PULSE DOT ────────────────────────────────────────────
function StatusDot({ status }) {
  const color = status === "connected" ? "#4ADE80" : status === "warning" ? "#FBBF24" : "#EF4444";
  return (
    <span style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center", width: 10, height: 10 }}>
      <span style={{
        position: "absolute", width: 10, height: 10, borderRadius: "50%", backgroundColor: color,
        animation: status === "connected" ? "pulse 2s ease-in-out infinite" : "none", opacity: 0.4,
      }} />
      <span style={{ position: "relative", width: 6, height: 6, borderRadius: "50%", backgroundColor: color }} />
    </span>
  );
}

// ─── CAPACITY BAR ─────────────────────────────────────────
function CapacityBar({ used, total, style }) {
  const pct = Math.min((used / total) * 100, 100);
  const color = pct > 90 ? "#EF4444" : pct > 70 ? "#FBBF24" : "#D4915E";
  return (
    <div style={{ height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.08)", overflow: "hidden", ...style }}>
      <div style={{ height: "100%", width: `${pct}%`, borderRadius: 2, backgroundColor: color, transition: "width 0.6s cubic-bezier(0.22,1,0.36,1)" }} />
    </div>
  );
}

// ─── RECORD FORM FIELDS ──────────────────────────────────
function RecordFields({ record, onChange }) {
  const update = (key, val) => onChange({ ...record, value: typeof record.value === "object" ? { ...record.value, [key]: val } : val });
  const inputStyle = {
    width: "100%", padding: "10px 14px", backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 10, color: "#E8E0D8", fontSize: 13, fontFamily: "'IBM Plex Mono', monospace", outline: "none",
    transition: "border-color 0.2s",
  };
  const labelStyle = { fontSize: 11, color: "#8A8078", fontFamily: "'IBM Plex Mono', monospace", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 };
  switch (record.type) {
    case "url": return (
      <div><div style={labelStyle}>URL</div><input style={inputStyle} placeholder="https://example.com" value={record.value || ""} onChange={e => onChange({ ...record, value: e.target.value })} onFocus={e => e.target.style.borderColor = "#D4915E"} onBlur={e => e.target.style.borderColor = "rgba(255,255,255,0.08)"} /></div>
    );
    case "text": return (
      <div><div style={labelStyle}>Text Content</div><textarea style={{ ...inputStyle, minHeight: 80, resize: "vertical" }} placeholder="Hello NFC world" value={record.value || ""} onChange={e => onChange({ ...record, value: e.target.value })} /></div>
    );
    case "vcard": return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {[["name", "Full Name"], ["phone", "Phone"], ["email", "Email"], ["org", "Organization"]].map(([k, l]) => (
          <div key={k}><div style={labelStyle}>{l}</div><input style={inputStyle} placeholder={l} value={record.value?.[k] || ""} onChange={e => update(k, e.target.value)} /></div>
        ))}
      </div>
    );
    case "wifi": return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div><div style={labelStyle}>SSID</div><input style={inputStyle} placeholder="Network name" value={record.value?.ssid || ""} onChange={e => update("ssid", e.target.value)} /></div>
        <div><div style={labelStyle}>Password</div><input style={inputStyle} type="password" placeholder="Password" value={record.value?.password || ""} onChange={e => update("password", e.target.value)} /></div>
        <div><div style={labelStyle}>Encryption</div>
          <select style={{ ...inputStyle, cursor: "pointer" }} value={record.value?.encryption || "WPA2"} onChange={e => update("encryption", e.target.value)}>
            <option value="WPA2">WPA2</option><option value="WPA3">WPA3</option><option value="WEP">WEP</option><option value="OPEN">Open</option>
          </select>
        </div>
      </div>
    );
    case "geo": return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div><div style={labelStyle}>Latitude</div><input style={inputStyle} placeholder="49.3267" value={record.value?.lat || ""} onChange={e => update("lat", e.target.value)} /></div>
        <div><div style={labelStyle}>Longitude</div><input style={inputStyle} placeholder="-117.6593" value={record.value?.lng || ""} onChange={e => update("lng", e.target.value)} /></div>
      </div>
    );
    case "phone": return (
      <div><div style={labelStyle}>Phone Number</div><input style={inputStyle} placeholder="+1 250 555 0123" value={record.value || ""} onChange={e => onChange({ ...record, value: e.target.value })} /></div>
    );
    case "email": return (
      <div style={{ display: "grid", gap: 10 }}>
        <div><div style={labelStyle}>To</div><input style={inputStyle} placeholder="someone@email.com" value={record.value?.to || ""} onChange={e => update("to", e.target.value)} /></div>
        <div><div style={labelStyle}>Subject</div><input style={inputStyle} placeholder="Subject line" value={record.value?.subject || ""} onChange={e => update("subject", e.target.value)} /></div>
        <div><div style={labelStyle}>Body</div><textarea style={{ ...inputStyle, minHeight: 60, resize: "vertical" }} placeholder="Message body" value={record.value?.body || ""} onChange={e => update("body", e.target.value)} /></div>
      </div>
    );
    case "sms": return (
      <div style={{ display: "grid", gap: 10 }}>
        <div><div style={labelStyle}>Phone Number</div><input style={inputStyle} placeholder="+1 250 555 0123" value={record.value?.number || ""} onChange={e => update("number", e.target.value)} /></div>
        <div><div style={labelStyle}>Message</div><textarea style={{ ...inputStyle, minHeight: 60, resize: "vertical" }} placeholder="Pre-composed message" value={record.value?.body || ""} onChange={e => update("body", e.target.value)} /></div>
      </div>
    );
    default: return null;
  }
}

// ─── LOCK CONFIRMATION MODAL ──────────────────────────────
function LockModal({ onConfirm, onCancel }) {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center",
      backgroundColor: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)",
    }} onClick={onCancel}>
      <div onClick={e => e.stopPropagation()} style={{
        backgroundColor: "#1C1916", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 20,
        padding: "32px 36px", maxWidth: 420, width: "90%", animation: "fadeIn 0.2s ease",
      }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: "#E8E0D8", marginBottom: 8, fontFamily: "'Space Grotesk', sans-serif" }}>
          {"\u26A0\uFE0F"} Lock Tag?
        </div>
        <p style={{ color: "#8A8078", fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>
          This action is <span style={{ color: "#EF4444", fontWeight: 600 }}>irreversible</span>. Once locked, this tag can never be written to or erased again. The current data will be permanently frozen.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
          <button onClick={onCancel} style={{
            padding: "10px 20px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)",
            backgroundColor: "transparent", color: "#8A8078", cursor: "pointer", fontSize: 13, fontWeight: 600,
          }}>Cancel</button>
          <button onClick={onConfirm} style={{
            padding: "10px 20px", borderRadius: 10, border: "none",
            backgroundColor: "#EF4444", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600,
          }}>Lock Permanently</button>
        </div>
      </div>
    </div>
  );
}

// ─── SETUP GUIDE ──────────────────────────────────────────
function SetupGuide() {
  const steps = [
    { num: "01", title: "Install ACS Driver", desc: "Download and install the ACR1252U driver from ACS.", link: "https://www.acs.com.hk/en/driver" },
    { num: "02", title: "Install Node.js", desc: "macOS: brew install node  \u2022  Or download from nodejs.org" },
    { num: "03", title: "Run the Bridge", desc: "npx squircle-nfc-bridge", copy: true },
    { num: "04", title: "Connect Reader", desc: "Plug in your ACR1252U via USB. The bridge will detect it automatically." },
  ];
  return (
    <div style={{ animation: "fadeIn 0.5s ease" }}>
      <div style={{ textAlign: "center", marginBottom: 40 }}>
        <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.6 }}>{"\u26A1"}</div>
        <h2 style={{ fontSize: 24, fontWeight: 700, color: "#E8E0D8", fontFamily: "'Space Grotesk', sans-serif", marginBottom: 8 }}>
          Bridge Not Connected
        </h2>
        <p style={{ color: "#6B635B", fontSize: 14, maxWidth: 400, margin: "0 auto" }}>
          The local bridge relays commands between this dashboard and your NFC reader. Follow these steps to get started.
        </p>
      </div>
      <div style={{ display: "grid", gap: 16, maxWidth: 520, margin: "0 auto" }}>
        {steps.map(s => (
          <div key={s.num} style={{
            display: "flex", gap: 16, padding: "18px 20px", borderRadius: 14,
            backgroundColor: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10, backgroundColor: "rgba(212,145,94,0.12)", color: "#D4915E",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700,
              fontFamily: "'IBM Plex Mono', monospace", flexShrink: 0,
            }}>{s.num}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#E8E0D8", marginBottom: 4 }}>{s.title}</div>
              <div style={{ fontSize: 12, color: "#6B635B", lineHeight: 1.5 }}>
                {s.copy ? (
                  <code style={{
                    display: "inline-block", padding: "4px 10px", backgroundColor: "rgba(212,145,94,0.08)",
                    borderRadius: 6, color: "#D4915E", fontFamily: "'IBM Plex Mono', monospace", fontSize: 12,
                    cursor: "pointer",
                  }} title="Click to copy">{s.desc}</code>
                ) : s.desc}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ textAlign: "center", marginTop: 28 }}>
        <p style={{ fontSize: 11, color: "#4A443E" }}>
          Tip: On macOS, if the reader isn't detected, you may need to disable com.apple.ifdreader
        </p>
      </div>
    </div>
  );
}

// ─── TAG VISUALIZATION ────────────────────────────────────
function TagVisual({ tag }) {
  if (!tag) return (
    <div style={{ textAlign: "center", padding: "60px 20px", animation: "fadeIn 0.5s ease" }}>
      <div style={{
        width: 120, height: 120, borderRadius: "50%", margin: "0 auto 24px",
        border: "2px dashed rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center",
        animation: "breathe 3s ease-in-out infinite",
      }}>
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(212,145,94,0.4)" strokeWidth="1.5" strokeLinecap="round">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" />
          <path d="M12 6C8.69 6 6 8.69 6 12s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6z" />
          <circle cx="12" cy="12" r="2" fill="rgba(212,145,94,0.4)" />
        </svg>
      </div>
      <div style={{ fontSize: 16, fontWeight: 600, color: "#6B635B", fontFamily: "'Space Grotesk', sans-serif" }}>
        Place a tag on the reader
      </div>
      <div style={{ fontSize: 12, color: "#4A443E", marginTop: 6 }}>
        The dashboard will detect it automatically
      </div>
    </div>
  );
  return (
    <div style={{ animation: "slideUp 0.4s cubic-bezier(0.22,1,0.36,1)" }}>
      <div style={{
        padding: "24px 28px", borderRadius: 18, backgroundColor: "rgba(212,145,94,0.04)",
        border: "1px solid rgba(212,145,94,0.12)", position: "relative", overflow: "hidden",
      }}>
        <div style={{ position: "absolute", top: -40, right: -40, width: 120, height: 120, borderRadius: "50%", backgroundColor: "rgba(212,145,94,0.03)" }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 11, color: "#8A8078", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "'IBM Plex Mono', monospace", marginBottom: 4 }}>Tag Detected</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#E8E0D8", fontFamily: "'IBM Plex Mono', monospace" }}>{tag.uid}</div>
          </div>
          <div style={{
            padding: "4px 12px", borderRadius: 20, backgroundColor: "rgba(74,222,128,0.1)", color: "#4ADE80",
            fontSize: 11, fontWeight: 600, fontFamily: "'IBM Plex Mono', monospace",
          }}>CONNECTED</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
          {[["Type", tag.type], ["Capacity", `${tag.capacity} bytes`], ["Writable", tag.writable ? "Yes" : "Locked"]].map(([l, v]) => (
            <div key={l}>
              <div style={{ fontSize: 10, color: "#6B635B", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "'IBM Plex Mono', monospace" }}>{l}</div>
              <div style={{ fontSize: 14, color: "#C4BAB0", fontWeight: 600, marginTop: 2 }}>{v}</div>
            </div>
          ))}
        </div>
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: 10, color: "#6B635B", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "'IBM Plex Mono', monospace" }}>Storage</span>
            <span style={{ fontSize: 11, color: "#8A8078", fontFamily: "'IBM Plex Mono', monospace" }}>{tag.used}/{tag.capacity} bytes</span>
          </div>
          <CapacityBar used={tag.used} total={tag.capacity} />
        </div>
      </div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────
export default function NFCDashboard() {
  // Bridge connection
  const bridge = useBridge();

  // Use bridge state when connected, mock data when disconnected
  const bridgeStatus = bridge.bridgeStatus;
  const readerStatus = bridge.bridgeStatus === "connected" ? bridge.readerStatus : "connected";

  // Use mock tag when bridge is disconnected (for demo/development)
  const mockTag = {
    uid: "04:A2:FB:1A:3C:80:84", type: "NTAG215", capacity: 504, used: 137, writable: true,
    records: [{ type: "url", value: "https://github.com/squircle" }],
  };
  const tag = bridge.bridgeStatus === "connected" ? bridge.tag : mockTag;

  const [activeTab, setActiveTab] = useState("history");
  const [showLockModal, setShowLockModal] = useState(false);
  const [writeRecords, setWriteRecords] = useState([{ type: "url", value: "" }]);
  const [history] = useState(MOCK_HISTORY);
  const [templates, setTemplates] = useState(STARTER_TEMPLATES);
  const [toast, setToast] = useState(null);
  const [opInProgress, setOpInProgress] = useState(null);

  const showToast = useCallback((msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const simulateOp = useCallback((op, duration = 1200) => {
    setOpInProgress(op);

    // If bridge is connected, use real operations
    if (bridge.bridgeStatus === "connected") {
      const opFn = op === "read" ? bridge.readTag
        : op === "write" ? () => bridge.writeTag(writeRecords)
        : op === "erase" ? bridge.eraseTag
        : op === "lock" ? bridge.lockTag
        : null;

      if (opFn) {
        opFn()
          .then(() => {
            setOpInProgress(null);
            showToast(op === "read" ? "Tag read successfully" : op === "write" ? "Tag written!" : op === "erase" ? "Tag erased" : "Tag locked", "success");
          })
          .catch((err) => {
            setOpInProgress(null);
            showToast(err.message, "error");
          });
        return;
      }
    }

    // Fallback: simulated operation
    setTimeout(() => {
      setOpInProgress(null);
      showToast(op === "read" ? "Tag read successfully" : op === "write" ? "Tag written!" : op === "erase" ? "Tag erased" : "Tag locked", "success");
    }, duration);
  }, [bridge, writeRecords, showToast]);

  const addRecord = () => setWriteRecords([...writeRecords, { type: "url", value: "" }]);
  const removeRecord = (i) => setWriteRecords(writeRecords.filter((_, idx) => idx !== i));
  const updateRecord = (i, rec) => setWriteRecords(writeRecords.map((r, idx) => idx === i ? rec : r));
  const loadTemplate = (t) => {
    setWriteRecords(JSON.parse(JSON.stringify(t.records)));
    setActiveTab("write");
    showToast(`Loaded "${t.name}"`, "info");
  };

  // ─── STYLES ───────────────────────────────────────────
  const card = {
    backgroundColor: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: 18, padding: "20px 24px",
  };
  const btnBase = {
    padding: "10px 18px", borderRadius: 10, border: "none", cursor: "pointer", fontSize: 13,
    fontWeight: 600, fontFamily: "'Space Grotesk', sans-serif", transition: "all 0.2s", display: "inline-flex",
    alignItems: "center", gap: 6,
  };

  return (
    <div style={{
      minHeight: "100vh", backgroundColor: "#121010", color: "#E8E0D8",
      fontFamily: "'Space Grotesk', sans-serif",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::selection { background: rgba(212,145,94,0.3); }
        input:focus, textarea:focus, select:focus { border-color: #D4915E !important; outline: none; }
        select option { background: #1C1916; color: #E8E0D8; }
        @keyframes pulse { 0%, 100% { transform: scale(1); opacity: 0.4; } 50% { transform: scale(1.8); opacity: 0; } }
        @keyframes breathe { 0%, 100% { opacity: 0.6; transform: scale(1); } 50% { opacity: 1; transform: scale(1.04); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideToast { from { opacity: 0; transform: translateY(-12px); } to { opacity: 1; transform: translateY(0); } }
        ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.15); }
      `}</style>

      {/* TOAST */}
      {toast && (
        <div style={{
          position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)", zIndex: 1001,
          padding: "12px 24px", borderRadius: 12, fontSize: 13, fontWeight: 600,
          backgroundColor: toast.type === "success" ? "rgba(74,222,128,0.15)" : toast.type === "error" ? "rgba(239,68,68,0.15)" : "rgba(212,145,94,0.15)",
          color: toast.type === "success" ? "#4ADE80" : toast.type === "error" ? "#EF4444" : "#D4915E",
          border: `1px solid ${toast.type === "success" ? "rgba(74,222,128,0.2)" : toast.type === "error" ? "rgba(239,68,68,0.2)" : "rgba(212,145,94,0.2)"}`,
          animation: "slideToast 0.3s ease", backdropFilter: "blur(12px)",
        }}>{toast.msg}</div>
      )}

      {/* LOCK MODAL */}
      {showLockModal && <LockModal onConfirm={() => { setShowLockModal(false); simulateOp("lock"); }} onCancel={() => setShowLockModal(false)} />}

      {/* ─── STATUS BAR ────────────────────────────────── */}
      <div style={{
        borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "0 32px",
        display: "flex", alignItems: "center", justifyContent: "space-between", height: 56,
        backgroundColor: "rgba(255,255,255,0.01)", backdropFilter: "blur(20px)",
        position: "sticky", top: 0, zIndex: 100,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 30, height: 30, borderRadius: 8, backgroundColor: "rgba(212,145,94,0.15)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D4915E" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" />
            </svg>
          </div>
          <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: "-0.01em" }}>NFC Tag Manager</span>
          <span style={{ fontSize: 10, color: "#4A443E", fontFamily: "'IBM Plex Mono', monospace", marginLeft: 4 }}>by Squircle Labs</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          {[
            { label: "Bridge", status: bridgeStatus, detail: bridgeStatus === "connected" ? `v${bridge.bridgeVersion || "1.0.0"} \u00B7 ${bridge.latency != null ? bridge.latency + "ms" : "..."}` : "offline" },
            { label: "Reader", status: readerStatus, detail: readerStatus === "connected" ? (bridge.readerName || "ACR1252U") : "not found" },
            { label: "Tag", status: tag ? "connected" : "disconnected", detail: tag ? truncUID(tag.uid) : "no tag" },
          ].map(s => (
            <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <StatusDot status={s.status} />
              <div>
                <div style={{ fontSize: 10, color: "#6B635B", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "'IBM Plex Mono', monospace", lineHeight: 1 }}>{s.label}</div>
                <div style={{ fontSize: 11, color: s.status === "connected" ? "#C4BAB0" : "#6B635B", fontFamily: "'IBM Plex Mono', monospace", lineHeight: 1.3 }}>{s.detail}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ─── MAIN LAYOUT ──────────────────────────────── */}
      {bridgeStatus === "disconnected" && bridge.bridgeStatus === "disconnected" ? (
        <div style={{ maxWidth: 640, margin: "0 auto", padding: "80px 24px" }}><SetupGuide /></div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 0, minHeight: "calc(100vh - 56px)" }}>
          {/* LEFT: MAIN AREA */}
          <div style={{ padding: "28px 32px", borderRight: "1px solid rgba(255,255,255,0.06)", overflowY: "auto", maxHeight: "calc(100vh - 56px)" }}>
            {/* Tag Info */}
            <TagVisual tag={tag} />

            {/* Action Buttons */}
            {tag && (
              <div style={{ display: "flex", gap: 10, marginTop: 20, marginBottom: 28 }}>
                {[
                  { label: "Read", op: "read", color: "#6EBBF7", bg: "rgba(110,187,247,0.08)", icon: "\u2193" },
                  { label: "Write", op: "write", color: "#D4915E", bg: "rgba(212,145,94,0.08)", icon: "\u2191" },
                  { label: "Erase", op: "erase", color: "#E87272", bg: "rgba(232,114,114,0.08)", icon: "\u2715" },
                  { label: "Lock", op: "lock", color: "#9B7FD4", bg: "rgba(155,127,212,0.08)", icon: "\u{1F512}" },
                ].map(a => (
                  <button key={a.op}
                    disabled={opInProgress !== null}
                    onClick={() => a.op === "lock" ? setShowLockModal(true) : simulateOp(a.op)}
                    style={{
                      ...btnBase, flex: 1, justifyContent: "center",
                      backgroundColor: opInProgress === a.op ? a.color : a.bg,
                      color: opInProgress === a.op ? "#121010" : a.color,
                      opacity: opInProgress && opInProgress !== a.op ? 0.4 : 1,
                    }}
                    onMouseEnter={e => { if (!opInProgress) { e.target.style.backgroundColor = a.color; e.target.style.color = "#121010"; }}}
                    onMouseLeave={e => { if (!opInProgress) { e.target.style.backgroundColor = a.bg; e.target.style.color = a.color; }}}
                  >
                    <span style={{ fontSize: 14 }}>{a.icon}</span>
                    {opInProgress === a.op ? "\u2026" : a.label}
                  </button>
                ))}
              </div>
            )}

            {/* Current Tag Contents */}
            {tag?.records?.length > 0 && (
              <div style={{ ...card, marginBottom: 24 }}>
                <div style={{ fontSize: 11, color: "#6B635B", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "'IBM Plex Mono', monospace", marginBottom: 12 }}>Current Contents</div>
                {tag.records.map((r, i) => (
                  <div key={i} style={{
                    padding: "10px 14px", borderRadius: 10, backgroundColor: "rgba(255,255,255,0.02)",
                    border: "1px solid rgba(255,255,255,0.04)", marginBottom: i < tag.records.length - 1 ? 8 : 0,
                    display: "flex", alignItems: "center", gap: 10,
                  }}>
                    <span style={{ fontSize: 16 }}>{RECORD_TYPES.find(t => t.id === r.type)?.icon || "\u{1F4E6}"}</span>
                    <div>
                      <div style={{ fontSize: 10, color: "#6B635B", textTransform: "uppercase", fontFamily: "'IBM Plex Mono', monospace" }}>{r.type}</div>
                      <div style={{ fontSize: 13, color: "#C4BAB0", fontFamily: "'IBM Plex Mono', monospace", wordBreak: "break-all" }}>{recordSummary([r])}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* WRITE PANEL */}
            {tag && (
              <div style={{ ...card }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
                  <div style={{ fontSize: 11, color: "#6B635B", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "'IBM Plex Mono', monospace" }}>
                    Write Records
                  </div>
                  <div style={{ fontSize: 11, color: "#8A8078", fontFamily: "'IBM Plex Mono', monospace" }}>
                    ~{Math.min(writeRecords.length * 40, tag.capacity)}/{tag.capacity} bytes est.
                  </div>
                </div>
                <div style={{ display: "grid", gap: 16 }}>
                  {writeRecords.map((rec, i) => (
                    <div key={i} style={{
                      padding: "16px 18px", borderRadius: 14, backgroundColor: "rgba(255,255,255,0.015)",
                      border: "1px solid rgba(255,255,255,0.05)", position: "relative",
                    }}>
                      {writeRecords.length > 1 && (
                        <button onClick={() => removeRecord(i)} style={{
                          position: "absolute", top: 10, right: 10, width: 24, height: 24, borderRadius: 6,
                          border: "1px solid rgba(255,255,255,0.08)", backgroundColor: "transparent",
                          color: "#6B635B", cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center",
                        }}>{"\u2715"}</button>
                      )}
                      <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
                        {RECORD_TYPES.map(rt => (
                          <button key={rt.id}
                            onClick={() => updateRecord(i, { type: rt.id, value: rt.id === "vcard" || rt.id === "wifi" || rt.id === "geo" || rt.id === "email" || rt.id === "sms" ? {} : "" })}
                            style={{
                              ...btnBase, padding: "6px 12px", fontSize: 11,
                              backgroundColor: rec.type === rt.id ? "rgba(212,145,94,0.15)" : "rgba(255,255,255,0.03)",
                              color: rec.type === rt.id ? "#D4915E" : "#6B635B",
                              border: rec.type === rt.id ? "1px solid rgba(212,145,94,0.2)" : "1px solid rgba(255,255,255,0.06)",
                            }}
                          >
                            <span style={{ fontSize: 12 }}>{rt.icon}</span>{rt.label}
                          </button>
                        ))}
                      </div>
                      <RecordFields record={rec} onChange={r => updateRecord(i, r)} />
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                  <button onClick={addRecord} style={{
                    ...btnBase, backgroundColor: "rgba(255,255,255,0.03)", color: "#6B635B",
                    border: "1px dashed rgba(255,255,255,0.1)", flex: 1, justifyContent: "center",
                  }}>+ Add Record</button>
                  <button
                    disabled={!tag || opInProgress !== null}
                    onClick={() => simulateOp("write", 1500)}
                    style={{
                      ...btnBase, backgroundColor: "#D4915E", color: "#121010", flex: 2, justifyContent: "center",
                      opacity: !tag ? 0.4 : 1,
                    }}
                  >
                    {opInProgress === "write" ? "Writing\u2026" : "\u26A1 Write to Tag"}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT: SIDEBAR */}
          <div style={{ backgroundColor: "rgba(255,255,255,0.01)", overflowY: "auto", maxHeight: "calc(100vh - 56px)" }}>
            {/* Tabs */}
            <div style={{
              display: "flex", borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "0 20px",
              position: "sticky", top: 0, backgroundColor: "rgba(18,16,16,0.95)", backdropFilter: "blur(12px)", zIndex: 10,
            }}>
              {[["history", "History"], ["templates", "Templates"]].map(([id, label]) => (
                <button key={id} onClick={() => setActiveTab(id)} style={{
                  ...btnBase, borderRadius: 0, backgroundColor: "transparent", padding: "14px 16px",
                  color: activeTab === id ? "#D4915E" : "#6B635B", fontSize: 12,
                  borderBottom: activeTab === id ? "2px solid #D4915E" : "2px solid transparent",
                  letterSpacing: "0.04em", textTransform: "uppercase",
                }}>
                  {label}
                </button>
              ))}
            </div>
            <div style={{ padding: "16px 20px" }}>
              {/* HISTORY TAB */}
              {activeTab === "history" && (
                <div style={{ animation: "fadeIn 0.3s ease" }}>
                  {history.map(h => (
                    <div key={h.id} style={{
                      padding: "14px 16px", borderRadius: 14, marginBottom: 8,
                      backgroundColor: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.04)",
                      cursor: "pointer", transition: "border-color 0.2s",
                    }}
                      onMouseEnter={e => e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"}
                      onMouseLeave={e => e.currentTarget.style.borderColor = "rgba(255,255,255,0.04)"}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{
                            display: "inline-block", padding: "2px 8px", borderRadius: 6, fontSize: 10,
                            fontWeight: 600, textTransform: "uppercase", fontFamily: "'IBM Plex Mono', monospace",
                            backgroundColor: `${actionColor(h.action)}15`, color: actionColor(h.action),
                          }}>{h.action}</span>
                          <span style={{ fontSize: 11, color: "#6B635B", fontFamily: "'IBM Plex Mono', monospace" }}>{truncUID(h.uid)}</span>
                        </div>
                        <span style={{ fontSize: 10, color: "#4A443E", fontFamily: "'IBM Plex Mono', monospace" }}>{formatTime(h.created_at)}</span>
                      </div>
                      {h.label && <div style={{ fontSize: 12, color: "#C4BAB0", fontWeight: 500, marginBottom: 4 }}>{h.label}</div>}
                      <div style={{ fontSize: 11, color: "#6B635B", fontFamily: "'IBM Plex Mono', monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {recordSummary(h.records)}
                      </div>
                      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                        <button onClick={() => { setWriteRecords(JSON.parse(JSON.stringify(h.records))); setActiveTab("write"); showToast("Loaded into write panel", "info"); }} style={{
                          ...btnBase, padding: "4px 10px", fontSize: 10, backgroundColor: "rgba(212,145,94,0.08)",
                          color: "#D4915E", border: "1px solid rgba(212,145,94,0.1)",
                        }}>Re-write</button>
                        <button style={{
                          ...btnBase, padding: "4px 10px", fontSize: 10, backgroundColor: "rgba(255,255,255,0.03)",
                          color: "#6B635B", border: "1px solid rgba(255,255,255,0.06)",
                        }}>Label</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* TEMPLATES TAB */}
              {activeTab === "templates" && (
                <div style={{ animation: "fadeIn 0.3s ease" }}>
                  {templates.map(t => (
                    <div key={t.id} style={{
                      padding: "14px 16px", borderRadius: 14, marginBottom: 8,
                      backgroundColor: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.04)",
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                    }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#C4BAB0", marginBottom: 3 }}>{t.name}</div>
                        <div style={{ fontSize: 11, color: "#6B635B", fontFamily: "'IBM Plex Mono', monospace" }}>
                          {t.records.length} record{t.records.length !== 1 ? "s" : ""} {"\u00B7"} {t.records.map(r => r.type).join(", ")}
                        </div>
                      </div>
                      <button onClick={() => loadTemplate(t)} style={{
                        ...btnBase, padding: "6px 14px", fontSize: 11, backgroundColor: "rgba(212,145,94,0.08)",
                        color: "#D4915E", border: "1px solid rgba(212,145,94,0.12)",
                      }}>Load</button>
                    </div>
                  ))}
                  <button style={{
                    ...btnBase, width: "100%", justifyContent: "center", marginTop: 8,
                    backgroundColor: "rgba(255,255,255,0.03)", color: "#6B635B",
                    border: "1px dashed rgba(255,255,255,0.08)",
                  }}>+ Save Current as Template</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── KEYBOARD SHORTCUTS HINT ─────────────────── */}
      <div style={{
        position: "fixed", bottom: 16, left: "50%", transform: "translateX(-50%)",
        display: "flex", gap: 16, padding: "8px 20px", borderRadius: 12,
        backgroundColor: "rgba(28,25,22,0.9)", border: "1px solid rgba(255,255,255,0.06)",
        backdropFilter: "blur(12px)", zIndex: 50,
      }}>
        {[["R", "Read"], ["W", "Write"], ["Esc", "Cancel"]].map(([key, label]) => (
          <div key={key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <kbd style={{
              display: "inline-block", padding: "2px 6px", borderRadius: 4, fontSize: 10,
              fontFamily: "'IBM Plex Mono', monospace", backgroundColor: "rgba(255,255,255,0.06)",
              color: "#8A8078", border: "1px solid rgba(255,255,255,0.08)",
            }}>{key}</kbd>
            <span style={{ fontSize: 10, color: "#4A443E" }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
