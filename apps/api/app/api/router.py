from fastapi import APIRouter

from app.api.routes import admin, auth, chats, devices, notifications, security, uploads, users

api_router = APIRouter()
api_router.include_router(auth.router, prefix='/auth', tags=['auth'])
api_router.include_router(admin.router, prefix='/admin', tags=['admin'])
api_router.include_router(security.router, prefix='/security', tags=['security'])
api_router.include_router(users.router, prefix='/users', tags=['users'])
api_router.include_router(devices.router, tags=['devices'])
api_router.include_router(chats.router, prefix='/chats', tags=['chats'])
api_router.include_router(notifications.router, prefix='/notifications', tags=['notifications'])
api_router.include_router(uploads.router, prefix='/uploads', tags=['uploads'])
