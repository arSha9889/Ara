from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.storage import StoredObject
from app.services.storage_service import StoredUpload, private_media_url_for, public_avatar_url_for


async def register_pending_upload(
    session: AsyncSession,
    owner_user_id: UUID,
    upload: StoredUpload,
    purpose: str,
) -> StoredObject:
    stored_object = StoredObject(
        owner_user_id=owner_user_id,
        storage_key=upload.storage_key,
        public_url='',
        purpose=purpose,
        status='pending',
        size_bytes=upload.size_bytes,
    )
    session.add(stored_object)
    await session.flush()
    stored_object.public_url = (
        public_avatar_url_for(stored_object.id)
        if purpose == 'avatar'
        else private_media_url_for(stored_object.id)
    )
    return stored_object


async def attach_upload_to_message(
    session: AsyncSession,
    owner_user_id: UUID,
    message_id: UUID,
    public_url: str | None,
) -> None:
    if not public_url:
        return

    stored_object = await session.scalar(
        select(StoredObject).where(StoredObject.public_url == public_url).limit(1).with_for_update()
    )
    if not stored_object:
        # URLs created before the upload registry or external media remain
        # readable, but are deliberately excluded from automatic deletion.
        return
    if (
        stored_object.owner_user_id != owner_user_id
        or stored_object.purpose != 'message'
        or stored_object.status != 'pending'
    ):
        raise ValueError('Uploaded file is not available for this message')

    stored_object.status = 'attached_message'
    stored_object.message_id = message_id
    stored_object.attached_at = datetime.now(timezone.utc)


async def attach_upload_to_support_message(
    session: AsyncSession,
    owner_user_id: UUID,
    support_message_id: UUID,
    public_url: str | None,
) -> None:
    if not public_url:
        return

    stored_object = await session.scalar(
        select(StoredObject).where(StoredObject.public_url == public_url).limit(1).with_for_update()
    )
    if not stored_object:
        raise ValueError('Uploaded file is not available for this support message')
    if (
        stored_object.owner_user_id != owner_user_id
        or stored_object.purpose != 'support'
        or stored_object.status != 'pending'
    ):
        raise ValueError('Uploaded file is not available for this support message')

    stored_object.status = 'attached_support_message'
    stored_object.support_message_id = support_message_id
    stored_object.attached_at = datetime.now(timezone.utc)


async def replace_uploaded_avatar(
    session: AsyncSession,
    owner_user_id: UUID,
    public_url: str,
) -> None:
    now = datetime.now(timezone.utc)
    stored_object = await session.scalar(
        select(StoredObject).where(StoredObject.public_url == public_url).limit(1).with_for_update()
    )
    if stored_object and (
        stored_object.owner_user_id != owner_user_id
        or stored_object.purpose != 'avatar'
        or stored_object.status not in {'pending', 'attached_avatar'}
    ):
        raise ValueError('Uploaded avatar is not available for this profile')

    await _retire_uploaded_avatars(session, owner_user_id, now, exclude_url=public_url)
    if stored_object and stored_object.status == 'pending':
        stored_object.status = 'attached_avatar'
        stored_object.attached_at = now


async def retire_uploaded_avatars(session: AsyncSession, owner_user_id: UUID) -> None:
    await _retire_uploaded_avatars(session, owner_user_id, datetime.now(timezone.utc))


async def schedule_message_upload_deletion(session: AsyncSession, message_id: UUID) -> None:
    delete_after = datetime.now(timezone.utc) + timedelta(days=settings.deleted_message_retention_days)
    await session.execute(
        update(StoredObject)
        .where(
            StoredObject.message_id == message_id,
            StoredObject.status == 'attached_message',
        )
        .values(status='deletion_pending', delete_after=delete_after)
    )


async def _retire_uploaded_avatars(
    session: AsyncSession,
    owner_user_id: UUID,
    now: datetime,
    exclude_url: str | None = None,
) -> None:
    conditions = [
        StoredObject.owner_user_id == owner_user_id,
        StoredObject.purpose == 'avatar',
        StoredObject.status == 'attached_avatar',
    ]
    if exclude_url is not None:
        conditions.append(StoredObject.public_url != exclude_url)
    await session.execute(
        update(StoredObject)
        .where(*conditions)
        .values(status='orphaned', delete_after=now + timedelta(days=settings.upload_orphan_retention_days))
    )
