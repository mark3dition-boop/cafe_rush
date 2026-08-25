import { useState, useCallback, useEffect, useRef } from "react";
import { fetchTables, connectWebSocket, getVideoFeedUrl, updateCameraControl, analyzeTable, type WSMessage, type SessionData, type CameraState } from "./api";

type TableStatus = "available" | "occupied" | "reserved";
type TableShape = "round" | "rect" | "bar";
type NavPage = "floor" | "camera" | "reservations" | "settings";

interface Table {
  id: string;
  number: number;
  seats: number;
  shape: TableShape;
  x: number;
  y: number;
  w: number;
  h: number;
  zone: string;
  status: TableStatus;
  label?: string;
}

const STATUS_CONFIG: Record<TableStatus, { bg: string; bgDark: string; border: string; text: string; textDark: string; label: string; dot: string }> = {
  available: { bg: "#e8f5ee", bgDark: "#1a3327", border: "#3d8c5a", text: "#2a6340", textDark: "#6dba8c", label: "Available", dot: "#3d8c5a" },
  occupied:  { bg: "#fdeee6", bgDark: "#331a0f", border: "#c55a2b", text: "#8c3915", textDark: "#e0804e", label: "Occupied",  dot: "#c55a2b" },
  reserved:  { bg: "#ede8f5", bgDark: "#221830", border: "#7a5ea7", text: "#4e3a77", textDark: "#a98fd4", label: "Reserved",  dot: "#7a5ea7" },
};

const NEXT_STATUS: Record<TableStatus, TableStatus> = {
  available: "occupied",
  occupied: "reserved",
  reserved: "available",
};

const ZONES = [
  { id: "indoor",  label: "Main Floor",   color: "#faf6f0", border: "#d9cfc4" },
  { id: "window",  label: "Window Seats", color: "#f5f0e8", border: "#d9cfc4" },
  { id: "patio",   label: "Patio",        color: "#eef5e8", border: "#b5cfa5" },
  { id: "bar",     label: "Bar",          color: "#f5eae8", border: "#d4afa8" },
];

const INITIAL_TABLES: Table[] = [
  { id: "t1",  number: 1,  seats: 2, shape: "round", x: 12, y: 22, w: 9,  h: 12, zone: "indoor",  status: "available" },
  { id: "t2",  number: 2,  seats: 2, shape: "round", x: 24, y: 22, w: 9,  h: 12, zone: "indoor",  status: "occupied"  },
  { id: "t3",  number: 3,  seats: 4, shape: "rect",  x: 36, y: 20, w: 12, h: 14, zone: "indoor",  status: "available" },
  { id: "t4",  number: 4,  seats: 4, shape: "rect",  x: 51, y: 20, w: 12, h: 14, zone: "indoor",  status: "reserved"  },
  { id: "t5",  number: 5,  seats: 6, shape: "rect",  x: 13, y: 44, w: 16, h: 14, zone: "indoor",  status: "occupied"  },
  { id: "t6",  number: 6,  seats: 4, shape: "rect",  x: 33, y: 44, w: 12, h: 14, zone: "indoor",  status: "available" },
  { id: "t7",  number: 7,  seats: 4, shape: "rect",  x: 49, y: 44, w: 12, h: 14, zone: "indoor",  status: "available" },
  { id: "t8",  number: 8,  seats: 2, shape: "rect",  x: 67, y: 17, w: 9,  h: 8,  zone: "window",  status: "available" },
  { id: "t9",  number: 9,  seats: 2, shape: "rect",  x: 67, y: 28, w: 9,  h: 8,  zone: "window",  status: "occupied"  },
  { id: "t10", number: 10, seats: 2, shape: "rect",  x: 67, y: 39, w: 9,  h: 8,  zone: "window",  status: "reserved"  },
  { id: "t11", number: 11, seats: 2, shape: "round", x: 13, y: 72, w: 9,  h: 12, zone: "patio",   status: "available" },
  { id: "t12", number: 12, seats: 2, shape: "round", x: 26, y: 72, w: 9,  h: 12, zone: "patio",   status: "available" },
  { id: "t13", number: 13, seats: 4, shape: "round", x: 39, y: 70, w: 11, h: 14, zone: "patio",   status: "occupied"  },
  { id: "t14", number: 14, seats: 4, shape: "round", x: 53, y: 70, w: 11, h: 14, zone: "patio",   status: "available" },
  { id: "b1",  number: 15, seats: 1, shape: "bar",   x: 67, y: 68, w: 5,  h: 7,  zone: "bar",     status: "available", label: "B1" },
  { id: "b2",  number: 16, seats: 1, shape: "bar",   x: 73, y: 68, w: 5,  h: 7,  zone: "bar",     status: "occupied",  label: "B2" },
  { id: "b3",  number: 17, seats: 1, shape: "bar",   x: 79, y: 68, w: 5,  h: 7,  zone: "bar",     status: "available", label: "B3" },
  { id: "b4",  number: 18, seats: 1, shape: "bar",   x: 85, y: 68, w: 5,  h: 7,  zone: "bar",     status: "reserved",  label: "B4" },
  { id: "b5",  number: 19, seats: 1, shape: "bar",   x: 79, y: 78, w: 5,  h: 7,  zone: "bar",     status: "available", label: "B5" },
  { id: "b6",  number: 20, seats: 1, shape: "bar",   x: 85, y: 78, w: 5,  h: 7,  zone: "bar",     status: "available", label: "B6" },
];

