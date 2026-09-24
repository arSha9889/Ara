from fastapi import APIRouter

from app.api.routes import admin, auth, calls, chats, devices, media, news, notifications, safety, security, support, uploads, users

api_router = APIRouter()
api_router.include_router(auth.router, prefix='/auth', tags=['auth'])
api_router.include_router(admin.router, prefix='/admin', tags=['admin'])
api_router.include_router(security.router, prefix='/security', tags=['security'])
api_router.include_router(safety.router, prefix='/safety', tags=['safety'])
api_router.include_router(users.router, prefix='/users', tags=['users'])
api_router.include_router(devices.router, tags=['devices'])
api_router.include_router(calls.router, prefix='/calls', tags=['calls'])
api_router.include_router(chats.router, prefix='/chats', tags=['chats'])
api_router.include_router(news.router, prefix='/news', tags=['news'])
api_router.include_router(notifications.router, prefix='/notifications', tags=['notifications'])
api_router.include_router(support.router, prefix='/support', tags=['support'])
api_router.include_router(uploads.router, prefix='/uploads', tags=['uploads'])
api_router.include_router(media.router, prefix='/media', tags=['media'])
