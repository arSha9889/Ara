from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import set_committed_value

from app.core.config import settings
from app.domain.nexus_id import is_valid_nexus_id
from app.domain.validators import is_valid_username
from app.models.users import User, UserProfile
from app.schemas.users import ProfileUpdateRequest, PublicUserOut, PublicUserProfileOut
from app.services.auth_service import AuthError, get_user_with_profile, to_user_out
from app.services.phone_verification_service import PhoneVerificationError, normalize_phone
from app.services.safety_service import is_user_interaction_blocked
from app.services.stored_object_service import replace_uploaded_avatar, retire_uploaded_avatars


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
    if request.email is not None:
        raise AuthError('E-mail can only be changed through e-mail verification')
    if 'optional_phone' in request.model_fields_set:
        try:
            requested_phone = normalize_phone(request.optional_phone) if request.optional_phone else None
        except PhoneVerificationError as exc:
            raise AuthError(str(exc)) from exc

        configured_admin_phone = _configured_admin_phone()
        if (
            requested_phone
            and requested_phone != profile.optional_phone
            and configured_admin_phone
            and requested_phone == configured_admin_phone
        ):
            raise AuthError('Phone number is reserved for administrator access')

        if requested_phone and requested_phone != profile.optional_phone:
            existing_user_id = await session.scalar(
                select(UserProfile.user_id).where(
                    UserProfile.optional_phone == requested_phone,
                    UserProfile.user_id != user_id,
                )
            )
            if existing_user_id:
                raise AuthError('Phone number is already in use')

        had_phone = profile.optional_phone is not None
        profile.optional_phone = requested_phone
        if not requested_phone or not had_phone:
            profile.phone_public = False
    if request.phone_public is not None:
        profile.phone_public = request.phone_public if profile.optional_phone else False
    if request.avatar_type is not None or request.avatar_ref is not None:
        avatar_type = request.avatar_type or profile.avatar_type
        avatar_ref = request.avatar_ref if request.avatar_ref is not None else profile.avatar_ref
        if avatar_type not in {'built_in', 'uploaded'}:
            raise AuthError('Unsupported avatar type')
        if avatar_type == 'built_in' and avatar_ref not in {f'animal-{index:02d}' for index in range(1, 21)}:
            raise AuthError('Unsupported built-in avatar')
        if avatar_type == 'uploaded' and not avatar_ref.startswith(('http://', 'https://', '/storage/', '/api/media/avatars/')):
            raise AuthError('Unsupported uploaded avatar')
        try:
            if avatar_type == 'uploaded':
                await replace_uploaded_avatar(session, user_id, avatar_ref)
            elif profile.avatar_type == 'uploaded':
                await retire_uploaded_avatars(session, user_id)
        except ValueError as exc:
            raise AuthError(str(exc)) from exc
        profile.avatar_type = avatar_type
        profile.avatar_ref = avatar_ref
    if request.language is not None:
        if request.language not in {'ru', 'en', 'kk', 'ky', 'uk', 'be', 'uz'}:
            raise AuthError('Unsupported language')
        profile.language = request.language
    if request.design_theme is not None:
        if request.design_theme not in {'halo', 'comet', 'liquid_glass'}:
            raise AuthError('Unsupported design theme')
        profile.design_theme = request.design_theme
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise AuthError('Phone number is already in use') from exc
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


async def search_users(session: AsyncSession, query: str, current_user_id=None):
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
    return [
        to_public_user_out(user)
        for user in users
        if current_user_id is None or not await is_user_interaction_blocked(session, current_user_id, user.id)
    ]


async def find_public_user(session: AsyncSession, identifier: str, current_user_id=None):
    if is_valid_nexus_id(identifier):
        statement = select(User).where(User.nexus_id == identifier, User.deleted_at.is_(None))
    else:
        statement = select(User).join(UserProfile).where(UserProfile.username == identifier, User.deleted_at.is_(None))
    result = await session.execute(statement)
    user = result.scalar_one_or_none()
    if not user:
        raise AuthError('User not found')
    if current_user_id is not None and await is_user_interaction_blocked(session, current_user_id, user.id):
        raise AuthError('User not found')
    set_committed_value(user, 'profile', await session.get(UserProfile, user.id))
    return to_public_user_out(user)


def to_public_user_out(user: User) -> PublicUserOut:
    from app.services.admin_service import is_configured_admin_profile

    profile = user.profile
    return PublicUserOut(
        id=user.id,
        is_official=is_configured_admin_profile(profile),
        profile=PublicUserProfileOut(
            display_name=profile.display_name,
            username=profile.username,
            avatar_type=profile.avatar_type,
            avatar_ref=profile.avatar_ref,
            optional_phone=profile.optional_phone if profile.phone_public else None,
        ) if profile else None,
    )


def _configured_admin_phone() -> str | None:
    if settings.admin_email.strip() or not settings.admin_phone.strip():
        return None
    try:
        return normalize_phone(settings.admin_phone)
    except PhoneVerificationError:
        return None
