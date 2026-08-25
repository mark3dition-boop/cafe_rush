// ============================================================
// API service for connecting to the Cafe Rush backend
// ============================================================

const API_BASE = "http://localhost:8000";
const WS_BASE = "ws://localhost:8000";

// ============================================================
// Types
// ============================================================

export interface SessionData {
  session_id: number;
  track_id: number;
  table_id: string;
  state: string;       // "SITTING" | "STANDING" | "UNKNOWN"
  status: string;      // "ACTIVE" | "GONE"
  sitting_duration: number;
  person_count: number;
}

export interface AIRecommendation {
  table_id: string;
  recommendation: string;
}

export interface CameraState {
  status: string;
  source: string;
  show_overlay: boolean;
  paused: boolean;
  active_camera_id: string;
  fps: number;
  resolution: string;
}

export interface CameraStatusResponse {
  camera_state: CameraState;
  has_frame: boolean;
  active_sessions_count: number;
}

export interface TablesResponse {
  tables: SessionData[];
  recommendations: Record<string, AIRecommendation>;
  camera_state?: CameraState;
}

export interface AnalysisResponse {
  table_id: string;
  recommendation: string;
}

export type WSMessage =
  | { type: "session_update"; data: SessionData }
  | { type: "ai_recommendation"; data: AIRecommendation }
  | { type: "camera_update"; data: CameraState }
  | { type: "initial_state"; data: TablesResponse };

// ============================================================
// REST API calls
// ============================================================

/** Fetch all table statuses (polling fallback) */
export async function fetchTables(): Promise<TablesResponse> {
  const res = await fetch(`${API_BASE}/api/tables`);
  if (!res.ok) throw new Error("Failed to fetch tables");
  return res.json();
}

/** Fetch camera telemetry and configuration */
export async function fetchCameraStatus(): Promise<CameraStatusResponse> {
  const res = await fetch(`${API_BASE}/api/camera/status`);
  if (!res.ok) throw new Error("Failed to fetch camera status");
  return res.json();
}

/** Update camera settings (source, overlay, pause state, active camera) */
export async function updateCameraControl(
  config: Partial<CameraState>
): Promise<CameraState> {
  const res = await fetch(`${API_BASE}/api/camera/control`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  if (!res.ok) throw new Error("Failed to update camera control");
  const data = await res.json();
  return data.camera_state;
}

/** Returns the URL for live video streaming */
export function getVideoFeedUrl(): string {
  return `${API_BASE}/api/video-feed`;
}

/** Analyze a table via the AI agent */
export async function analyzeTable(
  tableId: string,
  personCount: number,
  durationMinutes: number
): Promise<AnalysisResponse> {
  const res = await fetch(`${API_BASE}/api/analyze-table`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      table_id: tableId,
      person_count: personCount,
      duration_minutes: durationMinutes,
    }),
  });
  if (!res.ok) throw new Error("Analysis failed");
  return res.json();
}

// ============================================================
// WebSocket for real-time updates
// ============================================================

/** Connect to the WebSocket and call onMessage for each event. Auto-reconnects. */
export function connectWebSocket(
  onMessage: (data: WSMessage) => void
): WebSocket {
  const ws = new WebSocket(`${WS_BASE}/ws`);

  ws.onmessage = (event) => {
    try {
      const parsed: WSMessage = JSON.parse(event.data);
      onMessage(parsed);
    } catch {
      // Ignore malformed messages
    }
  };

  ws.onerror = () => {
    // Will trigger onclose → auto-reconnect
  };

  ws.onclose = () => {
    // Auto-reconnect after 3 seconds
    setTimeout(() => connectWebSocket(onMessage), 3000);
  };

  return ws;
}
