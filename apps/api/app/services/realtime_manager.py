from collections import defaultdict
from uuid import UUID

from fastapi import WebSocket
from starlette.websockets import WebSocketDisconnect


class RealtimeManager:
    def __init__(self) -> None:
        self._chat_connections: dict[UUID, set[WebSocket]] = defaultdict(set)
        self._connection_chats: dict[WebSocket, set[UUID]] = defaultdict(set)
        self._user_connections: dict[UUID, set[WebSocket]] = defaultdict(set)
        self._connection_users: dict[WebSocket, UUID] = {}

    async def connect_user(self, websocket: WebSocket, user_id: UUID) -> None:
        self._user_connections[user_id].add(websocket)
        self._connection_users[websocket] = user_id

    async def subscribe(self, websocket: WebSocket, chat_id: UUID) -> None:
        self._chat_connections[chat_id].add(websocket)
        self._connection_chats[websocket].add(chat_id)

    async def unsubscribe(self, websocket: WebSocket, chat_id: UUID) -> None:
        self._chat_connections[chat_id].discard(websocket)
        self._connection_chats[websocket].discard(chat_id)
        if not self._chat_connections[chat_id]:
            self._chat_connections.pop(chat_id, None)

    async def disconnect(self, websocket: WebSocket) -> None:
        for chat_id in list(self._connection_chats.get(websocket, set())):
            await self.unsubscribe(websocket, chat_id)
        self._connection_chats.pop(websocket, None)
        user_id = self._connection_users.pop(websocket, None)
        if user_id:
            self._user_connections[user_id].discard(websocket)
            if not self._user_connections[user_id]:
                self._user_connections.pop(user_id, None)

    async def broadcast_to_chat(self, chat_id: UUID, payload: dict) -> None:
        stale_connections: list[WebSocket] = []
        for websocket in list(self._chat_connections.get(chat_id, set())):
            try:
                await websocket.send_json(payload)
            except (RuntimeError, WebSocketDisconnect):
                stale_connections.append(websocket)

        for websocket in stale_connections:
            await self.disconnect(websocket)

    async def broadcast_to_user(self, user_id: UUID, payload: dict) -> None:
        stale_connections: list[WebSocket] = []
        for websocket in list(self._user_connections.get(user_id, set())):
            try:
                await websocket.send_json(payload)
            except (RuntimeError, WebSocketDisconnect):
                stale_connections.append(websocket)

        for websocket in stale_connections:
            await self.disconnect(websocket)


realtime_manager = RealtimeManager()
