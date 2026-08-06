from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.auth import get_current_user
from app.db.session import get_db_session
from app.schemas.security import PinCreateRequest, PinLoginRequest, PinLoginResponse, PinResetRequest
from app.schemas.users import UserOut
from app.services.security_service import (
    SecurityError,
    create_or_replace_pin,
    login_with_pin,
    reset_pin as reset_user_pin,
    revoke_pin_device,
)

router = APIRouter()


@router.post('/pin/create')
async def create_pin(
    request: PinCreateRequest,
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> dict[str, str]:
    try:
        await create_or_replace_pin(session, current_user.id, request.current_password, request.pin, request.device_id)
    except SecurityError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return {'status': 'ok'}


@router.post('/pin/login', response_model=PinLoginResponse)
async def pin_login(
    request: PinLoginRequest,
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> PinLoginResponse:
    identifier = request.identifier or request.email or request.nexus_id
    if not identifier:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='Login identifier is required')
    try:
        user, access_token, refresh_token = await login_with_pin(session, identifier, request.pin, request.device_id)
    except SecurityError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc
    return PinLoginResponse(user=user, access_token=access_token, refresh_token=refresh_token)


@router.post('/pin/reset')
async def reset_pin(
    request: PinResetRequest,
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> dict[str, str]:
    try:
        await reset_user_pin(session, current_user.id, request.current_password, request.device_id, request.pin)
    except SecurityError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return {'status': 'ok'}


@router.delete('/pin/devices/{device_id}')
async def delete_pin_device(
    device_id: str,
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> dict[str, str]:
    await revoke_pin_device(session, current_user.id, device_id)
    return {'status': 'ok'}
