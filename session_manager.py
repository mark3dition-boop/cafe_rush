import time
from dataclasses import dataclass
from typing import Optional


@dataclass
class Session:

    session_id: int
    track_id: int

    state: str
    status: str

    sitting_since: Optional[float]
    standing_since: Optional[float]

    last_seen: float
    lost_since: Optional[float]

    bbox: Optional[tuple]

    def sitting_duration(self, now=None):

        if self.sitting_since is None:
            return 0.0

        if now is None:
            now = time.time()

        return max(
            0.0,
            now - self.sitting_since
        )


class SessionManager:

    def __init__(
        self,
        standing_confirmation_time=2.0,
        tracking_grace_period=3.0
    ):

        self.sessions = {}

        self.next_session_id = 1

        self.standing_confirmation_time = (
            standing_confirmation_time
        )

        self.tracking_grace_period = (
            tracking_grace_period
        )

    def _create_session(
        self,
        track_id,
        state,
        now
    ):

        session = Session(

            session_id=self.next_session_id,

            track_id=track_id,

            state=state,

            status="ACTIVE",

            sitting_since=(
                now
                if state == "SITTING"
                else None
            ),

            standing_since=None,

            last_seen=now,

            lost_since=None,

            bbox=None
        )

        self.sessions[
            session.session_id
        ] = session

        self.next_session_id += 1

        return session

    def _find_by_track_id(self, track_id):

        for session in self.sessions.values():

            if (
                session.track_id == track_id
                and
                session.status == "ACTIVE"
            ):
                return session

        return None

    def update(
        self,
        track_id,
        state,
        bbox=None,
        now=None
    ):

        if now is None:
            now = time.time()

        session = self._find_by_track_id(
            track_id
        )

        if session is None:

            session = self._create_session(
                track_id,
                state,
                now
            )

        session.last_seen = now
        session.lost_since = None
        session.bbox = bbox

        self._update_state(
            session,
            state,
            now
        )

        return session

    def _update_state(
        self,
        session,
        detected_state,
        now
    ):

        # ============================================
        # SITTING
        # ============================================

        if detected_state == "SITTING":

            session.standing_since = None

            if session.state == "SITTING":
                return

            session.state = "SITTING"

            session.sitting_since = now

            return

        # ============================================
        # STANDING
        # ============================================

        if detected_state == "STANDING":

            if session.standing_since is None:

                session.standing_since = now

                return

            standing_duration = (
                now - session.standing_since
            )

            # Standing hanya sesaat.
            # Jangan reset sitting timer.

            if (
                standing_duration
                <
                self.standing_confirmation_time
            ):
                return

            # Standing benar-benar terkonfirmasi.

            session.state = "STANDING"

            session.sitting_since = None

            return

        # ============================================
        # UNKNOWN
        # ============================================

        if detected_state == "UNKNOWN":

            # Pertahankan state sebelumnya.

            return

    def handle_missing_tracks(
        self,
        visible_track_ids,
        now=None
    ):

        if now is None:
            now = time.time()

        for session in self.sessions.values():

            if session.status != "ACTIVE":
                continue

            if session.track_id in visible_track_ids:

                session.lost_since = None

                continue

            if session.lost_since is None:

                session.lost_since = now

                continue

            lost_duration = (
                now - session.lost_since
            )

            if (
                lost_duration
                >=
                self.tracking_grace_period
            ):

                session.status = "GONE"

    def get_active_sessions(self):

        now = time.time()

        result = []

        for session in self.sessions.values():

            if session.status != "ACTIVE":
                continue

            result.append({

                "session_id":
                    session.session_id,

                "track_id":
                    session.track_id,

                "state":
                    session.state,

                "status":
                    session.status,

                "sitting_duration":
                    session.sitting_duration(now),

                "last_seen":
                    session.last_seen

            })

        return result