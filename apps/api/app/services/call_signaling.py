import asyncio
import re
from dataclasses import dataclass, field, replace
from datetime import datetime, timezone
from time import monotonic
from uuid import UUID


CALL_SIGNAL_EVENTS = {
    'call.invite',
    'call.accept',
    'call.reject',
    'call.cancel',
    'call.end',
    'call.connected',
    'call.offer',
    'call.answer',
    'call.ice_candidate',
}
CALL_ID_PATTERN = re.compile(r'^[A-Za-z0-9-]{1,200}$')
CALL_TYPES = {'audio', 'video'}
INVITE_TIMEOUT_SECONDS = 75
MAX_CALL_DURATION_SECONDS = 12 * 60 * 60


class CallSignalingError(ValueError):
    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


@dataclass
class CallSession:
    call_id: str
    call_type: str
    chat_id: UUID
    caller_user_id: UUID
    callee_user_id: UUID
    status: str
    expires_at: float
    pending_answer_user_id: UUID | None
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    connected_at: datetime | None = None


@dataclass(frozen=True)
class CallSignalRelayResult:
    recipient_user_id: UUID
    terminal_session: CallSession | None = None
    terminal_outcome: str | None = None
    history_outcome: str | None = None
    connected_session: CallSession | None = None


def normalize_call_signal(message: dict) -> dict:
    event = message.get('event')
    if event not in CALL_SIGNAL_EVENTS:
        raise CallSignalingError('unsupported_call_event')

    call_id = message.get('call_id')
    if not isinstance(call_id, str) or not CALL_ID_PATTERN.fullmatch(call_id):
        raise CallSignalingError('invalid_call_id')

    payload = {'event': event, 'call_id': call_id}
    if event == 'call.invite':
        call_type = message.get('call_type', 'audio')
        if call_type not in CALL_TYPES:
            raise CallSignalingError('invalid_call_type')
        payload['call_type'] = call_type

    if event in {'call.offer', 'call.answer'}:
        description = message.get('description')
        expected_type = event.removeprefix('call.')
        if (
            not isinstance(description, dict)
            or description.get('type') != expected_type
            or not isinstance(description.get('sdp'), str)
            or not 1 <= len(description['sdp']) <= 32_768
        ):
            raise CallSignalingError('invalid_session_description')
        payload['description'] = {'type': expected_type, 'sdp': description['sdp']}

    if event == 'call.ice_candidate':
        candidate = message.get('candidate')
        if (
            not isinstance(candidate, dict)
            or not isinstance(candidate.get('candidate'), str)
            or not 1 <= len(candidate['candidate']) <= 8_192
        ):
            raise CallSignalingError('invalid_ice_candidate')

        normalized_candidate = {'candidate': candidate['candidate']}
        sdp_mid = candidate.get('sdpMid')
        if sdp_mid is not None:
            if not isinstance(sdp_mid, str) or len(sdp_mid) > 128:
                raise CallSignalingError('invalid_ice_candidate')
            normalized_candidate['sdpMid'] = sdp_mid
        sdp_mline_index = candidate.get('sdpMLineIndex')
        if sdp_mline_index is not None:
            if not isinstance(sdp_mline_index, int) or not 0 <= sdp_mline_index <= 100:
                raise CallSignalingError('invalid_ice_candidate')
            normalized_candidate['sdpMLineIndex'] = sdp_mline_index
        username_fragment = candidate.get('usernameFragment')
        if username_fragment is not None:
            if not isinstance(username_fragment, str) or len(username_fragment) > 256:
                raise CallSignalingError('invalid_ice_candidate')
            normalized_candidate['usernameFragment'] = username_fragment
        payload['candidate'] = normalized_candidate

    if event == 'call.reject':
        reason = message.get('reason')
        if reason in {'busy', 'media_failed', 'unsupported_media'}:
            payload['reason'] = reason

    return payload


