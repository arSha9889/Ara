import asyncio
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

from sqlalchemy import and_, delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.audit import AuditLog
from app.models.chats import Notification, PushSubscription
from app.models.oauth import OAuthAttempt
from app.models.security import TrustedDevicePin
from app.models.sessions import LoginHistory, Session
from app.models.storage import StoredObject
from app.models.verification import EmailVerification, PasswordConfirmation, PhoneVerification
from app.services.storage_service import delete_storage_object


class RetentionError(ValueError):
    pass


_retention_lock = asyncio.Lock()
_RETENTION_ADVISORY_LOCK_ID = 415_312_790


def read_host_storage_status() -> dict:
    empty = {
        'collector_available': False,
        'collected_at': None,
        'last_cleanup_at': None,
        'disk_total_bytes': None,
        'disk_used_bytes': None,
        'disk_available_bytes': None,
        'disk_usage_percent': None,
        'docker_bytes': None,
        'docker_log_bytes': None,
        'postgres_bytes': None,
        'redis_bytes': None,
        'local_backup_bytes': None,
    }
    try:
        data = json.loads(Path(settings.maintenance_status_file).read_text(encoding='utf-8'))
    except (OSError, ValueError, TypeError):
        return empty
    if not isinstance(data, dict):
        return empty

    result = {**empty, 'collector_available': True}
    for key in ('collected_at', 'last_cleanup_at'):
        value = data.get(key)
        result[key] = value if isinstance(value, str) else None
    for key in (
        'disk_total_bytes',
        'disk_used_bytes',
        'disk_available_bytes',
        'disk_usage_percent',
        'docker_bytes',
        'docker_log_bytes',
        'postgres_bytes',
        'redis_bytes',
        'local_backup_bytes',
    ):
        value = data.get(key)
        result[key] = value if isinstance(value, int) and value >= 0 else None
    return result


async def preview_retention(session: AsyncSession) -> dict:
    now = datetime.now(timezone.utc)
    categories = []

    async def add_count(key: str, model, condition) -> None:
        count = await session.scalar(select(func.count()).select_from(model).where(condition))
        categories.append({'key': key, 'count': int(count or 0), 'bytes': None})

    verification_cutoff = now - timedelta(days=settings.verification_retention_days)
    await add_count('email_verifications', EmailVerification, EmailVerification.expires_at < verification_cutoff)
    await add_count('phone_verifications', PhoneVerification, PhoneVerification.expires_at < verification_cutoff)
    await add_count('password_confirmations', PasswordConfirmation, PasswordConfirmation.expires_at < verification_cutoff)
    await add_count('oauth_attempts', OAuthAttempt, OAuthAttempt.expires_at < now - timedelta(days=settings.oauth_attempt_retention_days))

    session_cutoff = now - timedelta(days=settings.session_retention_days)
    await add_count(
        'sessions',
        Session,
        or_(Session.expires_at < session_cutoff, Session.revoked_at < session_cutoff),
    )
    await add_count(
        'trusted_pins',
        TrustedDevicePin,
        or_(TrustedDevicePin.trusted_until < session_cutoff, TrustedDevicePin.revoked_at < session_cutoff),
    )
    await add_count(
        'login_history',
        LoginHistory,
        LoginHistory.created_at < now - timedelta(days=settings.login_history_retention_days),
    )
    await add_count(
        'notifications',
        Notification,
        or_(
            Notification.read_at < now - timedelta(days=settings.read_notification_retention_days),
            and_(
                Notification.read_at.is_(None),
                Notification.created_at < now - timedelta(days=settings.unread_notification_retention_days),
            ),
        ),
    )
    await add_count(
        'audit_logs',
        AuditLog,
        AuditLog.created_at < now - timedelta(days=settings.audit_log_retention_days),
    )
    await add_count(
        'push_subscriptions',
        PushSubscription,
        or_(
            PushSubscription.expiration_time < now,
            and_(
                PushSubscription.is_active.is_(False),
                PushSubscription.updated_at < session_cutoff,
            ),
        ),
    )

    object_condition = _expired_object_condition(now)
    object_count, object_bytes = (await session.execute(
        select(func.count(), func.coalesce(func.sum(StoredObject.size_bytes), 0)).where(object_condition)
    )).one()
    categories.append({'key': 'stored_objects', 'count': int(object_count or 0), 'bytes': int(object_bytes or 0)})
    return {'generated_at': now, 'categories': categories}


