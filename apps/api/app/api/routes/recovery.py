from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.auth import get_current_user
from app.db.session import get_db_session
from app.schemas.recovery import (
    PasswordResetRequest,
    PasswordResetResponse,
    RecoveryCodeRegenerateRequest,
    RecoveryCodeRegenerateResponse,
    RecoveryCodeVerifyRequest,
    RecoveryCodeVerifyResponse,
)
from app.schemas.users import UserOut
from app.services.recovery_service import (
    RecoveryError,
    regenerate_recovery_code_for_user,
    reset_password_with_recovery_code,
    verify_recovery_code_for_user,
)

router = APIRouter()


@router.post('/code/verify', response_model=RecoveryCodeVerifyResponse)
async def verify_recovery_code(
    request: RecoveryCodeVerifyRequest,
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> RecoveryCodeVerifyResponse:
    try:
        await verify_recovery_code_for_user(session, request.nexus_id, request.recovery_code)
    except RecoveryError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return RecoveryCodeVerifyResponse(valid=True)


@router.post('/code/regenerate', response_model=RecoveryCodeRegenerateResponse)
async def regenerate_recovery_code(
    request: RecoveryCodeRegenerateRequest,
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> RecoveryCodeRegenerateResponse:
    try:
        recovery_code = await regenerate_recovery_code_for_user(session, current_user.id, request.current_password)
    except RecoveryError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return RecoveryCodeRegenerateResponse(recovery_code=recovery_code)


@router.post('/password/reset', response_model=PasswordResetResponse)
async def reset_password(
    request: PasswordResetRequest,
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> PasswordResetResponse:
    try:
        user, access_token, refresh_token, recovery_code = await reset_password_with_recovery_code(session, request)
    except RecoveryError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return PasswordResetResponse(
        user=user,
        access_token=access_token,
        refresh_token=refresh_token,
        recovery_code=recovery_code,
    )


@router.post('/telegram-bot/webhook')
async def telegram_bot_webhook() -> None:
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail='Telegram recovery bot webhook is outside MVP-A recovery baseline.',
    )
