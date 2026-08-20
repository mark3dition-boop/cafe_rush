from ultralytics import YOLO
import cv2
import math
import requests
import threading
from session_manager import SessionManager

# Variabel pembantu agar tidak spam request API tiap detik
last_sent_time = {}

def notify_ai(table_id, duration_seconds):
    """Fungsi untuk menembak API AI di background agar video tidak patah-patah"""
    try:
        data = {
            "table_id": str(table_id),
            "person_count": 1, # Default 1 untuk tiap deteksi track
            "duration_minutes": int(duration_seconds / 60)
        }
        res = requests.post("http://localhost:8000/api/analyze-table", json=data)
        print(f"\n[🤖 AI RESPONS MEJA {table_id}]: {res.json()['recommendation']}\n")
    except Exception as e:
        pass
# Configuration
# ============================================================

VIDEO_PATH = "test2.mov"
DEVICE = "mps"
MAX_SECONDS = 30

MODEL_PATH = "yolo26s-pose.pt"

# ============================================================
# Model
# ============================================================

model = YOLO(MODEL_PATH)

# ============================================================
# Session Manager
# ============================================================

session_manager = SessionManager(
    standing_confirmation_time=2.0,
    tracking_grace_period=3.0
)


# ============================================================
# Helper
# ============================================================

def calculate_angle(a, b, c):
    """
    Calculate angle ABC in degrees.
    """

    angle = math.degrees(
        math.atan2(
            c[1] - b[1],
            c[0] - b[0]
        )
        -
        math.atan2(
            a[1] - b[1],
            a[0] - b[0]
        )
    )

    angle = abs(angle)

    if angle > 180:
        angle = 360 - angle

    return angle


def classify_sitting(
    keypoints,
    confidence,
    bbox
):
    """
    Classify a person as:

        SITTING
        STANDING
        UNKNOWN

    based on pose keypoints.
    """

    required = [
        5, 6,
        11, 12,
        13, 14
    ]

    for idx in required:

        if confidence[idx] < 0.4:
            return "UNKNOWN"

    # --------------------------------------------------------
    # Keypoints
    # --------------------------------------------------------

    left_hip = keypoints[11]
    right_hip = keypoints[12]

    left_knee = keypoints[13]
    right_knee = keypoints[14]

    left_ankle = keypoints[15]
    right_ankle = keypoints[16]

    # --------------------------------------------------------
    # Knee angles
    # --------------------------------------------------------

    knee_angles = []

    if confidence[15] >= 0.4:

        angle = calculate_angle(
            left_hip,
            left_knee,
            left_ankle
        )

        knee_angles.append(angle)

    if confidence[16] >= 0.4:

        angle = calculate_angle(
            right_hip,
            right_knee,
            right_ankle
        )

        knee_angles.append(angle)

    if not knee_angles:
        return "UNKNOWN"

    avg_knee_angle = (
        sum(knee_angles)
        /
        len(knee_angles)
    )

    # --------------------------------------------------------
    # Hip / knee relationship
    # --------------------------------------------------------

    hip_y = (
        left_hip[1]
        +
        right_hip[1]
    ) / 2

    knee_y = (
        left_knee[1]
        +
        right_knee[1]
    ) / 2

    x1, y1, x2, y2 = bbox

    person_height = max(
        y2 - y1,
        1
    )

    hip_knee_distance = (
        abs(knee_y - hip_y)
        /
        person_height
    )

    # --------------------------------------------------------
    # Sitting heuristic
    # --------------------------------------------------------

    if (
        avg_knee_angle < 150
        and
        hip_knee_distance < 0.35
    ):

        return "SITTING"

    return "STANDING"


# ============================================================
# Video
# ============================================================

cap = cv2.VideoCapture(
    VIDEO_PATH
)

if not cap.isOpened():

    raise RuntimeError(
        f"Cannot open video: {VIDEO_PATH}"
    )


fps = cap.get(
    cv2.CAP_PROP_FPS
)

if fps <= 0:
    fps = 30


max_frames = int(
    fps * MAX_SECONDS
)

frame_count = 0


# ============================================================
# Main Loop
# ============================================================