const ZONE_REGIONS = [
  { id: "indoor",  x: "7%",  y: "12%", w: "59%", h: "50%", label: "Main Floor"   },
  { id: "window",  x: "63%", y: "10%", w: "17%", h: "46%", label: "Window Seats" },
  { id: "patio",   x: "7%",  y: "65%", w: "59%", h: "28%", label: "Patio"        },
  { id: "bar",     x: "63%", y: "59%", w: "30%", h: "34%", label: "Bar"          },
];

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      style={{
        width: 44, height: 24, borderRadius: 12,
        background: on ? "#c55a2b" : "var(--color-border)",
        border: "none", cursor: "pointer", position: "relative",
        transition: "background 0.2s", flexShrink: 0,
        padding: 0,
      }}
    >
      <span style={{
        position: "absolute", top: 3, left: on ? 23 : 3,
        width: 18, height: 18, borderRadius: "50%",
        background: "#fff",
        transition: "left 0.2s",
        boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
        display: "block",
      }} />
    </button>
  );
}

function IconHome({ active, dark }: { active: boolean; dark: boolean }) {
  const inactive = dark ? "#6a5a50" : "#8a7b6e";
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#c55a2b" : inactive} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" />
      <path d="M9 21V12h6v9" />
    </svg>
  );
}

function IconCamera({ active, dark }: { active: boolean; dark?: boolean }) {
  const inactive = dark ? "#6a5a50" : "#8a7b6e";
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#c55a2b" : inactive} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

function IconGrid({ active, dark }: { active: boolean; dark?: boolean }) {
  const inactive = dark ? "#6a5a50" : "#8a7b6e";
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#c55a2b" : inactive} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function IconMenu({ active, dark }: { active: boolean; dark?: boolean }) {
  const inactive = dark ? "#6a5a50" : "#8a7b6e";
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#c55a2b" : inactive} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
      <rect x="9" y="3" width="6" height="4" rx="1" />
      <line x1="9" y1="12" x2="15" y2="12" />
      <line x1="9" y1="16" x2="13" y2="16" />
    </svg>
  );
}

function IconSettings({ active, dark }: { active: boolean; dark?: boolean }) {
  const inactive = dark ? "#6a5a50" : "#8a7b6e";
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#c55a2b" : inactive} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  );
}

function IconBell({ dark }: { dark: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={dark ? "#7a6a5e" : "#8a7b6e"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 01-3.46 0" />
    </svg>
  );
}

function IconCameraTopBar({ dark }: { dark: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={dark ? "#7a6a5e" : "#8a7b6e"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

function IconMoon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
    </svg>
  );
}

function IconSun() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

function TableItem({ table, onClick, dark }: { table: Table; onClick: () => void; dark: boolean }) {
  const cfg = STATUS_CONFIG[table.status];
  const isBar = table.shape === "bar";
  const isRound = table.shape === "round";
  const bg = dark ? cfg.bgDark : cfg.bg;
  const textColor = dark ? cfg.textDark : cfg.text;

  return (
    <div
      onClick={onClick}
      title={`Table ${table.label ?? table.number} · ${table.seats} seat${table.seats > 1 ? "s" : ""} · ${cfg.label}`}
      style={{
        position: "absolute",
        left: `${table.x}%`,
        top: `${table.y}%`,
        width: `${table.w}%`,
        height: `${table.h}%`,
        borderRadius: isRound ? "50%" : isBar ? "6px" : "8px",
        background: bg,
        border: `2px solid ${cfg.border}`,
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        transition: "transform 0.12s ease, box-shadow 0.12s ease",
        userSelect: "none",
        boxShadow: dark ? "0 1px 4px rgba(0,0,0,0.4)" : "0 1px 3px rgba(44,31,20,0.10)",
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.transform = "scale(1.06)";
        (e.currentTarget as HTMLElement).style.boxShadow = `0 4px 14px ${cfg.border}55`;
        (e.currentTarget as HTMLElement).style.zIndex = "20";
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.transform = "scale(1)";
        (e.currentTarget as HTMLElement).style.boxShadow = dark ? "0 1px 4px rgba(0,0,0,0.4)" : "0 1px 3px rgba(44,31,20,0.10)";
        (e.currentTarget as HTMLElement).style.zIndex = "";
      }}
    >
      <span style={{ fontSize: isBar ? "10px" : "11px", fontWeight: 700, color: textColor, lineHeight: 1, fontFamily: "var(--font-sans)" }}>
        {table.label ?? table.number}
      </span>
      {!isBar && (
        <span style={{ fontSize: "9px", color: textColor, opacity: 0.75, marginTop: 2 }}>{table.seats}p</span>
      )}
    </div>
  );
}

function SettingRow({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "14px 0",
      borderBottom: "1px solid var(--color-border)",
      gap: 16,
    }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-foreground)" }}>{label}</div>
        {description && <div style={{ fontSize: 12, color: "var(--color-muted)", marginTop: 2 }}>{description}</div>}
      </div>
      {children}
    </div>
  );
}

function SettingsPage({ dark, setDark, notifEnabled, setNotifEnabled }: {
  dark: boolean;
  setDark: (v: boolean) => void;
  notifEnabled: boolean;
  setNotifEnabled: (v: boolean) => void;
}) {
  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "32px 40px", maxWidth: 560 }}>
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 600, color: "var(--color-foreground)", margin: "0 0 4px" }}>Settings</h2>
        <p style={{ fontSize: 13, color: "var(--color-muted)", margin: 0 }}>Manage your app preferences</p>
      </div>

      {/* Appearance section */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--color-muted)", marginBottom: 4 }}>
          Appearance
        </div>
        <div style={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 12, padding: "0 20px" }}>
          <SettingRow
            label="Dark Mode"
            description="Switch to a dark color scheme"
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--color-muted)" }}>
              <span style={{ fontSize: 14 }}><IconSun /></span>
              <Toggle on={dark} onChange={setDark} />
              <span style={{ fontSize: 14 }}><IconMoon /></span>
            </div>
          </SettingRow>
        </div>
      </div>

      {/* Notifications section */}
      <div style={{ marginTop: 24, marginBottom: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--color-muted)", marginBottom: 4 }}>
          Notifications
        </div>
        <div style={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 12, padding: "0 20px" }}>
          <SettingRow
            label="Push Notifications"
            description="Get alerts for table and reservation updates"
          >
            <Toggle on={notifEnabled} onChange={setNotifEnabled} />
          </SettingRow>
          <SettingRow
            label="Sound Alerts"
            description="Play a sound when a new notification arrives"
          >
            <Toggle on={notifEnabled && false} onChange={() => {}} />
          </SettingRow>
        </div>
      </div>

      {/* About section */}
      <div style={{ marginTop: 24 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--color-muted)", marginBottom: 4 }}>
          About
        </div>
        <div style={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 12, padding: "0 20px" }}>
          <SettingRow label="App Version"><span style={{ fontSize: 13, color: "var(--color-muted)" }}>1.0.0</span></SettingRow>
          <SettingRow label="Venue"><span style={{ fontSize: 13, color: "var(--color-muted)" }}>Café Floor Manager</span></SettingRow>
        </div>
      </div>
    </div>
  );
}

