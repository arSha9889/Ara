from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.domain.tokens import decode_access_token
from app.services.auth_service import get_user_with_profile, is_access_token_session_active, to_user_out
from app.services.user_access_service import user_can_access
from app.schemas.users import UserOut

bearer_scheme = HTTPBearer(auto_error=True)


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(bearer_scheme)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> UserOut:
    try:
        claims = decode_access_token(credentials.credentials)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Invalid access token') from exc

    if not await is_access_token_session_active(session, claims):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Session is no longer active')

    user = await get_user_with_profile(session, claims.user_id)
    if not await user_can_access(session, user):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='User not found')
    return to_user_out(user)
