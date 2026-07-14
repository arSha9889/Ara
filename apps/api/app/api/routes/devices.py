from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.auth import get_current_user
from app.db.session import get_db_session
from app.schemas.devices import DeviceOut, LoginHistoryOut
from app.schemas.users import UserOut
from app.services.device_service import list_devices as list_user_devices, list_login_history, revoke_device

router = APIRouter()


@router.get('/devices')
async def list_devices(
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> list[DeviceOut]:
    return await list_user_devices(session, current_user.id)


@router.delete('/devices/{device_id}')
async def delete_device(
    device_id: str,
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> dict[str, str]:
    await revoke_device(session, current_user.id, device_id)
    return {'status': 'ok'}


@router.get('/login-history')
async def login_history(
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> list[LoginHistoryOut]:
    return await list_login_history(session, current_user.id)
