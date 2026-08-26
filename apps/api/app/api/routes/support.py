from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.auth import get_current_user
from app.api.routes._responses import domain_error_response
from app.db.session import get_db_session
from app.schemas.support import (
    AdminSupportMessageCreateRequest,
    AdminSupportTicketListOut,
    SupportMessageCreateRequest,
    SupportTicketCreateRequest,
    SupportTicketDetailOut,
    SupportTicketOut,
    SupportTicketUpdateRequest,
)
from app.schemas.users import UserOut
from app.services.admin_service import AdminError
from app.services.support_service import (
    SupportError,
    add_admin_message,
    add_user_message,
    create_ticket,
    get_admin_ticket,
    get_user_ticket,
    list_admin_tickets,
    list_user_tickets,
    update_ticket_status,
)

router = APIRouter()


@router.get('', response_model=list[SupportTicketOut])
async def get_my_support_tickets(
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> list[SupportTicketOut]:
    return await list_user_tickets(session, current_user.id)


@router.post('', response_model=SupportTicketDetailOut, status_code=status.HTTP_201_CREATED)
async def create_support_ticket(
    request: SupportTicketCreateRequest,
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> SupportTicketDetailOut:
    try:
        return await create_ticket(session, current_user.id, request)
    except SupportError as exc:
        return domain_error_response(exc, status.HTTP_400_BAD_REQUEST)


@router.get('/admin/tickets', response_model=AdminSupportTicketListOut)
async def get_admin_support_tickets(
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    ticket_status: str | None = Query(default=None, alias='status'),
) -> AdminSupportTicketListOut:
    try:
        return AdminSupportTicketListOut(tickets=await list_admin_tickets(session, current_user.id, ticket_status))
    except (SupportError, AdminError) as exc:
        return domain_error_response(exc, status.HTTP_403_FORBIDDEN)


@router.get('/admin/tickets/{ticket_id}', response_model=SupportTicketDetailOut)
async def get_admin_support_ticket(
    ticket_id: UUID,
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> SupportTicketDetailOut:
    try:
        return await get_admin_ticket(session, current_user.id, ticket_id)
    except (SupportError, AdminError) as exc:
        return domain_error_response(exc, status.HTTP_403_FORBIDDEN)


@router.post('/admin/tickets/{ticket_id}/messages', response_model=SupportTicketDetailOut)
async def create_admin_support_message(
    ticket_id: UUID,
    request: AdminSupportMessageCreateRequest,
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> SupportTicketDetailOut:
    try:
        return await add_admin_message(session, current_user.id, ticket_id, request)
    except (SupportError, AdminError) as exc:
        return domain_error_response(exc, status.HTTP_400_BAD_REQUEST)


@router.patch('/admin/tickets/{ticket_id}', response_model=SupportTicketDetailOut)
async def patch_admin_support_ticket(
    ticket_id: UUID,
    request: SupportTicketUpdateRequest,
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> SupportTicketDetailOut:
    try:
        return await update_ticket_status(session, current_user.id, ticket_id, request.status)
    except (SupportError, AdminError) as exc:
        return domain_error_response(exc, status.HTTP_400_BAD_REQUEST)


@router.get('/{ticket_id}', response_model=SupportTicketDetailOut)
async def get_support_ticket(
    ticket_id: UUID,
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> SupportTicketDetailOut:
    try:
        return await get_user_ticket(session, current_user.id, ticket_id)
    except SupportError as exc:
        return domain_error_response(exc, status.HTTP_404_NOT_FOUND)


@router.post('/{ticket_id}/messages', response_model=SupportTicketDetailOut)
async def create_support_message(
    ticket_id: UUID,
    request: SupportMessageCreateRequest,
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> SupportTicketDetailOut:
    try:
        return await add_user_message(session, current_user.id, ticket_id, request)
    except SupportError as exc:
        return domain_error_response(exc, status.HTTP_400_BAD_REQUEST)
