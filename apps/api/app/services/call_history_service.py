from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import and_, exists, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.calls import CallRecord
from app.models.safety import UserBlock
from app.models.users import User, UserProfile
from app.schemas.calls import CallHistoryItemOut, CallHistoryPeerOut
from app.services.admin_service import is_configured_admin_profile
from app.services.call_signaling import CallSession


TERMINAL_CALL_OUTCOMES = frozenset({'completed', 'cancelled', 'rejected', 'busy', 'failed'})


async def start_call_record(session: AsyncSession, call: CallSession) -> CallRecord:
    record = await session.scalar(
        select(CallRecord).where(CallRecord.call_id == call.call_id).limit(1),
    )
    if record:
        return record

    record = CallRecord(
        call_id=call.call_id,
        chat_id=call.chat_id,
        caller_user_id=call.caller_user_id,
        callee_user_id=call.callee_user_id,
        call_type=call.call_type,
        created_at=call.created_at,
    )
    session.add(record)
    await session.commit()
    return record


async def finalize_call_record(
    session: AsyncSession,
    call: CallSession,
    outcome: str,
    *,
    ended_at: datetime | None = None,
) -> CallRecord:
    if outcome not in TERMINAL_CALL_OUTCOMES:
        raise ValueError('Unsupported call record outcome')

    record = await session.scalar(
        select(CallRecord).where(CallRecord.call_id == call.call_id).limit(1),
    )
    if record and record.outcome != 'pending':
        return record

    if not record:
        record = CallRecord(
            call_id=call.call_id,
            chat_id=call.chat_id,
            caller_user_id=call.caller_user_id,
            callee_user_id=call.callee_user_id,
            call_type=call.call_type,
            created_at=call.created_at,
        )
        session.add(record)

    finalized_at = ended_at or datetime.now(timezone.utc)
    record.connected_at = record.connected_at or call.connected_at
    record.ended_at = finalized_at
    record.outcome = outcome
    record.duration_seconds = _duration_seconds(record.connected_at, finalized_at)
    await session.commit()
    return record


async def mark_call_record_connected(session: AsyncSession, call: CallSession) -> CallRecord:
    record = await start_call_record(session, call)
    if call.connected_at and record.connected_at is None:
        record.connected_at = call.connected_at
        await session.commit()
    return record


async def list_call_history(
    session: AsyncSession,
    user_id: UUID,
    limit: int,
) -> list[CallHistoryItemOut]:
    interaction_is_blocked = exists(
        select(UserBlock.id).where(
            or_(
                and_(
                    UserBlock.blocker_user_id == CallRecord.caller_user_id,
                    UserBlock.blocked_user_id == CallRecord.callee_user_id,
                ),
                and_(
                    UserBlock.blocker_user_id == CallRecord.callee_user_id,
                    UserBlock.blocked_user_id == CallRecord.caller_user_id,
                ),
            )
        )
    )
    records = list((await session.execute(
        select(CallRecord)
        .where(
            or_(
                CallRecord.caller_user_id == user_id,
                CallRecord.callee_user_id == user_id,
            ),
            CallRecord.outcome != 'pending',
            ~interaction_is_blocked,
        )
        .order_by(CallRecord.ended_at.desc(), CallRecord.id.desc())
        .limit(limit)
    )).scalars())

    result: list[CallHistoryItemOut] = []
    for record in records:
        item = await call_history_item_for_user(session, record, user_id)
        if item:
            result.append(item)
    return result


async def call_history_item_for_user(
    session: AsyncSession,
    record: CallRecord,
    user_id: UUID,
) -> CallHistoryItemOut | None:
    if user_id not in {record.caller_user_id, record.callee_user_id}:
        return None
    if record.outcome not in TERMINAL_CALL_OUTCOMES or not record.ended_at:
        return None

    is_outgoing = record.caller_user_id == user_id
    peer_user_id = record.callee_user_id if is_outgoing else record.caller_user_id
    peer = await _call_history_peer(session, peer_user_id)
    if not peer:
        return None

    return CallHistoryItemOut(
        id=record.id,
        call_id=record.call_id,
        chat_id=record.chat_id,
        call_type=record.call_type,
        direction='outgoing' if is_outgoing else 'incoming',
        outcome=record.outcome,
        peer=peer,
        started_at=record.created_at,
        connected_at=record.connected_at,
        ended_at=record.ended_at,
        duration_seconds=record.duration_seconds,
    )


async def _call_history_peer(
    session: AsyncSession,
    user_id: UUID,
) -> CallHistoryPeerOut | None:
    user = await session.get(User, user_id)
    profile = await session.get(UserProfile, user_id)
    if not user or not profile or user.deleted_at:
        return None

    return CallHistoryPeerOut(
        id=user.id,
        display_name=profile.display_name,
        username=profile.username,
        avatar_type=profile.avatar_type,
        avatar_ref=profile.avatar_ref,
        is_official=is_configured_admin_profile(profile),
    )


def _duration_seconds(connected_at: datetime | None, ended_at: datetime) -> int | None:
    if not connected_at:
        return None
    return max(0, int((ended_at - connected_at).total_seconds()))
