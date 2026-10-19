from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.chats import BranchComment, Chat, ChatParticipant, Message
from app.models.users import UserProfile
from app.schemas.chats import BranchCommentOut, MessageAuthorOut
from app.services.auth_service import AuthError


COMMENTING_ROLES = {'member', 'owner', 'admin'}
COMMENT_RATE_LIMIT = 5
COMMENT_RATE_WINDOW = timedelta(minutes=1)


async def list_branch_comments(
    session: AsyncSession,
    user_id: UUID,
    branch_id: UUID,
    post_id: UUID,
    cursor: datetime | None = None,
    limit: int = 50,
) -> list[BranchCommentOut]:
    await _ensure_can_view_branch(session, user_id, branch_id)
    await _ensure_branch_post(session, branch_id, post_id)
    statement = select(BranchComment).where(BranchComment.branch_id == branch_id, BranchComment.post_id == post_id)
    if cursor:
        statement = statement.where(BranchComment.created_at < cursor)
    result = await session.execute(statement.order_by(BranchComment.created_at.desc()).limit(limit))
    comments = list(result.scalars())
    can_moderate = await _can_moderate(session, user_id, branch_id)
    return [await _comment_out(session, comment, can_moderate) for comment in reversed(comments)]


async def create_branch_comment(
    session: AsyncSession,
    user_id: UUID,
    branch_id: UUID,
    post_id: UUID,
    text: str,
) -> tuple[BranchCommentOut, int]:
    await _ensure_can_view_branch(session, user_id, branch_id)
    post = await _ensure_branch_post(session, branch_id, post_id)
    if not post.comments_enabled:
        raise AuthError('Comments are disabled for this post')
    participant = await session.get(ChatParticipant, {'chat_id': branch_id, 'user_id': user_id})
    if not participant or participant.role not in COMMENTING_ROLES:
        raise AuthError('Subscribe to this branch to comment')
    text = text.strip()
    if not text:
        raise AuthError('Comment cannot be empty')
    recent_count = await session.scalar(
        select(func.count()).select_from(BranchComment).where(
            BranchComment.author_id == user_id,
            BranchComment.branch_id == branch_id,
            BranchComment.created_at >= datetime.now(timezone.utc) - COMMENT_RATE_WINDOW,
        )
    )
    if int(recent_count or 0) >= COMMENT_RATE_LIMIT:
        raise AuthError('Too many comments. Please try again in a minute')
    comment = BranchComment(branch_id=branch_id, post_id=post_id, author_id=user_id, text=text)
    session.add(comment)
    await session.commit()
    await session.refresh(comment)
    return await _comment_out(session, comment, await _can_moderate(session, user_id, branch_id)), await _comment_count(session, post_id)


async def update_branch_comment(
    session: AsyncSession,
    user_id: UUID,
    branch_id: UUID,
    comment_id: UUID,
    text: str,
) -> BranchCommentOut:
    await _ensure_can_view_branch(session, user_id, branch_id)
    comment = await _comment_in_branch(session, branch_id, comment_id)
    if comment.author_id != user_id:
        raise AuthError('Only the author can edit this comment')
    if comment.deleted_at:
        raise AuthError('Deleted comment cannot be edited')
    text = text.strip()
    if not text:
        raise AuthError('Comment cannot be empty')
    comment.text = text
    comment.edited_at = datetime.now(timezone.utc)
    await session.commit()
    return await _comment_out(session, comment, await _can_moderate(session, user_id, branch_id))


async def delete_branch_comment(
    session: AsyncSession,
    user_id: UUID,
    branch_id: UUID,
    comment_id: UUID,
) -> tuple[BranchCommentOut, int]:
    await _ensure_can_view_branch(session, user_id, branch_id)
    comment = await _comment_in_branch(session, branch_id, comment_id)
    if comment.author_id != user_id and not await _can_moderate(session, user_id, branch_id):
        raise AuthError('Only the author or a branch administrator can delete this comment')
    if not comment.deleted_at:
        comment.text = ''
        comment.deleted_at = datetime.now(timezone.utc)
        await session.commit()
    return await _comment_out(session, comment, await _can_moderate(session, user_id, branch_id)), await _comment_count(session, comment.post_id)


async def get_branch_post_author_id(session: AsyncSession, branch_id: UUID, post_id: UUID) -> UUID:
    post = await _ensure_branch_post(session, branch_id, post_id)
    return post.sender_id


async def _ensure_can_view_branch(session: AsyncSession, user_id: UUID, branch_id: UUID) -> Chat:
    branch = await session.get(Chat, branch_id)
    if not branch or branch.type != 'branch' or branch.is_archived:
        raise AuthError('Branch not found')
    if branch.is_private and not await session.get(ChatParticipant, {'chat_id': branch_id, 'user_id': user_id}):
        raise AuthError('Branch not found')
    return branch


async def _ensure_branch_post(session: AsyncSession, branch_id: UUID, post_id: UUID) -> Message:
    branch = await session.get(Chat, branch_id)
    post = await session.get(Message, post_id)
    if not branch or branch.type != 'branch' or branch.is_archived or not post or post.chat_id != branch_id or post.deleted_at:
        raise AuthError('Branch post not found')
    return post


async def _comment_in_branch(session: AsyncSession, branch_id: UUID, comment_id: UUID) -> BranchComment:
    comment = await session.get(BranchComment, comment_id)
    if not comment or comment.branch_id != branch_id:
        raise AuthError('Comment not found')
    return comment


async def _can_moderate(session: AsyncSession, user_id: UUID, branch_id: UUID) -> bool:
    participant = await session.get(ChatParticipant, {'chat_id': branch_id, 'user_id': user_id})
    return bool(participant and participant.role in {'owner', 'admin'})


async def _comment_count(session: AsyncSession, post_id: UUID) -> int:
    result = await session.execute(
        select(func.count()).select_from(BranchComment).where(
            BranchComment.post_id == post_id,
            BranchComment.deleted_at.is_(None),
        )
    )
    return int(result.scalar_one())


async def _comment_out(session: AsyncSession, comment: BranchComment, can_moderate: bool) -> BranchCommentOut:
    profile = await session.get(UserProfile, comment.author_id)
    author = MessageAuthorOut(
        id=comment.author_id,
        display_name=profile.display_name,
        username=profile.username,
        avatar_type=profile.avatar_type,
        avatar_ref=profile.avatar_ref,
    ) if profile else None
    return BranchCommentOut(
        id=comment.id,
        branch_id=comment.branch_id,
        post_id=comment.post_id,
        author_id=comment.author_id,
        author=author,
        text=comment.text,
        created_at=comment.created_at,
        edited_at=comment.edited_at,
        deleted_at=comment.deleted_at,
        can_moderate=can_moderate,
    )
