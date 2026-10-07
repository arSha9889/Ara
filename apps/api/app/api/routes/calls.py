from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.auth import get_current_user
from app.db.session import get_db_session
from app.schemas.calls import CallHistoryItemOut, CallIceConfigurationOut
from app.schemas.users import UserOut
from app.services.call_history_service import list_call_history
from app.services.turn_credentials import TurnConfigurationError, get_turn_ice_configuration

router = APIRouter()


@router.get('/ice-servers', response_model=CallIceConfigurationOut)
async def get_ice_servers(
    current_user: Annotated[UserOut, Depends(get_current_user)],
) -> CallIceConfigurationOut:
    try:
        return CallIceConfigurationOut.model_validate(get_turn_ice_configuration(current_user.id))
    except TurnConfigurationError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc


@router.get('/history', response_model=list[CallHistoryItemOut])
async def get_call_history(
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    limit: int = Query(default=100, ge=1, le=100),
) -> list[CallHistoryItemOut]:
    return await list_call_history(session, current_user.id, limit)