while (
    cap.isOpened()
    and
    frame_count < max_frames
):

    success, frame = cap.read()

    if not success:
        break

    # ========================================================
    # YOLO Tracking
    # ========================================================

    results = model.track(

        frame,

        device=DEVICE,

        classes=[0],

        tracker="botsort.yaml",

        persist=True,

        verbose=False
    )

    result = results[0]

    # ========================================================
    # Base visualization
    # ========================================================

    annotated_frame = result.plot(

        labels=False,

        boxes=False
    )

    # ========================================================
    # Track IDs visible in this frame
    # ========================================================

    visible_track_ids = set()

    # ========================================================
    # Process persons
    # ========================================================

    if (
        result.keypoints is not None
        and
        result.boxes is not None
    ):

        # ----------------------------------------------------
        # Keypoints
        # ----------------------------------------------------

        keypoints_xy = (
            result.keypoints
            .xy
            .cpu()
            .numpy()
        )

        if result.keypoints.conf is not None:

            keypoints_conf = (
                result.keypoints
                .conf
                .cpu()
                .numpy()
            )

        else:

            keypoints_conf = None

        boxes = result.boxes

        # ----------------------------------------------------
        # Make sure pose confidence exists
        # ----------------------------------------------------

        if keypoints_conf is not None:

            box_data = (
                boxes.xyxy
                .cpu()
                .numpy()
            )

            # ------------------------------------------------
            # Track IDs
            # ------------------------------------------------

            if boxes.id is not None:

                track_ids = (
                    boxes.id
                    .cpu()
                    .numpy()
                    .astype(int)
                )

            else:

                track_ids = []

            # =================================================
            # Each person
            # =================================================

            for i, bbox in enumerate(
                box_data
            ):

                # ---------------------------------------------
                # Safety check
                # ---------------------------------------------

                if i >= len(track_ids):
                    continue

                if i >= len(keypoints_xy):
                    continue

                if i >= len(keypoints_conf):
                    continue

                # ---------------------------------------------
                # Track ID
                # ---------------------------------------------

                track_id = int(
                    track_ids[i]
                )

                # ---------------------------------------------
                # Sitting classification
                # ---------------------------------------------

                state = classify_sitting(

                    keypoints_xy[i],

                    keypoints_conf[i],

                    bbox
                )

                # =================================================
                # SESSION MANAGER
                # =================================================

                session = session_manager.update(

                    track_id=track_id,

                    state=state,

                    bbox=tuple(bbox)
                )

                visible_track_ids.add(
                    track_id
                )

                # ---------------------------------------------
                # Use confirmed state from SessionManager
                # ---------------------------------------------

                confirmed_state = (
                    session.state
                )

                # ---------------------------------------------
                # Bounding box
                # ---------------------------------------------

                x1, y1, x2, y2 = map(
                    int,
                    bbox
                )

                # =================================================
                # Color
                # =================================================

                if confirmed_state == "SITTING":

                    box_color = (
                        0,
                        255,
                        0
                    )

                elif confirmed_state == "STANDING":

                    box_color = (
                        0,
                        200,
                        255
                    )

                else:

                    box_color = (
                        160,
                        160,
                        160
                    )

                # =================================================
                # Bounding box
                # =================================================

                cv2.rectangle(

                    annotated_frame,

                    (x1, y1),

                    (x2, y2),

                    box_color,

                    2
                )

                # =================================================
                # Session duration
                # =================================================

                sitting_duration = (
                    session.sitting_duration()
                )

                minutes = int(
                    sitting_duration // 60
                )

                seconds = int(
                    sitting_duration % 60
                )

                timer_text = (
                    f"{minutes:02d}:{seconds:02d}"
                )

                # =================================================
                # Labels
                # =================================================

                id_label = (
                    f"ID {track_id}"
                )

                state_label = (
                    confirmed_state
                )

                timer_label = (
                    f"Sitting: {timer_text}"
                )

                font = (
                    cv2.FONT_HERSHEY_SIMPLEX
                )

                font_scale = 0.55
                thickness = 2

                # =================================================
                # Header 1 - ID
                # =================================================

                (
                    id_width,
                    id_height
                ), id_baseline = cv2.getTextSize(

                    id_label,

                    font,

                    font_scale,

                    thickness
                )

                id_x = x1
                id_y = y1

                id_box_height = (
                    id_height
                    +
                    10
                )

                cv2.rectangle(

                    annotated_frame,

                    (
                        id_x,
                        id_y
                    ),

                    (
                        id_x + id_width + 10,
                        id_y + id_box_height
                    ),

                    box_color,

                    -1
                )

                cv2.putText(

                    annotated_frame,

                    id_label,

                    (
                        id_x + 5,
                        id_y + id_height + 2
                    ),

                    font,

                    font_scale,

                    (0, 0, 0),

                    thickness,

                    cv2.LINE_AA
                )

                # =================================================
                # Header 2 - State
                # =================================================

                state_text = (
                    f"{state_label}"
                )

                (
                    state_width,
                    state_height
                ), state_baseline = cv2.getTextSize(

                    state_text,

                    font,

                    font_scale,

                    thickness
                )

                state_x = x1

                state_y = (
                    id_y
                    +
                    id_box_height
                )

                state_box_height = (
                    state_height
                    +
                    10
                )

                cv2.rectangle(

                    annotated_frame,

                    (
                        state_x,
                        state_y
                    ),

                    (
                        state_x + state_width + 10,
                        state_y + state_box_height
                    ),

                    box_color,

                    -1
                )

                cv2.putText(

                    annotated_frame,

                    state_text,

                    (
                        state_x + 5,
                        state_y + state_height + 2
                    ),

                    font,

                    font_scale,

                    (0, 0, 0),

                    thickness,

                    cv2.LINE_AA
                )

                # =================================================
                # Header 3 - Timer
                # =================================================

                (
                    timer_width,
                    timer_height
                ), timer_baseline = cv2.getTextSize(

                    timer_label,

                    font,

                    0.5,

                    1
                )

                timer_x = x1

                timer_y = (
                    state_y
                    +
                    state_box_height
                )

                timer_box_height = (
                    timer_height
                    +
                    8
                )

                cv2.rectangle(

                    annotated_frame,

                    (
                        timer_x,
                        timer_y
                    ),

                    (
                        timer_x + timer_width + 10,
                        timer_y + timer_box_height
                    ),

                    (40, 40, 40),

                    -1
                )

                cv2.putText(

                    annotated_frame,

                    timer_label,

                    (
                        timer_x + 5,
                        timer_y + timer_height + 1
                    ),

                    font,

                    0.5,

                    (255, 255, 255),

                    1,

                    cv2.LINE_AA
                )

    # ========================================================
    # Handle missing tracking
    # ========================================================

    session_manager.handle_missing_tracks(

        visible_track_ids
    )

    # ========================================================
    # Get active sessions
    # ========================================================

    active_sessions = (
        session_manager
        .get_active_sessions()
    )

    # ========================================================
    # Debug output
    # ========================================================

    print(
        "\033[H\033[J",
        end=""
    )

    print(
        "CRX01 ACTIVE SESSIONS"
    )

    print(
        "====================="
    )

    for session in active_sessions:

        print(

            f"Session {session['session_id']} | "

            f"Track {session['track_id']} | "

            f"{session['state']} | "

            f"{session['status']} | "

            f"Sitting "
            f"{session['sitting_duration']:.1f}s"
        )
        
        # --- INTEGRASI KE AI BACKEND ---
        duration_sec = session['sitting_duration']
        # Kirim laporan ke AI tiap kelipatan 60 detik (1 menit) atau sesuaikan kebutuhan demo
        if int(duration_sec) > 0 and int(duration_sec) % 60 == 0:
            if session['session_id'] not in last_sent_time or last_sent_time[session['session_id']] != int(duration_sec):
                last_sent_time[session['session_id']] = int(duration_sec)
                threading.Thread(target=notify_ai, args=(session['track_id'], duration_sec)).start()
        # -------------------------------

    # ========================================================
    # Display
    # ========================================================

    cv2.imshow(

        "CRX01 - Sitting Detection",

        annotated_frame
    )

    frame_count += 1

    # ========================================================
    # Quit
    # ========================================================

    if cv2.waitKey(1) & 0xFF == ord("q"):

        break


# ============================================================
# Cleanup
# ============================================================

cap.release()

cv2.destroyAllWindows()