const NAV_ITEMS: { id: NavPage; label: string; icon: (active: boolean, dark: boolean) => JSX.Element }[] = [
  { id: "floor",        label: "Floor",        icon: (a, d) => <IconGrid active={a} dark={d} /> },
  { id: "camera",       label: "Camera",       icon: (a, d) => <IconCamera active={a} dark={d} /> },
  { id: "reservations", label: "Reservations", icon: (a, d) => <IconMenu active={a} dark={d} /> },
  { id: "settings",     label: "Settings",     icon: (a, d) => <IconSettings active={a} dark={d} /> },
];

function CameraPage({
  dark,
  liveSessions,
  backendConnected,
}: {
  dark: boolean;
  liveSessions: Record<string, SessionData>;
  backendConnected: boolean;
}) {
  const [selectedCam, setSelectedCam] = useState("cam1");
  const [showOverlay, setShowOverlay] = useState(true);
  const [paused, setPaused] = useState(false);
  const [sourceMode, setSourceMode] = useState<"video" | "webcam">("video");
  const [selectedTableForAi, setSelectedTableForAi] = useState("1");
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [aiOutput, setAiOutput] = useState<string | null>(null);
  const [showThinking, setShowThinking] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const cameras = [
    { id: "cam1", label: "Cam 1 · Main Floor", status: "Active (YOLO Pose)", zone: "Indoor" },
    { id: "cam2", label: "Cam 2 · Window Seats", status: "Standby", zone: "Window" },
    { id: "cam3", label: "Cam 3 · Outdoor Patio", status: "Standby", zone: "Patio" },
    { id: "cam4", label: "Cam 4 · Coffee Bar", status: "Standby", zone: "Bar" },
  ];

  const handleToggleOverlay = async (val: boolean) => {
    setShowOverlay(val);
    try {
      await updateCameraControl({ show_overlay: val });
    } catch (e) {}
  };

  const handleTogglePause = async () => {
    const next = !paused;
    setPaused(next);
    try {
      await updateCameraControl({ paused: next });
    } catch (e) {}
  };

  const handleSwitchSource = async (mode: "video" | "webcam") => {
    setSourceMode(mode);
    try {
      await updateCameraControl({ source: mode === "video" ? "test2.mov" : "0" });
    } catch (e) {}
  };

  const handleRunAiAnalysisForTable = async (tableId: string) => {
    setSelectedTableForAi(tableId);
    setAiAnalyzing(true);
    setAiOutput(null);
    setShowThinking(false);
    try {
      const sess = liveSessions[tableId];
      const durationMins = sess ? Math.max(1, Math.floor(sess.sitting_duration / 60)) : 2;
      const res = await analyzeTable(tableId, sess?.person_count || 1, durationMins);
      setAiOutput(res.recommendation);
    } catch (err: any) {
      setAiOutput("Error invoking AI agent: " + (err.message || "Backend offline"));
    } finally {
      setAiAnalyzing(false);
    }
  };

  // Filter occupant sessions to active, non-ghost tracks
  const activeOccupants = Object.values(liveSessions).filter(
    (sess) => sess.status === "ACTIVE" && (sess.state === "SITTING" || sess.state === "STANDING" || sess.sitting_duration > 0)
  );

  // Parse raw AI output into thought process, status badge, analysis, and action script
  let thoughtProcess = "";
  let cleanRecommendation = aiOutput || "";

  if (cleanRecommendation.includes("<think>")) {
    if (cleanRecommendation.includes("</think>")) {
      const parts = cleanRecommendation.split("</think>");
      thoughtProcess = parts[0].replace("<think>", "").strip ? parts[0].replace("<think>", "").trim() : parts[0].replace("<think>", "");
      cleanRecommendation = parts[1].trim();
    }
  }

  // Extract status pill color
  let statusBadge = { label: "SAFE / AMAN", color: "#3d8c5a", bg: "rgba(61,140,90,0.15)" };
  if (cleanRecommendation.toLowerCase().includes("warning")) {
    statusBadge = { label: "WARNING / MONITOR", color: "#c55a2b", bg: "rgba(197,90,43,0.18)" };
  } else if (cleanRecommendation.toLowerCase().includes("alert")) {
    statusBadge = { label: "ALERT / ACTION REQUIRED", color: "#d93838", bg: "rgba(217,56,56,0.18)" };
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--color-background)", position: "relative" }}>
      {/* Toast Notification */}
      {toastMessage && (
        <div style={{
          position: "absolute",
          top: 16,
          right: 24,
          background: "#3d8c5a",
          color: "#fff",
          padding: "10px 18px",
          borderRadius: 8,
          fontSize: 13,
          fontWeight: 600,
          boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
          zIndex: 1000,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}>
          <span>✅</span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top camera zone selector tabs */}
      <div style={{
        padding: "12px 24px",
        borderBottom: "1px solid var(--color-border)",
        background: "var(--color-card)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
      }}>
        <div style={{ display: "flex", gap: 8, overflowX: "auto" }}>
          {cameras.map((c) => {
            const active = selectedCam === c.id;
            return (
              <button
                key={c.id}
                onClick={() => setSelectedCam(c.id)}
                style={{
                  padding: "8px 16px",
                  borderRadius: 8,
                  border: active ? "1.5px solid var(--color-accent)" : "1px solid var(--color-border)",
                  background: active ? (dark ? "rgba(197,90,43,0.18)" : "#f5ece5") : "transparent",
                  color: active ? "var(--color-accent)" : "var(--color-foreground)",
                  fontWeight: active ? 700 : 500,
                  fontSize: 13,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  transition: "all 0.15s ease",
                }}
              >
                <span style={{
                  width: 7, height: 7, borderRadius: "50%",
                  background: c.id === "cam1" && backendConnected ? "#3d8c5a" : "#8a7b6e"
                }} />
                {c.label}
              </button>
            );
          })}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={() => handleSwitchSource(sourceMode === "video" ? "webcam" : "video")}
            style={{
              padding: "6px 12px",
              borderRadius: 6,
              border: "1px solid var(--color-border)",
              background: "var(--color-background)",
              fontSize: 12,
              fontWeight: 600,
              color: "var(--color-foreground)",
              cursor: "pointer",
            }}
          >
            Source: {sourceMode === "video" ? "📹 test2.mov" : "📷 Webcam (0)"}
          </button>
          <button
            onClick={handleTogglePause}
            style={{
              padding: "6px 12px",
              borderRadius: 6,
              border: "1px solid var(--color-border)",
              background: paused ? "#c55a2b" : "var(--color-background)",
              color: paused ? "#fff" : "var(--color-foreground)",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {paused ? "▶ Resume" : "⏸ Pause Stream"}
          </button>
        </div>
      </div>

      {/* Main camera view & telemetry content area */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden", padding: 24, gap: 20 }}>
        {/* Left: Video Player feed & AI Panel */}
        <div style={{ flex: 3, display: "flex", flexDirection: "column", gap: 16, overflowY: "auto" }}>
          <div style={{
            position: "relative",
            minHeight: 380,
            height: 380,
            background: "#000",
            borderRadius: 16,
            overflow: "hidden",
            border: "1px solid var(--color-border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: dark ? "0 8px 32px rgba(0,0,0,0.6)" : "0 8px 24px rgba(44,31,20,0.12)",
          }}>
            {/* Live MJPEG Feed or Standby Graphic */}
            {selectedCam === "cam1" && backendConnected && !paused ? (
              <img
                src={getVideoFeedUrl()}
                alt="AI Camera Live Feed"
                style={{ width: "100%", height: "100%", objectFit: "contain" }}
                onError={(e) => {
                  (e.currentTarget as HTMLElement).style.display = "none";
                }}
              />
            ) : (
              <div style={{ textAlign: "center", color: "#8a7b6e", padding: 40 }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>📹</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#d9cfc4" }}>
                  {selectedCam === "cam1" ? (paused ? "Stream Paused" : "Waiting for CV Pipeline...") : `${cameras.find(c=>c.id===selectedCam)?.label} Standby`}
                </div>
                <div style={{ fontSize: 12, marginTop: 6, opacity: 0.7 }}>
                  {selectedCam === "cam1" ? "Ensure main.py and backend are active." : "Multi-camera angle offline"}
                </div>
              </div>
            )}

            {/* Overlays on top of video */}
            <div style={{
              position: "absolute",
              top: 16,
              left: 16,
              display: "flex",
              gap: 8,
              alignItems: "center",
            }}>
              <span style={{
                background: "rgba(0,0,0,0.75)",
                backdropFilter: "blur(6px)",
                color: "#fff",
                padding: "4px 10px",
                borderRadius: 20,
                fontSize: 11,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                gap: 6,
                border: "1px solid rgba(255,255,255,0.15)",
              }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#3d8c5a" }} />
                LIVE AI STREAM
              </span>
              <span style={{
                background: "rgba(0,0,0,0.75)",
                backdropFilter: "blur(6px)",
                color: "#d9cfc4",
                padding: "4px 10px",
                borderRadius: 20,
                fontSize: 11,
                fontWeight: 600,
                border: "1px solid rgba(255,255,255,0.15)",
              }}>
                YOLOv8 Pose · 25 FPS
              </span>
            </div>

            {/* Video overlay controls on bottom right */}
            <div style={{
              position: "absolute",
              bottom: 16,
              right: 16,
              display: "flex",
              gap: 8,
            }}>
              <button
                onClick={() => handleToggleOverlay(!showOverlay)}
                style={{
                  background: showOverlay ? "rgba(197,90,43,0.85)" : "rgba(0,0,0,0.75)",
                  color: "#fff",
                  border: "1px solid rgba(255,255,255,0.2)",
                  padding: "6px 12px",
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {showOverlay ? "🎯 Keypoints: ON" : "🎯 Keypoints: OFF"}
              </button>
            </div>
          </div>

          {/* AI Trigger bar */}
          <div style={{
            background: "var(--color-card)",
            border: "1px solid var(--color-border)",
            borderRadius: 12,
            padding: "14px 20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
          }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--color-foreground)" }}>
                🤖 Interactive AI LangGraph Agent Analysis
              </div>
              <div style={{ fontSize: 11, color: "var(--color-muted)" }}>
                Select a table or click an occupant card on the right to analyze instant recommendations.
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <select
                value={selectedTableForAi}
                onChange={(e) => setSelectedTableForAi(e.target.value)}
                style={{
                  padding: "6px 12px",
                  borderRadius: 6,
                  border: "1px solid var(--color-border)",
                  background: "var(--color-background)",
                  color: "var(--color-foreground)",
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map((t) => (
                  <option key={t} value={String(t)}>Table #{t}</option>
                ))}
              </select>
              <button
                onClick={() => handleRunAiAnalysisForTable(selectedTableForAi)}
                disabled={aiAnalyzing}
                style={{
                  padding: "8px 16px",
                  borderRadius: 6,
                  background: "#c55a2b",
                  color: "#fff",
                  border: "none",
                  fontWeight: 700,
                  fontSize: 12,
                  cursor: aiAnalyzing ? "wait" : "pointer",
                  opacity: aiAnalyzing ? 0.7 : 1,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                {aiAnalyzing ? "Analyzing..." : "Analyze Table"}
              </button>
            </div>
          </div>

          {/* Formatted LangGraph AI Output Card */}
          {aiOutput && (
            <div style={{
              background: dark ? "#1a120e" : "#fdfaf7",
              border: "1.5px solid #c55a2b",
              borderRadius: 14,
              padding: 20,
              display: "flex",
              flexDirection: "column",
              gap: 14,
              boxShadow: "0 4px 20px rgba(197,90,43,0.12)",
            }}>
              {/* Header Badge */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 18 }}>🤖</span>
                  <span style={{ fontSize: 15, fontWeight: 700, color: "var(--color-foreground)" }}>
                    LangGraph AI Analysis — Table #{selectedTableForAi}
                  </span>
                </div>

                <span style={{
                  padding: "4px 12px",
                  borderRadius: 20,
                  fontSize: 11,
                  fontWeight: 700,
                  background: statusBadge.bg,
                  color: statusBadge.color,
                  border: `1px solid ${statusBadge.color}44`,
                }}>
                  {statusBadge.label}
                </span>
              </div>

              {/* Clean Output Body */}
              <div style={{
                background: "var(--color-card)",
                border: "1px solid var(--color-border)",
                borderRadius: 10,
                padding: 16,
                fontSize: 13,
                color: "var(--color-foreground)",
                lineHeight: 1.6,
                whiteSpace: "pre-wrap",
              }}>
                {cleanRecommendation}
              </div>

              {/* Interactive Staff Action Buttons */}
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(cleanRecommendation);
                    triggerToast(`Copied recommendation for Table #${selectedTableForAi}!`);
                  }}
                  style={{
                    padding: "8px 14px",
                    borderRadius: 8,
                    border: "1px solid var(--color-border)",
                    background: "var(--color-background)",
                    color: "var(--color-foreground)",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  📋 Copy Customer Script
                </button>

                <button
                  onClick={() => {
                    triggerToast(`Dispatched staff alert for Table #${selectedTableForAi}!`);
                  }}
                  style={{
                    padding: "8px 14px",
                    borderRadius: 8,
                    border: "none",
                    background: "#c55a2b",
                    color: "#fff",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  🚨 Dispatch Staff Notification
                </button>
              </div>

              {/* Collapsible AI Thought Process (Reasoning LLM tokens) */}
              {thoughtProcess && (
                <div style={{ marginTop: 4, borderTop: "1px dashed var(--color-border)", paddingTop: 10 }}>
                  <button
                    onClick={() => setShowThinking(!showThinking)}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "var(--color-muted)",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: 0,
                    }}
                  >
                    <span>🧠 {showThinking ? "Hide AI Thought Process" : "View AI Thought Process (Step-by-Step Reasoning)"}</span>
                    <span>{showThinking ? "▲" : "▼"}</span>
                  </button>

                  {showThinking && (
                    <div style={{
                      marginTop: 10,
                      background: dark ? "#110b08" : "#f4eee8",
                      border: "1px solid var(--color-border)",
                      borderRadius: 8,
                      padding: 14,
                      fontSize: 12,
                      fontFamily: "monospace",
                      color: "var(--color-muted)",
                      maxHeight: 180,
                      overflowY: "auto",
                      whiteSpace: "pre-wrap",
                    }}>
                      {thoughtProcess}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: Live Pose Telemetry & Detections Panel */}
        <div style={{
          flex: 1.2,
          minWidth: 320,
          background: "var(--color-card)",
          border: "1px solid var(--color-border)",
          borderRadius: 16,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}>
          <div style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--color-border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--color-foreground)" }}>
                Detected Occupants ({activeOccupants.length})
              </h3>
              <div style={{ fontSize: 11, color: "var(--color-muted)", marginTop: 2 }}>
                Click any table to run 1-click AI Analysis
              </div>
            </div>
            <span style={{
              padding: "3px 8px",
              borderRadius: 10,
              fontSize: 10,
              fontWeight: 700,
              background: backendConnected ? "rgba(61,140,90,0.18)" : "rgba(138,123,110,0.18)",
              color: backendConnected ? "#3d8c5a" : "#8a7b6e",
            }}>
              {backendConnected ? "● Live" : "Offline"}
            </span>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            {activeOccupants.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 10px", color: "var(--color-muted)", fontSize: 13 }}>
                No active occupant tracks registered yet. Start main.py to send detection metrics.
              </div>
            ) : (
              activeOccupants.map((sess) => {
                const isSitting = sess.state === "SITTING";
                const isSelected = selectedTableForAi === sess.table_id;
                return (
                  <div
                    key={sess.session_id}
                    onClick={() => handleRunAiAnalysisForTable(sess.table_id)}
                    style={{
                      background: isSelected
                        ? (dark ? "rgba(197,90,43,0.22)" : "#f7ede6")
                        : "var(--color-background)",
                      border: isSelected ? "1.5px solid #c55a2b" : "1px solid var(--color-border)",
                      borderRadius: 10,
                      padding: 14,
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                      cursor: "pointer",
                      transition: "transform 0.12s ease, border-color 0.12s ease",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.transform = "scale(1.02)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.transform = "scale(1)";
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "var(--color-foreground)" }}>
                        Table #{sess.table_id} · Track #{sess.track_id}
                      </span>
                      <span style={{
                        padding: "2px 8px",
                        borderRadius: 12,
                        fontSize: 10,
                        fontWeight: 700,
                        background: isSitting ? "rgba(197,90,43,0.18)" : "rgba(61,140,90,0.18)",
                        color: isSitting ? "#c55a2b" : "#3d8c5a",
                      }}>
                        {sess.state}
                      </span>
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--color-muted)" }}>
                      <span>Sitting Duration:</span>
                      <span style={{ fontWeight: 600, color: "var(--color-foreground)" }}>
                        {sess.sitting_duration.toFixed(1)}s
                      </span>
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11 }}>
                      <span style={{ color: "var(--color-muted)" }}>Session Status:</span>
                      <span style={{ fontWeight: 700, color: "#3d8c5a" }}>
                        {sess.status}
                      </span>
                    </div>

                    <div style={{
                      marginTop: 2,
                      fontSize: 11,
                      fontWeight: 700,
                      color: "#c55a2b",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "flex-end",
                      gap: 4,
                    }}>
                      <span>✨ Click to Analyze</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function PlaceholderPage({ title, icon }: { title: string; icon: JSX.Element }) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, color: "var(--color-muted)" }}>
      <div style={{ opacity: 0.35, transform: "scale(2)" }}>{icon}</div>
      <p style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>{title}</p>
      <p style={{ fontSize: 12, margin: 0 }}>Coming soon</p>
    </div>
  );
}

export default function App() {
  const [tables, setTables] = useState<Table[]>(INITIAL_TABLES);
  const [activeZone, setActiveZone] = useState<string | null>(null);
  const [activePage, setActivePage] = useState<NavPage>("floor");
  const [notifications, setNotifications] = useState(3);
  const [notifOpen, setNotifOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const [notifEnabled, setNotifEnabled] = useState(true);
  const [backendConnected, setBackendConnected] = useState(false);
  const [liveSessions, setLiveSessions] = useState<Record<string, SessionData>>({});
  const [aiNotifications, setAiNotifications] = useState<Array<{ text: string; time: string; dot: string }>>([]);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    if (dark) root.classList.add("dark");
    else root.classList.remove("dark");
  }, [dark]);

  // ================================================================
  // Apply live session data from backend onto table layout
  // ================================================================
  const applySessionToTables = useCallback((session: SessionData) => {
    setLiveSessions(prev => ({ ...prev, [session.table_id]: session }));
    setTables(prev =>
      prev.map(table => {
        if (table.id !== `t${session.table_id}`) return table;
        const newStatus: TableStatus =
          session.state === "SITTING" ? "occupied" :
          session.state === "STANDING" ? "available" :
          table.status;
        return { ...table, status: newStatus };
      })
    );
  }, []);

  // ================================================================
  // Poll backend every 5 seconds (fallback for WebSocket)
  // ================================================================
  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      try {
        const data = await fetchTables();
        if (cancelled) return;
        setBackendConnected(true);
        data.tables.forEach((session) => {
          applySessionToTables(session);
        });
      } catch {
        if (!cancelled) setBackendConnected(false);
      }
    };

    poll(); // initial fetch
    const interval = setInterval(poll, 5000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [applySessionToTables]);

  // ================================================================
  // WebSocket for real-time updates
  // ================================================================
  useEffect(() => {
    const ws = connectWebSocket((msg: WSMessage) => {
      setBackendConnected(true);

      if (msg.type === "session_update") {
        applySessionToTables(msg.data);
      } else if (msg.type === "ai_recommendation") {
        // Add AI recommendation as a notification
        setAiNotifications(prev => [
          {
            text: `Table ${msg.data.table_id}: ${msg.data.recommendation.slice(0, 80)}...`,
            time: "Just now",
            dot: "#c55a2b",
          },
          ...prev.slice(0, 9), // keep latest 10
        ]);
        setNotifications(prev => prev + 1);
      } else if (msg.type === "initial_state") {
        msg.data.tables.forEach((session) => {
          applySessionToTables(session);
        });
      }
    });
    wsRef.current = ws;
    return () => { ws.close(); };
  }, [applySessionToTables]);

  const cycleStatus = useCallback((id: string) => {
    setTables(prev => prev.map(t =>
      t.id === id ? { ...t, status: NEXT_STATUS[t.status] } : t
    ));
  }, []);

  const counts = {
    available: tables.filter(t => t.status === "available").length,
    occupied:  tables.filter(t => t.status === "occupied").length,
    reserved:  tables.filter(t => t.status === "reserved").length,
  };
  const totalSeats = tables.reduce((s, t) => s + t.seats, 0);
  const occupiedSeats = tables.filter(t => t.status === "occupied").reduce((s, t) => s + t.seats, 0);
  const visibleTables = activeZone ? tables.filter(t => t.zone === activeZone) : tables;

  const sidebarBg = dark ? "#0e0a08" : "#2c1f14";
  const sidebarInactive = dark ? "#5a4a40" : "#8a7b6e";

  return (
    <div style={{ height: "100%", display: "flex", background: "var(--color-background)" }}>

      {/* Left nav sidebar */}
      <aside style={{
        width: 72,
        flexShrink: 0,
        background: sidebarBg,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        paddingTop: 20,
        paddingBottom: 20,
        gap: 0,
        zIndex: 10,
      }}>
        <div style={{
          width: 38, height: 38, borderRadius: 10,
          background: "#c55a2b",
          display: "flex", alignItems: "center", justifyContent: "center",
          marginBottom: 28, flexShrink: 0,
        }}>
          <span style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700, color: "#fff", lineHeight: 1 }}>C</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4, width: "100%" }}>
          {NAV_ITEMS.map(item => {
            const isActive = activePage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActivePage(item.id)}
                title={item.label}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 4,
                  padding: "10px 0",
                  background: isActive ? "rgba(197,90,43,0.18)" : "transparent",
                  border: "none",
                  borderLeft: isActive ? "3px solid #c55a2b" : "3px solid transparent",
                  cursor: "pointer",
                  width: "100%",
                  transition: "background 0.12s",
                }}
              >
                {item.icon(isActive, dark)}
                <span style={{ fontSize: 9, fontWeight: 600, color: isActive ? "#c55a2b" : sidebarInactive, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>

        <button
          onClick={() => setActivePage("floor")}
          title="Home"
          style={{
            marginTop: "auto",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
            padding: "10px 0",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            width: "100%",
          }}
        >
          <IconHome active={activePage === "floor"} dark={dark} />
          <span style={{ fontSize: 9, fontWeight: 600, color: sidebarInactive, letterSpacing: "0.04em", textTransform: "uppercase" }}>Home</span>
        </button>
      </aside>

      {/* Right content area */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Top bar */}
        <header style={{
          height: 58,
          flexShrink: 0,
          borderBottom: "1px solid var(--color-border)",
          background: "var(--color-card)",
          display: "flex",
          alignItems: "center",
          padding: "0 24px",
          gap: 16,
        }}>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 600, color: "var(--color-foreground)", margin: 0, letterSpacing: "-0.02em" }}>
              {activePage === "floor" ? "Café Floor" : activePage === "camera" ? "Camera" : activePage === "reservations" ? "Reservations" : "Settings"}
            </h1>
            {activePage === "floor" && (
              <p style={{ margin: 0, fontSize: 11, color: "var(--color-muted)", fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>
                {tables.length} tables · {totalSeats} seats · {occupiedSeats} seated
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  fontSize: 10, fontWeight: 600,
                  color: backendConnected ? "#3d8c5a" : "var(--color-muted)",
                }}>
                  <span style={{
                    width: 6, height: 6, borderRadius: "50%",
                    background: backendConnected ? "#3d8c5a" : "#999",
                    display: "inline-block",
                  }} />
                  {backendConnected ? "Live" : "Offline"}
                </span>
              </p>
            )}
          </div>

          {activePage === "floor" && (
            <div style={{ display: "flex", gap: 12 }}>
              {(["available", "occupied", "reserved"] as TableStatus[]).map(s => (
                <div key={s} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: STATUS_CONFIG[s].dot, display: "inline-block" }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: STATUS_CONFIG[s].dot, fontFamily: "var(--font-display)" }}>{counts[s]}</span>
                  <span style={{ fontSize: 10, color: "var(--color-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{STATUS_CONFIG[s].label}</span>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <button
              onClick={() => setActivePage("camera")}
              title="Camera"
              style={{
                width: 38, height: 38, borderRadius: 8,
                background: activePage === "camera" ? (dark ? "#2a1e16" : "#f0ebe2") : "transparent",
                border: activePage === "camera" ? "1px solid var(--color-accent)" : "1px solid transparent",
                cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "background 0.12s",
              }}
            >
              <IconCameraTopBar dark={dark} />
            </button>

            {/* Notification bell — hidden when notifications off */}
            {notifEnabled && (
              <div style={{ position: "relative" }}>
                <button
                  onClick={() => { setNotifOpen(o => !o); setNotifications(0); }}
                  title="Notifications"
                  style={{
                    width: 38, height: 38, borderRadius: 8,
                    background: notifOpen ? (dark ? "#2a1e16" : "#f0ebe2") : "transparent",
                    border: "1px solid transparent",
                    cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "background 0.12s",
                  }}
                >
                  <IconBell dark={dark} />
                  {notifications > 0 && (
                    <span style={{
                      position: "absolute", top: 6, right: 6,
                      width: 16, height: 16, borderRadius: "50%",
                      background: "#c55a2b",
                      fontSize: 9, fontWeight: 700, color: "#fff",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontFamily: "var(--font-sans)",
                      border: "2px solid var(--color-card)",
                    }}>
                      {notifications}
                    </span>
                  )}
                </button>

                {notifOpen && (
                  <div style={{
                    position: "absolute", top: "calc(100% + 8px)", right: 0,
                    width: 280, background: "var(--color-card)",
                    border: "1px solid var(--color-border)", borderRadius: 12,
                    boxShadow: dark ? "0 8px 24px rgba(0,0,0,0.5)" : "0 8px 24px rgba(44,31,20,0.14)",
                    zIndex: 100, overflow: "hidden",
                  }}>
                    <div style={{ padding: "12px 16px 8px", borderBottom: "1px solid var(--color-border)", fontSize: 12, fontWeight: 700, color: "var(--color-muted)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                      Notifications
                    </div>
                    {(aiNotifications.length > 0 ? aiNotifications : [
                      { text: "Table 5 has been occupied for 2+ hrs", time: "2m ago", dot: "#c55a2b" },
                      { text: "Reservation for Table 4 in 15 min", time: "10m ago", dot: "#7a5ea7" },
                      { text: "Patio tables fully available", time: "1h ago", dot: "#3d8c5a" },
                    ]).map((n, i) => (
                      <div key={i} style={{ padding: "10px 16px", display: "flex", gap: 10, alignItems: "flex-start", borderBottom: i < 2 ? "1px solid var(--color-border)" : "none" }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: n.dot, flexShrink: 0, marginTop: 4 }} />
                        <div>
                          <div style={{ fontSize: 12, color: "var(--color-foreground)", fontWeight: 500 }}>{n.text}</div>
                          <div style={{ fontSize: 11, color: "var(--color-muted)", marginTop: 2 }}>{n.time}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div style={{
              width: 34, height: 34, borderRadius: "50%",
              background: dark ? "#4a3428" : "#c8b49a",
              border: "2px solid var(--color-border)",
              display: "flex", alignItems: "center", justifyContent: "center",
              marginLeft: 4,
            }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: dark ? "#d4b89a" : "#5a3e28", fontFamily: "var(--font-sans)" }}>JD</span>
            </div>
          </div>
        </header>

        {/* Page content */}
        {activePage === "settings" ? (
          <SettingsPage dark={dark} setDark={setDark} notifEnabled={notifEnabled} setNotifEnabled={setNotifEnabled} />
        ) : activePage === "camera" ? (
          <CameraPage dark={dark} liveSessions={liveSessions} backendConnected={backendConnected} />
        ) : activePage !== "floor" ? (
          <PlaceholderPage
            title="Reservations"
            icon={<IconMenu active={false} />}
          />
        ) : (
          <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

            {/* Zone sidebar */}
            <nav style={{
              width: 148,
              flexShrink: 0,
              borderRight: "1px solid var(--color-border)",
              background: "var(--color-card)",
              padding: "16px 12px",
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--color-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6, paddingLeft: 4 }}>
                Zones
              </div>
              {[{ id: null, label: "All Zones" }, ...ZONES].map(z => {
                const zid = z.id;
                const isActive = activeZone === zid;
                const zoneTables = zid ? tables.filter(t => t.zone === zid) : tables;
                const avail = zoneTables.filter(t => t.status === "available").length;
                return (
                  <button
                    key={String(zid)}
                    onClick={() => setActiveZone(isActive ? null : zid)}
                    style={{
                      textAlign: "left",
                      background: isActive ? (dark ? "#2a1e16" : "#f0ebe2") : "transparent",
                      border: isActive ? "1px solid var(--color-accent)" : "1px solid transparent",
                      borderRadius: 8,
                      padding: "8px 10px",
                      cursor: "pointer",
                      transition: "background 0.1s",
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 600, color: isActive ? "var(--color-accent)" : "var(--color-foreground)" }}>
                      {z.label}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--color-muted)", marginTop: 1 }}>
                      {avail} of {zoneTables.length} open
                    </div>
                  </button>
                );
              })}

              <div style={{ marginTop: "auto", paddingTop: 16, borderTop: "1px solid var(--color-border)" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "var(--color-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
                  Tap to cycle
                </div>
                {(["available", "occupied", "reserved"] as TableStatus[]).map(s => (
                  <div key={s} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
                    <span style={{ width: 10, height: 10, borderRadius: "50%", background: STATUS_CONFIG[s].dot, flexShrink: 0 }} />
                    <span style={{ fontSize: 11, color: "var(--color-muted)" }}>{STATUS_CONFIG[s].label}</span>
                  </div>
                ))}
              </div>
            </nav>

            {/* Floor canvas */}
            <main style={{ flex: 1, overflow: "auto", padding: 24 }}>
              <div style={{
                position: "relative",
                width: "100%",
                paddingBottom: "78%",
                minWidth: 580,
                background: dark ? "#1a1210" : "#ece4d9",
                borderRadius: 16,
                border: "1px solid var(--color-border)",
                overflow: "hidden",
                boxShadow: dark ? "inset 0 0 0 1px rgba(255,220,180,0.04)" : "inset 0 0 0 1px rgba(44,31,20,0.06)",
              }}>
                <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: dark ? 0.08 : 0.18 }} aria-hidden>
                  <defs>
                    <pattern id="dots" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
                      <circle cx="10" cy="10" r="1.2" fill={dark ? "#c8a888" : "#7a6550"} />
                    </pattern>
                  </defs>
                  <rect width="100%" height="100%" fill="url(#dots)" />
                </svg>

                {ZONE_REGIONS.map(zr => {
                  const isHighlighted = activeZone === null || activeZone === zr.id;
                  return (
                    <div key={zr.id} style={{
                      position: "absolute",
                      left: zr.x, top: zr.y, width: zr.w, height: zr.h,
                      border: `1.5px dashed ${isHighlighted ? (dark ? "#5a4a3a" : "#b0a090") : (dark ? "#3a2e26" : "#cfc7bc")}`,
                      borderRadius: 12,
                      background: isHighlighted
                        ? (dark ? "rgba(40,28,18,0.6)" : "rgba(255,252,247,0.55)")
                        : (dark ? "rgba(20,14,10,0.3)" : "rgba(255,252,247,0.2)"),
                      transition: "background 0.2s",
                    }}>
                      <span style={{
                        position: "absolute", top: 6, left: 10,
                        fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em",
                        color: isHighlighted ? (dark ? "#6a5a4a" : "#8a7b6e") : (dark ? "#3a2e26" : "#b0a090"),
                        fontFamily: "var(--font-sans)", transition: "color 0.2s",
                      }}>
                        {zr.label}
                      </span>
                    </div>
                  );
                })}

                <div style={{ position: "absolute", left: "63%", top: "58%", width: "30%", height: "9%", background: dark ? "#2e2018" : "#c8b49a", borderRadius: 6, border: `2px solid ${dark ? "#4a3428" : "#a89075"}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: dark ? "#8a6a50" : "#5a3e28", letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: "var(--font-sans)" }}>Counter</span>
                </div>

                <div style={{ position: "absolute", left: "82%", top: "12%", width: "11%", height: "42%", background: dark ? "#262018" : "#d0c4b4", borderRadius: 6, border: `2px solid ${dark ? "#3e3428" : "#b0a090"}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: dark ? "#7a6a50" : "#5a3e28", letterSpacing: "0.06em", textTransform: "uppercase", writingMode: "vertical-rl", fontFamily: "var(--font-sans)" }}>Kitchen</span>
                </div>

                <div style={{ position: "absolute", left: "43%", bottom: "1%", width: "14%", height: "4%", background: dark ? "#1a2e14" : "#b5cfa5", borderRadius: "0 0 8px 8px", border: `1.5px solid ${dark ? "#2e5022" : "#8aaf7a"}`, borderTop: "none", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: dark ? "#5a9048" : "#3a6828", textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: "var(--font-sans)" }}>Entrance</span>
                </div>

                {visibleTables.map(table => (
                  <TableItem key={table.id} table={table} onClick={() => cycleStatus(table.id)} dark={dark} />
                ))}
              </div>
            </main>
          </div>
        )}
      </div>
    </div>
  );
}