async def run_retention(session: AsyncSession, actor_user_id=None) -> dict:
    if _retention_lock.locked():
        raise RetentionError('Maintenance is already running')

    async with _retention_lock:
        advisory_connection = None
        try:
            if session.bind and session.bind.dialect.name == 'postgresql':
                advisory_connection = await session.bind.connect()
                lock_acquired = await advisory_connection.scalar(
                    select(func.pg_try_advisory_lock(_RETENTION_ADVISORY_LOCK_ID))
                )
                if not lock_acquired:
                    raise RetentionError('Maintenance is already running')

            now = datetime.now(timezone.utc)
            verification_cutoff = now - timedelta(days=settings.verification_retention_days)
            session_cutoff = now - timedelta(days=settings.session_retention_days)
            deleted_counts = {}

            async def purge(key: str, statement) -> None:
                result = await session.execute(statement)
                deleted_counts[key] = max(result.rowcount or 0, 0)

            await purge('email_verifications', delete(EmailVerification).where(EmailVerification.expires_at < verification_cutoff))
            await purge('phone_verifications', delete(PhoneVerification).where(PhoneVerification.expires_at < verification_cutoff))
            await purge('password_confirmations', delete(PasswordConfirmation).where(PasswordConfirmation.expires_at < verification_cutoff))
            await purge('oauth_attempts', delete(OAuthAttempt).where(
                OAuthAttempt.expires_at < now - timedelta(days=settings.oauth_attempt_retention_days)
            ))
            await purge('sessions', delete(Session).where(or_(Session.expires_at < session_cutoff, Session.revoked_at < session_cutoff)))
            await purge('trusted_pins', delete(TrustedDevicePin).where(
                or_(TrustedDevicePin.trusted_until < session_cutoff, TrustedDevicePin.revoked_at < session_cutoff)
            ))
            await purge('login_history', delete(LoginHistory).where(
                LoginHistory.created_at < now - timedelta(days=settings.login_history_retention_days)
            ))
            await purge('notifications', delete(Notification).where(
                or_(
                    Notification.read_at < now - timedelta(days=settings.read_notification_retention_days),
                    and_(
                        Notification.read_at.is_(None),
                        Notification.created_at < now - timedelta(days=settings.unread_notification_retention_days),
                    ),
                )
            ))
            await purge('push_subscriptions', delete(PushSubscription).where(
                or_(
                    PushSubscription.expiration_time < now,
                    and_(PushSubscription.is_active.is_(False), PushSubscription.updated_at < session_cutoff),
                )
            ))

            objects = list((await session.execute(
                select(StoredObject)
                .where(_expired_object_condition(now))
                .order_by(StoredObject.delete_after.asc().nullsfirst(), StoredObject.created_at.asc())
                .limit(settings.retention_batch_size)
                .with_for_update(skip_locked=True)
            )).scalars())
            object_keys = [(stored_object.id, stored_object.storage_key) for stored_object in objects]
            for stored_object in objects:
                # Persist intent before an irreversible storage operation. If the
                # process stops after a successful deletion, a later run retries
                # the idempotent deletion instead of losing the registry row.
                stored_object.status = 'deletion_pending'
                stored_object.delete_after = now
            await session.commit()

            removed_objects = 0
            failed_objects = 0
            for object_id, storage_key in object_keys:
                try:
                    await delete_storage_object(storage_key)
                except Exception:
                    failed_objects += 1
                    continue
                result = await session.execute(
                    delete(StoredObject).where(
                        StoredObject.id == object_id,
                        StoredObject.status == 'deletion_pending',
                        StoredObject.delete_after <= now,
                    )
                )
                await session.commit()
                removed_objects += max(result.rowcount or 0, 0)
            deleted_counts['stored_objects'] = removed_objects
            deleted_counts['stored_objects_failed'] = failed_objects

            await purge('audit_logs', delete(AuditLog).where(
                AuditLog.created_at < now - timedelta(days=settings.audit_log_retention_days)
            ))
            session.add(AuditLog(
                actor_user_id=actor_user_id,
                actor_type='admin' if actor_user_id else 'system',
                action='maintenance.retention_run',
                target_type='retention',
                metadata_json={'deleted': deleted_counts, 'at': now.isoformat()},
            ))
            await session.commit()
            return {'completed_at': now, 'deleted': deleted_counts}
        except Exception:
            await session.rollback()
            raise
        finally:
            if advisory_connection:
                try:
                    await advisory_connection.scalar(select(func.pg_advisory_unlock(_RETENTION_ADVISORY_LOCK_ID)))
                finally:
                    await advisory_connection.close()


def _expired_object_condition(now: datetime):
    return or_(
        and_(
            StoredObject.status == 'pending',
            StoredObject.created_at < now - timedelta(days=settings.upload_orphan_retention_days),
        ),
        and_(
            StoredObject.status.in_(['orphaned', 'deletion_pending']),
            StoredObject.delete_after.is_not(None),
            StoredObject.delete_after <= now,
        ),
    )
