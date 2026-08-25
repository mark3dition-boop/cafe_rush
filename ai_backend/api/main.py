import sys
import json
import asyncio
from pathlib import Path
sys.path.append(str(Path(__file__).parent.parent))

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, Request, Response
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
from agent.workflow import agent_workflow

app = FastAPI(
    title="Cafe AI Workflow API",
    description="API untuk menganalisis status meja dan memberikan rekomendasi staff menggunakan LangGraph Agent",
    version="1.0.0"
)

# ============================================================
# CORS — Allow React frontend (port 8443) to call this API
# ============================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8443",
        "http://127.0.0.1:8443",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================
# In-memory store for table/session status & video streaming
# ============================================================

# Keyed by table_id, stores the latest session data pushed by CV pipeline
table_store: dict[str, dict] = {}

# Stores AI recommendations keyed by table_id
ai_recommendations: dict[str, dict] = {}

# Latest JPEG frame bytes pushed from CV pipeline
latest_frame: Optional[bytes] = None

# Camera configuration & telemetry
camera_state: dict = {
    "status": "online",
    "source": "test2.mov",
    "show_overlay": True,
    "paused": False,
    "active_camera_id": "cam1",
    "fps": 24,
    "resolution": "1280x720"
}

# ============================================================
# WebSocket connection manager
# ============================================================

ws_connections: list[WebSocket] = []


async def broadcast(message: dict):
    """Broadcast a JSON message to all connected WebSocket clients."""
    text = json.dumps(message)
    for ws in ws_connections[:]:  # iterate a copy to allow removal
        try:
            await ws.send_text(text)
        except Exception:
            try:
                ws_connections.remove(ws)
            except ValueError:
                pass


# ============================================================
# Request / Response Schemas
# ============================================================

# Skema untuk data dari CV/YOLO pipeline
class SessionUpdate(BaseModel):
    session_id: int
    track_id: int
    table_id: str
    state: str              # "SITTING" | "STANDING" | "UNKNOWN"
    status: str             # "ACTIVE" | "GONE"
    sitting_duration: float
    person_count: int

# Skema Request Body untuk analisis AI (dari CV pipeline)
class TableAnalysisRequest(BaseModel):
    table_id: str
    person_count: int
    duration_minutes: int

# Skema Response Body
class TableAnalysisResponse(BaseModel):
    table_id: str
    recommendation: str

class CameraControlRequest(BaseModel):
    source: Optional[str] = None
    show_overlay: Optional[bool] = None
    paused: Optional[bool] = None
    active_camera_id: Optional[str] = None


# ============================================================
# Endpoints
# ============================================================

@app.get("/")
def read_root():
    return {"message": "Cafe AI Workflow API is running. Go to /docs for Swagger UI."}


@app.post("/api/upload-frame")
async def upload_frame(request: Request):
    """
    Receives live raw JPEG frame bytes from the YOLO pipeline (main.py).
    """
    global latest_frame
    latest_frame = await request.body()
    return {"status": "ok"}


@app.get("/api/video-feed")
async def video_feed():
    """
    Returns an MJPEG stream of the latest annotated YOLO frame for frontend video element.
    """
    async def frame_generator():
        while True:
            if latest_frame is not None:
                yield (
                    b'--frame\r\n'
                    b'Content-Type: image/jpeg\r\n\r\n' + latest_frame + b'\r\n'
                )
            await asyncio.sleep(0.04)  # ~25 FPS

    return StreamingResponse(
        frame_generator(),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )


@app.get("/api/camera/status")
def get_camera_status():
    """
    Returns the current camera configuration, status, and telemetry.
    """
    return {
        "camera_state": camera_state,
        "has_frame": latest_frame is not None,
        "active_sessions_count": len(table_store)
    }


@app.post("/api/camera/control")
async def control_camera(config: CameraControlRequest):
    """
    Updates camera configuration (source, overlays, pause state, camera selection).
    Broadcasting change to all connected frontends via WebSocket.
    """
    if config.source is not None:
        camera_state["source"] = config.source
    if config.show_overlay is not None:
        camera_state["show_overlay"] = config.show_overlay
    if config.paused is not None:
        camera_state["paused"] = config.paused
    if config.active_camera_id is not None:
        camera_state["active_camera_id"] = config.active_camera_id

    await broadcast({"type": "camera_update", "data": camera_state})
    return {"status": "ok", "camera_state": camera_state}


@app.post("/api/update-session")
async def update_session(update: SessionUpdate):
    """
    CV pipeline pushes real-time session data here.
    Data is stored in memory and broadcast to all connected frontends via WebSocket.
    """
    payload = update.model_dump() if hasattr(update, 'model_dump') else update.dict()
    if update.status == "GONE":
        table_store.pop(update.table_id, None)
    else:
        table_store[update.table_id] = payload

    # Broadcast to all connected frontends
    await broadcast({"type": "session_update", "data": payload})

    return {"status": "ok"}


@app.get("/api/tables")
def get_tables():
    """
    Returns the current status of all tables.
    The frontend polls this endpoint as a fallback to WebSocket.
    """
    return {
        "tables": list(table_store.values()),
        "recommendations": ai_recommendations,
    }


@app.post("/api/analyze-table", response_model=TableAnalysisResponse)
async def analyze_table(request: TableAnalysisRequest):
    """
    Endpoint ini akan menjalankan Custom StateGraph untuk meja yang diminta.
    Eksekusi dilakukan terstruktur dari mengambil waktu, sensor, hingga membaca RAG.
    """
    try:
        # Masukkan data dari YOLO langsung ke dalam State AI
        inputs = {
            "table_id": request.table_id,
            "person_count": request.person_count,
            "duration_minutes": request.duration_minutes
        }
        
        # Eksekusi StateGraph secara sinkron
        response_data = agent_workflow.invoke(inputs)
        
        # Ambil data final_output dari kamus (State) yang dikembalikan
        final_message = response_data["final_output"]

        # Store the recommendation
        ai_recommendations[request.table_id] = {
            "table_id": request.table_id,
            "recommendation": final_message,
        }

        # Broadcast AI recommendation to connected frontends
        await broadcast({
            "type": "ai_recommendation",
            "data": {
                "table_id": request.table_id,
                "recommendation": final_message,
            }
        })
        
        return TableAnalysisResponse(
            table_id=request.table_id,
            recommendation=final_message
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================
# WebSocket endpoint
# ============================================================

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """
    Real-time WebSocket connection for the frontend.
    Sends session_update and ai_recommendation events as they arrive.
    On connect, sends the current state of all tables.
    """
    await websocket.accept()
    ws_connections.append(websocket)

    # Send current state on connect
    try:
        await websocket.send_text(json.dumps({
            "type": "initial_state",
            "data": {
                "tables": list(table_store.values()),
                "recommendations": ai_recommendations,
                "camera_state": camera_state,
            }
        }))
    except Exception:
        ws_connections.remove(websocket)
        return

    try:
        while True:
            # Keep connection alive by reading messages (ping/pong handled by FastAPI)
            await websocket.receive_text()
    except WebSocketDisconnect:
        try:
            ws_connections.remove(websocket)
        except ValueError:
            pass


# ============================================================
# Main
# ============================================================

if __name__ == "__main__":
    import uvicorn
    # Jalankan server FastAPI jika file ini dieksekusi langsung
    uvicorn.run(app, host="0.0.0.0", port=8000)
