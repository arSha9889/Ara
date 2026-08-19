from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.dependencies.auth import get_current_user
from app.schemas.calls import CallIceConfigurationOut
from app.schemas.users import UserOut
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
