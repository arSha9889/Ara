from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import set_committed_value

from app.domain.nexus_id import is_valid_nexus_id
from app.domain.validators import is_valid_username
from app.models.users import User, UserProfile
from app.schemas.users import ProfileUpdateRequest
from app.services.auth_service import AuthError, get_user_with_profile, to_user_out


async def get_current_user_out(session: AsyncSession, user_id):
    user = await get_user_with_profile(session, user_id)
    if not user:
        raise AuthError('User not found')
    return to_user_out(user)


async def update_profile(session: AsyncSession, user_id, request: ProfileUpdateRequest):
    profile = await session.get(UserProfile, user_id)
    if not profile:
        raise AuthError('Profile not found')
    if request.display_name is not None:
        profile.display_name = request.display_name
    if request.optional_phone is not None:
        profile.optional_phone = request.optional_phone or None
    if request.phone_public is not None:
        profile.phone_public = request.phone_public
    if request.avatar_type is not None or request.avatar_ref is not None:
        avatar_type = request.avatar_type or profile.avatar_type
        avatar_ref = request.avatar_ref or profile.avatar_ref
        if avatar_type not in {'built_in', 'uploaded'}:
            raise AuthError('Unsupported avatar type')
        if avatar_type == 'built_in' and avatar_ref not in {f'animal-{index:02d}' for index in range(1, 21)}:
            raise AuthError('Unsupported built-in avatar')
        profile.avatar_type = avatar_type
        profile.avatar_ref = avatar_ref
    if request.language is not None:
        if request.language not in {'ru', 'en'}:
            raise AuthError('Unsupported language')
        profile.language = request.language
    if request.design_theme is not None:
        if request.design_theme not in {'halo', 'orbit', 'aurora', 'liquid_glass'}:
            raise AuthError('Unsupported design theme')
        profile.design_theme = request.design_theme
    await session.commit()
    return await get_current_user_out(session, user_id)


async def is_username_available(session: AsyncSession, username: str) -> bool:
    if not is_valid_username(username):
        raise AuthError('Username должен содержать только латинские буквы и цифры, от 3 до 32 символов')
    result = await session.execute(select(UserProfile.user_id).where(UserProfile.username == username))
    return result.scalar_one_or_none() is None


async def update_username(session: AsyncSession, user_id, username: str):
    if not await is_username_available(session, username):
        raise AuthError('Этот username уже занят')
    profile = await session.get(UserProfile, user_id)
    if not profile:
        raise AuthError('Profile not found')
    profile.username = username
    await session.commit()
    return await get_current_user_out(session, user_id)


async def search_users(session: AsyncSession, query: str):
    value = query.strip()
    if not value:
        return []
    statement = select(User).join(UserProfile).where(
        User.deleted_at.is_(None),
        or_(UserProfile.username.ilike(f'%{value}%'), User.nexus_id == value),
    ).limit(20)
    result = await session.execute(statement)
    users = result.scalars().all()
    for user in users:
        set_committed_value(user, 'profile', await session.get(UserProfile, user.id))
    return [to_user_out(user) for user in users]


async def find_public_user(session: AsyncSession, identifier: str):
    if is_valid_nexus_id(identifier):
        statement = select(User).where(User.nexus_id == identifier, User.deleted_at.is_(None))
    else:
        statement = select(User).join(UserProfile).where(UserProfile.username == identifier, User.deleted_at.is_(None))
    result = await session.execute(statement)
    user = result.scalar_one_or_none()
    if not user:
        raise AuthError('User not found')
    set_committed_value(user, 'profile', await session.get(UserProfile, user.id))
    return to_user_out(user)
