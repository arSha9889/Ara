import secrets
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.auth import get_current_user
from app.core.config import settings
from app.db.session import get_db_session
from app.domain.registration_proof import create_registration_proof
from app.domain.telegram_auth import verify_telegram_login
from app.schemas.auth import (
    DevRegistrationProofRequest,
    DevRegistrationProofResponse,
    EarlyAccessRegistrationProofResponse,
    LoginRequest,
    LogoutRequest,
    RefreshRequest,
    RegisterCompleteRequest,
    RegisterCompleteResponse,
    TelegramCallbackRequest,
    TelegramCallbackResponse,
    TokenPairResponse,
)
from app.schemas.users import UserOut
from app.services.auth_service import (
    AuthError,
    complete_registration,
    count_active_users,
    find_user_by_telegram_id,
    get_user_with_profile,
    issue_session_for_user,
    login_with_password,
    logout_by_refresh_token,
    refresh_access_token,
)

router = APIRouter()


@router.post('/telegram/start')
async def telegram_start() -> dict[str, str]:
    return {'status': 'ready'}


@router.post('/dev/registration-proof', response_model=DevRegistrationProofResponse, include_in_schema=False)
async def dev_registration_proof(request: DevRegistrationProofRequest) -> DevRegistrationProofResponse:
    if settings.environment != 'dev':
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Not found')
    return DevRegistrationProofResponse(registration_proof=create_registration_proof(request.telegram_id))


@router.post('/early-access/registration-proof', response_model=EarlyAccessRegistrationProofResponse)
async def early_access_registration_proof(
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> EarlyAccessRegistrationProofResponse:
    registered_users_count = await count_active_users(session)
    remaining_slots = max(settings.early_access_bypass_limit - registered_users_count, 0)
    if remaining_slots <= 0:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail='Early access registration limit is reached',
        )

    return EarlyAccessRegistrationProofResponse(
        registration_proof=create_registration_proof(f'early-access-{secrets.token_urlsafe(16)}'),
        remaining_slots=remaining_slots - 1,
    )


@router.post('/telegram/callback', response_model=TelegramCallbackResponse)
async def telegram_callback(
    request: TelegramCallbackRequest,
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> TelegramCallbackResponse:
    try:
        identity = verify_telegram_login(request.payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    user = await find_user_by_telegram_id(session, identity.telegram_id)
    if user:
        user = await get_user_with_profile(session, user.id)
        user_out, access_token, refresh_token = await issue_session_for_user(
            session,
            user,
            request.device_id or 'telegram-widget',
            'telegram_login',
        )
        return TelegramCallbackResponse(
            is_registered=True,
            access_token=access_token,
            refresh_token=refresh_token,
            user=user_out,
        )

    return TelegramCallbackResponse(
        is_registered=False,
        registration_proof=create_registration_proof(identity.telegram_id),
    )


@router.post('/register/complete', response_model=RegisterCompleteResponse)
async def register_complete(
    request: RegisterCompleteRequest,
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> RegisterCompleteResponse:
    try:
        user, access_token, refresh_token, recovery_code = await complete_registration(session, request)
    except AuthError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return RegisterCompleteResponse(
        user=user,
        access_token=access_token,
        refresh_token=refresh_token,
        recovery_code=recovery_code,
    )


@router.post('/login', response_model=TokenPairResponse)
async def login(
    request: LoginRequest,
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> TokenPairResponse:
    try:
        user, access_token, refresh_token = await login_with_password(
            session,
            request.nexus_id,
            request.password,
            request.device_id,
        )
    except AuthError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc
    return TokenPairResponse(user=user, access_token=access_token, refresh_token=refresh_token)


@router.post('/logout')
async def logout(
    request: LogoutRequest,
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> dict[str, str]:
    await logout_by_refresh_token(session, request.refresh_token)
    return {'status': 'ok'}


@router.post('/refresh', response_model=TokenPairResponse)
async def refresh(
    request: RefreshRequest,
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> TokenPairResponse:
    try:
        user, access_token, refresh_token = await refresh_access_token(session, request.refresh_token)
    except AuthError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc
    return TokenPairResponse(user=user, access_token=access_token, refresh_token=refresh_token)


@router.get('/me', response_model=UserOut)
async def me(current_user: Annotated[UserOut, Depends(get_current_user)]) -> UserOut:
    return current_user
