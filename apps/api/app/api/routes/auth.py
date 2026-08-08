import secrets
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.auth import get_current_user
from app.core.config import settings
from app.db.session import get_db_session
from app.domain.registration_proof import create_registration_proof
from app.schemas.auth import (
    DevRegistrationProofRequest,
    DevRegistrationProofResponse,
    EmailChangeConfirmRequest,
    EmailChangeStartRequest,
    EmailChangeStartResponse,
    EmailVerificationConfirmRequest,
    EmailVerificationConfirmResponse,
    EmailVerificationStartRequest,
    EmailVerificationStartResponse,
    LegalDocumentsAcceptRequest,
    LoginRequest,
    LogoutRequest,
    OAuthCompleteRequest,
    OAuthCompleteResponse,
    OAuthStartRequest,
    OAuthStartResponse,
    PasswordChangeConfirmRequest,
    PasswordChangeStartRequest,
    PasswordChangeStartResponse,
    PasswordResetConfirmRequest,
    PasswordResetStartRequest,
    PasswordResetStartResponse,
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
    accept_legal_documents,
    complete_registration,
    confirm_email_change,
    confirm_password_change,
    delete_account,
    finish_password_reset,
    login_with_password,
    logout_by_refresh_token,
    refresh_access_token,
    start_email_change,
    start_password_change,
    start_password_reset,
)
from app.services.email_verification_service import (
    EMAIL_VERIFICATION_TTL_MINUTES,
    EmailVerificationError,
    create_email_verification,
    verify_email_code,
)
from app.services.oauth_service import (
    OAuthError,
    callback_redirect_url,
    finish_oauth_callback,
    oauth_link_result,
    oauth_login_result,
    start_oauth,
)
from app.services.auth_rate_limit import enforce_sensitive_auth_rate_limit
from app.services.smtp_mailer import SmtpDeliveryError
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


@router.post(
    '/phone-verification/start',
    response_model=PhoneVerificationStartResponse,
    dependencies=[Depends(enforce_sensitive_auth_rate_limit)],
)
async def phone_verification_start(
    request: PhoneVerificationStartRequest,
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> PhoneVerificationStartResponse:
    if not settings.telegram_bot_name or not settings.telegram_bot_token:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail='Telegram bot is not configured')
    try:
        started = await create_phone_verification(session, request.country, request.phone, request.device_id, request.language)
    except PhoneVerificationError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return PhoneVerificationStartResponse(
        verification_id=started.verification.id,
        bot_url=f'https://t.me/{settings.telegram_bot_name}?start={started.start_payload}',
        expires_in_seconds=PHONE_VERIFICATION_TTL_MINUTES * 60,
    )


@router.post(
    '/phone-verification/confirm',
    response_model=PhoneVerificationConfirmResponse,
    dependencies=[Depends(enforce_sensitive_auth_rate_limit)],
)
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


