# Закрытые групповые чаты: контракт API

Группа — это самостоятельный тип чата `type: "group"`. Все группы закрыты
(`is_private: true`): получать группу, её сообщения и список участников могут
только её участники. Контракт доступен также в автоматически сгенерированной
OpenAPI-схеме сервера (`/openapi.json`).

## Роли

- `owner` — изменяет профиль группы, меняет роли, передаёт владение и удаляет
  группу;
- `admin` — добавляет и удаляет участников, создаёт и отзывает ссылки;
- `member` — пишет сообщения и может выйти самостоятельно.

Владелец не может покинуть группу до передачи владения. Владелец не может быть
удалён. Смена роли владельца выполняется только через отдельный маршрут
передачи владения.

## HTTP API

Все маршруты требуют обычный токен авторизации.

| Метод | Маршрут | Назначение |
| --- | --- | --- |
| `POST` | `/api/chats/groups` | Создать группу. Тело: `title`, `description`, `avatar_ref`, `member_user_ids`. Возвращает `{ chat }`. |
| `POST` | `/api/chats/groups/join` | Вступить по ссылке. Тело: `invite_token`. Возвращает `ChatOut`. |
| `PATCH` | `/api/chats/groups/{chat_id}` | Изменить профиль группы владельцем. |
| `DELETE` | `/api/chats/groups/{chat_id}` | Безвозвратно удалить группу владельцем. |
| `POST` | `/api/chats/groups/{chat_id}/leave` | Выйти из группы. |
| `GET` | `/api/chats/groups/{chat_id}/members` | Получить участников. |
| `POST` | `/api/chats/groups/{chat_id}/members` | Добавить участника: `{ user_id }`. |
| `PATCH` | `/api/chats/groups/{chat_id}/members/{member_user_id}` | Назначить `admin` или `member` владельцем: `{ role }`. |
| `DELETE` | `/api/chats/groups/{chat_id}/members/{member_user_id}` | Удалить участника. |
| `POST` | `/api/chats/groups/{chat_id}/ownership` | Передать владение: `{ user_id }`. |
| `GET` | `/api/chats/groups/{chat_id}/invite` | Проверить активность ссылки. |
| `POST` | `/api/chats/groups/{chat_id}/invite` | Создать или перевыпустить ссылку. |
| `DELETE` | `/api/chats/groups/{chat_id}/invite` | Отозвать ссылку. |

Ссылки имеют вид `arachat://group-invite/{invite_token}`. Участники для
создания и добавления выбираются через существующий публичный поиск
`GET /api/users/search`.

## Системные сообщения

События жизненного цикла группы сохраняются в истории с `type: "system"`.
`payload` — JSON, не локализованная строка:

```json
{
  "version": 1,
  "action": "member_added",
  "data": {
    "member": {
      "user_id": "uuid",
      "display_name": "Имя"
    }
  }
}
```

Поддерживаемые действия: `group_created`, `member_added`, `member_joined`,
`member_left`, `member_removed`, `member_role_changed`,
`ownership_transferred`. Клиенты должны локализовать их самостоятельно и
безопасно обрабатывать неизвестные будущие действия.

## Realtime

Групповые полезные нагрузки приходят в основной WebSocket пользователя. Все
они содержат `chat_id`; для действующих участников, когда это применимо,
содержат актуальный `chat` и системное `message`.

- `group.created`
- `group.updated`
- `group.member_added`
- `group.member_joined`
- `group.member_left`
- `group.member_removed`
- `group.member_role_changed`
- `group.ownership_transferred`
- `group.deleted`

После `group.member_left`, `group.member_removed` или `group.deleted` клиент
должен убрать группу из локального списка, закрыть её экран при необходимости
и отменить подписку `chat.subscribe`. Сервер дополнительно отзывает такую
подписку принудительно.
