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

    async def connect_user(self, websocket: WebSocket, user_id: UUID) -> bool:
        was_offline = not self._user_connections.get(user_id)
        self._user_connections[user_id].add(websocket)
        self._connection_users[websocket] = user_id
        return was_offline

    def is_user_online(self, user_id: UUID) -> bool:
        return bool(self._user_connections.get(user_id))

    async def subscribe(self, websocket: WebSocket, chat_id: UUID) -> None:
        self._chat_connections[chat_id].add(websocket)
        self._connection_chats[websocket].add(chat_id)

    async def unsubscribe(self, websocket: WebSocket, chat_id: UUID) -> None:
        self._chat_connections[chat_id].discard(websocket)
        self._connection_chats[websocket].discard(chat_id)
        if not self._chat_connections[chat_id]:
            self._chat_connections.pop(chat_id, None)

    async def unsubscribe_users_from_chats(self, user_ids: set[UUID], chat_ids: list[UUID]) -> None:
        if not chat_ids:
            return
        chat_id_set = set(chat_ids)
        for user_id in user_ids:
            for websocket in list(self._user_connections.get(user_id, set())):
                for chat_id in self._connection_chats.get(websocket, set()) & chat_id_set:
                    await self.unsubscribe(websocket, chat_id)

    async def disconnect(self, websocket: WebSocket) -> tuple[UUID | None, bool]:
        for chat_id in list(self._connection_chats.get(websocket, set())):
            await self.unsubscribe(websocket, chat_id)
        self._connection_chats.pop(websocket, None)
        user_id = self._connection_users.pop(websocket, None)
        went_offline = False
        if user_id:
            self._user_connections[user_id].discard(websocket)
            if not self._user_connections[user_id]:
                self._user_connections.pop(user_id, None)
                went_offline = True
        return user_id, went_offline

    async def broadcast_to_chat(self, chat_id: UUID, payload: dict, *, exclude_user_id: UUID | None = None) -> None:
        stale_connections: list[WebSocket] = []
        for websocket in list(self._chat_connections.get(chat_id, set())):
            if exclude_user_id and self._connection_users.get(websocket) == exclude_user_id:
                continue
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

    async def disconnect_user(self, user_id: UUID, code: int = 1008) -> None:
        for websocket in list(self._user_connections.get(user_id, set())):
            try:
                await websocket.close(code=code)
            except (RuntimeError, WebSocketDisconnect):
                pass
            await self.disconnect(websocket)


realtime_manager = RealtimeManager()
