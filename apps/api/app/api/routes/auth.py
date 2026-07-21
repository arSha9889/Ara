import secrets
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.auth import get_current_user
from app.core.config import settings
from app.db.session import get_db_session
from app.domain.registration_proof import create_registration_proof
from app.schemas.auth import (
    DevRegistrationProofRequest,
    DevRegistrationProofResponse,
    EmailVerificationConfirmRequest,
    EmailVerificationConfirmResponse,
    EmailVerificationStartRequest,
    EmailVerificationStartResponse,
    LoginRequest,
    LogoutRequest,
    PhoneVerificationConfirmRequest,
    PhoneVerificationConfirmResponse,
    PhoneVerificationStartRequest,
    PhoneVerificationStartResponse,
    RefreshRequest,
    RegisterCompleteRequest,
    RegisterCompleteResponse,
    TokenPairResponse,
)
from app.schemas.users import UserOut
from app.services.auth_service import (
    AuthError,
    complete_registration,
    delete_account,
    login_with_password,
    logout_by_refresh_token,
    refresh_access_token,
)
from app.services.email_verification_service import (
    EMAIL_VERIFICATION_TTL_MINUTES,
    EmailVerificationError,
    create_email_verification,
    verify_email_code,
)
from app.services.phone_verification_service import (
    PHONE_VERIFICATION_TTL_MINUTES,
    PhoneVerificationError,
    create_phone_verification,
    handle_telegram_bot_update,
    verify_phone_code,
)

router = APIRouter()


@router.post('/telegram/start')
async def telegram_start() -> dict[str, str]:
    return {'status': 'ready'}


@router.post('/telegram/webhook', include_in_schema=False)
async def telegram_webhook(
    update: dict,
    session: Annotated[AsyncSession, Depends(get_db_session)],
    x_telegram_bot_api_secret_token: Annotated[str | None, Header()] = None,
) -> dict[str, str]:
    if settings.telegram_webhook_secret and not secrets.compare_digest(
        x_telegram_bot_api_secret_token or '',
        settings.telegram_webhook_secret,
    ):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Invalid Telegram webhook secret')
    await handle_telegram_bot_update(session, update)
    return {'status': 'ok'}


@router.post('/phone-verification/start', response_model=PhoneVerificationStartResponse)
async def phone_verification_start(
    request: PhoneVerificationStartRequest,
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> PhoneVerificationStartResponse:
    if not settings.telegram_bot_name or not settings.telegram_bot_token:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail='Telegram bot is not configured')
    try:
        started = await create_phone_verification(session, request.country, request.phone, request.device_id)
    except PhoneVerificationError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return PhoneVerificationStartResponse(
        verification_id=started.verification.id,
        bot_url=f'https://t.me/{settings.telegram_bot_name}?start={started.start_payload}',
        expires_in_seconds=PHONE_VERIFICATION_TTL_MINUTES * 60,
    )


@router.post('/phone-verification/confirm', response_model=PhoneVerificationConfirmResponse)
async def phone_verification_confirm(
    request: PhoneVerificationConfirmRequest,
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> PhoneVerificationConfirmResponse:
    try:
        result = await verify_phone_code(session, request.verification_id, request.code)
    except PhoneVerificationError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return PhoneVerificationConfirmResponse(
        registration_proof=result.registration_proof,
        phone=result.verification.phone,
    )


@router.post('/email-verification/start', response_model=EmailVerificationStartResponse)
async def email_verification_start(
    request: EmailVerificationStartRequest,
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> EmailVerificationStartResponse:
    if not settings.telegram_bot_name or not settings.telegram_bot_token:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail='Telegram bot is not configured')
    try:
        started = await create_email_verification(session, request.email, request.device_id)
    except EmailVerificationError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return EmailVerificationStartResponse(
        verification_id=started.verification.id,
        bot_url=f'https://t.me/{settings.telegram_bot_name}?start={started.start_payload}',
        expires_in_seconds=EMAIL_VERIFICATION_TTL_MINUTES * 60,
    )


@router.post('/email-verification/confirm', response_model=EmailVerificationConfirmResponse)
async def email_verification_confirm(
    request: EmailVerificationConfirmRequest,
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> EmailVerificationConfirmResponse:
    try:
        result = await verify_email_code(session, request.verification_id, request.code)
    except EmailVerificationError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return EmailVerificationConfirmResponse(
        registration_proof=result.registration_proof,
        email=result.verification.email,
    )


@router.post('/dev/registration-proof', response_model=DevRegistrationProofResponse, include_in_schema=False)
async def dev_registration_proof(request: DevRegistrationProofRequest) -> DevRegistrationProofResponse:
    if settings.environment != 'dev':
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Not found')
    return DevRegistrationProofResponse(registration_proof=create_registration_proof(request.telegram_id))


@router.post('/register/complete', response_model=RegisterCompleteResponse)
async def register_complete(
    request: RegisterCompleteRequest,
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> RegisterCompleteResponse:
    try:
        user, access_token, refresh_token = await complete_registration(session, request)
    except AuthError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return RegisterCompleteResponse(
        user=user,
        access_token=access_token,
        refresh_token=refresh_token,
    )


@router.post('/login', response_model=TokenPairResponse)
async def login(
    request: LoginRequest,
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> TokenPairResponse:
    identifier = request.identifier or request.email or request.phone or request.nexus_id
    if not identifier:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='Login identifier is required')
    try:
        user, access_token, refresh_token = await login_with_password(
            session,
            identifier,
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


@router.delete('/account')
async def delete_current_account(
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> dict[str, str]:
    try:
        await delete_account(session, current_user.id)
    except AuthError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return {'status': 'ok'}