@router.post(
    '/email-verification/start',
    response_model=EmailVerificationStartResponse,
    dependencies=[Depends(enforce_sensitive_auth_rate_limit)],
)
async def email_verification_start(
    request: EmailVerificationStartRequest,
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> EmailVerificationStartResponse:
    try:
        started = await create_email_verification(session, request.email, request.device_id, language=request.language)
    except EmailVerificationError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except SmtpDeliveryError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    return EmailVerificationStartResponse(
        verification_id=started.verification.id,
        expires_in_seconds=EMAIL_VERIFICATION_TTL_MINUTES * 60,
    )


@router.post(
    '/email-verification/confirm',
    response_model=EmailVerificationConfirmResponse,
    dependencies=[Depends(enforce_sensitive_auth_rate_limit)],
)
async def email_verification_confirm(
    request: EmailVerificationConfirmRequest,
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> EmailVerificationConfirmResponse:
    try:
        result = await verify_email_code(session, request.verification_id, request.code)
    except EmailVerificationError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return EmailVerificationConfirmResponse(
        email=result.verification.email,
    )


@router.post('/dev/registration-proof', response_model=DevRegistrationProofResponse, include_in_schema=False)
async def dev_registration_proof(request: DevRegistrationProofRequest) -> DevRegistrationProofResponse:
    if settings.environment != 'dev':
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Not found')
    return DevRegistrationProofResponse(registration_proof=create_registration_proof(request.telegram_id))


@router.post(
    '/register/complete',
    response_model=RegisterCompleteResponse,
    dependencies=[Depends(enforce_sensitive_auth_rate_limit)],
)
async def register_complete(
    request: RegisterCompleteRequest,
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> RegisterCompleteResponse:
    try:
        completion = await complete_registration(session, request)
    except AuthError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return RegisterCompleteResponse(
        access_token=completion.access_token,
        refresh_token=completion.refresh_token,
        user=completion.user,
    )
@router.post(
    '/password/change/start',
    response_model=PasswordChangeStartResponse,
    dependencies=[Depends(enforce_sensitive_auth_rate_limit)],
)
async def password_change_start(
    request: PasswordChangeStartRequest,
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> PasswordChangeStartResponse:
    try:
        confirmation = await start_password_change(
            session,
            current_user.id,
            request.current_password,
            request.new_password,
            request.device_id,
        )
    except SmtpDeliveryError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except AuthError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return PasswordChangeStartResponse(verification_id=confirmation.verification.id, expires_in_seconds=EMAIL_VERIFICATION_TTL_MINUTES * 60)


@router.post('/password/change/confirm', dependencies=[Depends(enforce_sensitive_auth_rate_limit)])
async def password_change_confirm(
    request: PasswordChangeConfirmRequest,
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> dict[str, str]:
    try:
        await confirm_password_change(
            session,
            current_user.id,
            request.verification_id,
            request.code,
            request.device_id,
        )
    except SmtpDeliveryError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except AuthError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return {'status': 'ok'}


@router.post(
    '/password/reset/start',
    response_model=PasswordResetStartResponse,
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(enforce_sensitive_auth_rate_limit)],
)
async def password_reset_start(
    request: PasswordResetStartRequest,
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> PasswordResetStartResponse:
    await start_password_reset(session, request.email, request.device_id, request.language)
    return PasswordResetStartResponse()


@router.post('/password/reset/confirm', dependencies=[Depends(enforce_sensitive_auth_rate_limit)])
async def password_reset_confirm(
    request: PasswordResetConfirmRequest,
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> dict[str, str]:
    try:
        await finish_password_reset(session, request.email, request.code, request.new_password, request.device_id)
    except SmtpDeliveryError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except AuthError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return {'status': 'ok'}


@router.post(
    '/oauth/{provider}/start',
    response_model=OAuthStartResponse,
    dependencies=[Depends(enforce_sensitive_auth_rate_limit)],
)
async def oauth_start(
    provider: str,
    request: OAuthStartRequest,
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> OAuthStartResponse:
    if provider not in {'vk', 'yandex'}:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='OAuth provider not found')
    try:
        started = await start_oauth(session, provider, request.device_id, 'login')
    except OAuthError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    return OAuthStartResponse(authorization_url=started.authorization_url)


@router.post(
    '/oauth/{provider}/link/start',
    response_model=OAuthStartResponse,
    dependencies=[Depends(enforce_sensitive_auth_rate_limit)],
)
async def oauth_link_start(
    provider: str,
    request: OAuthStartRequest,
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> OAuthStartResponse:
    if provider not in {'vk', 'yandex'}:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='OAuth provider not found')
    try:
        started = await start_oauth(session, provider, request.device_id, 'link', current_user.id)
    except OAuthError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    return OAuthStartResponse(authorization_url=started.authorization_url)


@router.get(
    '/oauth/{provider}/callback',
    include_in_schema=False,
    dependencies=[Depends(enforce_sensitive_auth_rate_limit)],
)
async def oauth_callback(
    provider: str,
    session: Annotated[AsyncSession, Depends(get_db_session)],
    code: str | None = Query(default=None),
    state_value: str | None = Query(default=None, alias='state'),
    device_id: str | None = Query(default=None),
) -> RedirectResponse:
    if provider not in {'vk', 'yandex'}:
        return RedirectResponse(callback_redirect_url(error='provider_not_found'), status_code=status.HTTP_303_SEE_OTHER)
    try:
        result_token = await finish_oauth_callback(session, provider, code, state_value, device_id)
    except OAuthError:
        return RedirectResponse(callback_redirect_url(error='oauth_failed'), status_code=status.HTTP_303_SEE_OTHER)
    return RedirectResponse(callback_redirect_url(result_token=result_token), status_code=status.HTTP_303_SEE_OTHER)


@router.post(
    '/oauth/login/complete',
    response_model=OAuthCompleteResponse,
    dependencies=[Depends(enforce_sensitive_auth_rate_limit)],
)
async def oauth_login_complete(
    request: OAuthCompleteRequest,
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> OAuthCompleteResponse:
    try:
        user, access_token, refresh_token = await oauth_login_result(session, request.result_token, request.device_id)
    except OAuthError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return OAuthCompleteResponse(status='authenticated', user=user, access_token=access_token, refresh_token=refresh_token)


@router.post(
    '/oauth/link/complete',
    response_model=OAuthCompleteResponse,
    dependencies=[Depends(enforce_sensitive_auth_rate_limit)],
)
async def oauth_link_complete(
    request: OAuthCompleteRequest,
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> OAuthCompleteResponse:
    try:
        completion = await oauth_link_result(session, request.result_token, current_user.id, request.device_id)
    except OAuthError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return OAuthCompleteResponse(status=completion.status)


@router.post(
    '/email/change/start',
    response_model=EmailChangeStartResponse,
    dependencies=[Depends(enforce_sensitive_auth_rate_limit)],
)
async def email_change_start(
    request: EmailChangeStartRequest,
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> EmailChangeStartResponse:
    try:
        started = await start_email_change(session, current_user.id, request.current_password, request.email, request.device_id)
    except SmtpDeliveryError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except AuthError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return EmailChangeStartResponse(verification_id=started.verification.id, expires_in_seconds=EMAIL_VERIFICATION_TTL_MINUTES * 60)


@router.post(
    '/email/change/confirm',
    response_model=UserOut,
    dependencies=[Depends(enforce_sensitive_auth_rate_limit)],
)
async def email_change_confirm(
    request: EmailChangeConfirmRequest,
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> UserOut:
    try:
        return await confirm_email_change(
            session,
            current_user.id,
            request.verification_id,
            request.code,
            request.device_id,
        )
    except AuthError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post('/login', response_model=TokenPairResponse, dependencies=[Depends(enforce_sensitive_auth_rate_limit)])
async def login(
    request: LoginRequest,
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> TokenPairResponse:
    identifier = request.identifier or request.email or request.nexus_id
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


@router.post('/refresh', response_model=TokenPairResponse, dependencies=[Depends(enforce_sensitive_auth_rate_limit)])
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


@router.post('/legal-documents/accept', response_model=UserOut)
async def accept_current_legal_documents(
    request: LegalDocumentsAcceptRequest,
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> UserOut:
    if not request.accepted_terms or not request.accepted_privacy_policy:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail='Для продолжения нужно принять Политику конфиденциальности и Пользовательское соглашение',
        )
    try:
        return await accept_legal_documents(session, current_user.id)
    except AuthError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


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