class CallSignalingManager:
    def __init__(self) -> None:
        self._calls: dict[str, CallSession] = {}
        self._expired_calls: list[CallSession] = []
        self._user_call_ids: dict[UUID, str] = {}
        self._lock = asyncio.Lock()

    async def start_call(
        self,
        call_id: str,
        chat_id: UUID,
        caller_user_id: UUID,
        callee_user_id: UUID,
        call_type: str = 'audio',
    ) -> CallSession:
        async with self._lock:
            self._collect_expired_calls_locked()
            if call_id in self._calls:
                raise CallSignalingError('call_id_in_use')
            if caller_user_id in self._user_call_ids:
                raise CallSignalingError('caller_busy')
            if callee_user_id in self._user_call_ids:
                raise CallSignalingError('peer_busy')

            session = CallSession(
                call_id=call_id,
                call_type=call_type,
                chat_id=chat_id,
                caller_user_id=caller_user_id,
                callee_user_id=callee_user_id,
                status='ringing',
                expires_at=monotonic() + INVITE_TIMEOUT_SECONDS,
                pending_answer_user_id=None,
            )
            self._calls[call_id] = session
            self._user_call_ids[caller_user_id] = call_id
            self._user_call_ids[callee_user_id] = call_id
            return session

    async def get_pending_incoming_call(self, user_id: UUID) -> CallSession | None:
        async with self._lock:
            self._collect_expired_calls_locked()
            call_id = self._user_call_ids.get(user_id)
            session = self._calls.get(call_id) if call_id else None
            if (
                not session
                or session.callee_user_id != user_id
                or session.status != 'ringing'
            ):
                return None
            return session

    async def relay_call_signal(
        self,
        call_id: str,
        chat_id: UUID,
        sender_user_id: UUID,
        event: str,
        reason: str | None = None,
    ) -> CallSignalRelayResult:
        async with self._lock:
            self._collect_expired_calls_locked()
            session = self._calls.get(call_id)
            if not session or session.chat_id != chat_id:
                raise CallSignalingError('call_not_found')
            if sender_user_id not in {session.caller_user_id, session.callee_user_id}:
                raise CallSignalingError('call_not_available')

            recipient_user_id = session.callee_user_id if sender_user_id == session.caller_user_id else session.caller_user_id
            terminal_session = None
            terminal_outcome = None
            history_outcome = None
            connected_session = None
            if event == 'call.accept':
                self._require_state(session, sender_user_id == session.callee_user_id and session.status == 'ringing')
                session.status = 'accepted'
                session.expires_at = monotonic() + MAX_CALL_DURATION_SECONDS
            elif event == 'call.reject':
                self._require_state(session, sender_user_id == session.callee_user_id and session.status == 'ringing')
                terminal_session = replace(session)
                terminal_outcome = _rejection_outcome(reason)
                history_outcome = 'rejected'
                self._remove_call_locked(call_id)
            elif event == 'call.cancel':
                self._require_state(session, sender_user_id == session.caller_user_id)
                terminal_session = replace(session)
                terminal_outcome = call_terminal_outcome(terminal_session)
                if terminal_outcome == 'cancelled':
                    history_outcome = 'cancelled'
                self._remove_call_locked(call_id)
            elif event == 'call.end':
                terminal_session = replace(session)
                terminal_outcome = call_terminal_outcome(terminal_session)
                self._remove_call_locked(call_id)
            elif event == 'call.connected':
                self._require_state(session, session.status in {'accepted', 'active'})
                if session.connected_at is None:
                    session.connected_at = datetime.now(timezone.utc)
                connected_session = replace(session)
            elif event == 'call.offer':
                self._require_state(
                    session,
                    session.status in {'accepted', 'active'}
                    and session.pending_answer_user_id is None,
                )
                session.status = 'active'
                session.pending_answer_user_id = recipient_user_id
            elif event == 'call.answer':
                self._require_state(
                    session,
                    session.status == 'active'
                    and sender_user_id == session.pending_answer_user_id,
                )
                session.pending_answer_user_id = None
            elif event == 'call.ice_candidate':
                self._require_state(session, session.status in {'accepted', 'active'})
            else:
                raise CallSignalingError('unsupported_call_event')

            return CallSignalRelayResult(
                recipient_user_id=recipient_user_id,
                terminal_session=terminal_session,
                terminal_outcome=terminal_outcome,
                history_outcome=history_outcome,
                connected_session=connected_session,
            )

    async def end_calls_for_user(self, user_id: UUID) -> list[tuple[UUID, CallSession]]:
        async with self._lock:
            self._collect_expired_calls_locked()
            call_id = self._user_call_ids.get(user_id)
            if not call_id or not (session := self._calls.get(call_id)):
                return []
            recipient_user_id = session.callee_user_id if user_id == session.caller_user_id else session.caller_user_id
            self._remove_call_locked(call_id)
            return [(recipient_user_id, session)]

    async def end_call_between_users(self, first_user_id: UUID, second_user_id: UUID) -> CallSession | None:
        async with self._lock:
            self._collect_expired_calls_locked()
            call_id = self._user_call_ids.get(first_user_id)
            session = self._calls.get(call_id) if call_id else None
            if not session or {session.caller_user_id, session.callee_user_id} != {first_user_id, second_user_id}:
                return None
            self._remove_call_locked(call_id)
            return session

    async def expire_calls(self) -> list[CallSession]:
        async with self._lock:
            self._collect_expired_calls_locked()
            expired_calls = self._expired_calls
            self._expired_calls = []
            return expired_calls

    def _collect_expired_calls_locked(self) -> None:
        now = monotonic()
        for call_id, session in list(self._calls.items()):
            if session.expires_at <= now:
                self._expired_calls.append(replace(session))
                self._remove_call_locked(call_id)

    def _remove_call_locked(self, call_id: str) -> None:
        session = self._calls.pop(call_id, None)
        if not session:
            return
        self._user_call_ids.pop(session.caller_user_id, None)
        self._user_call_ids.pop(session.callee_user_id, None)

    @staticmethod
    def _require_state(session: CallSession, is_allowed: bool) -> None:
        if not is_allowed:
            raise CallSignalingError('invalid_call_state')


def _rejection_outcome(reason: str | None) -> str:
    if reason == 'busy':
        return 'busy'
    if reason in {'media_failed', 'unsupported_media'}:
        return 'failed'
    return 'rejected'


def call_terminal_outcome(call: CallSession) -> str:
    if call.connected_at:
        return 'completed'
    if call.status == 'ringing':
        return 'cancelled'
    return 'failed'


call_signaling_manager = CallSignalingManager()
