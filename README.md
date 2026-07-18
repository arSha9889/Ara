# Nexus / N-Web v1

Рабочий репозиторий для реализации Web Core проекта Nexus (Nex).

## Этапы реализации

### Этап 1 — базовый каркас Web Core

Цель: поднять минимально рабочую структуру фронтенда и бэкенда по архитектуре из `plans/`, не реализуя преждевременно сложную бизнес-логику.

Входит:

- монорепозиторий с `apps/web` и `apps/api`;
- React + JavaScript фронтенд;
- базовый routing;
- i18n RU/EN;
- дизайн-токены Nexus Halo, Nexus Orbit, Nexus Aurora;
- стартовый набор UI-компонентов;
- экраны-заготовки onboarding/auth/app shell/chats/profile/settings;
- HTTP API client и WebSocket client на фронтенде;
- FastAPI-приложение с health endpoint и контрактными роутерами Web Core.

Не входит:

- PostgreSQL/Redis;
- полноценная авторизация;
- Telegram-бот подтверждения телефона;
- хранение сессий и сообщений;
- WebSocket-бизнес-логика.

### Этап 2 — backend domain foundation

Статус: базовая реализация готова.

Входит:

- расширенная конфигурация FastAPI через `NEXUS_*` переменные окружения;
- async SQLAlchemy engine/session;
- Redis client;
- health endpoint для инфраструктуры;
- SQLAlchemy-модели Web Core;
- Alembic-конфигурация и первая миграция;
- генерация и форматирование Nexus ID;
- validation rules для username, password и PIN;
- генерация и форматирование recovery code;
- Argon2-хеширование секретов;
- минимальные backend-тесты доменных правил и регистрации моделей.

### Этап 3 — auth/onboarding flow

Статус: рабочий baseline реализован и покрыт сервисным интеграционным сценарием.

Входит:

- регистрация через подтверждение телефона в Telegram-боте;
- registration proof после подтверждения 4-значного кода из бота;
- завершение регистрации с username, password, optional PIN, language и theme;
- выдача уникального Nexus ID;
- генерация recovery code и хранение только его хеша;
- создание password credential, trusted PIN device и session;
- login по телефону + password;
- JWT access token;
- refresh token с серверным Argon2-хешем и отдельным lookup hash;
- logout по refresh token;
- `/api/auth/me` по Bearer token;
- frontend auth API client;
- frontend session state с восстановлением через refresh token;
- protected routes для `/app`;
- logout из app shell;
- экран завершения регистрации под proof от Telegram-бота;
- проверка username на экране регистрации;
- подключённый login form;
- восстановление доступа по Nexus ID + recovery code со сбросом пароля;
- регенерация recovery code из настроек после подтверждения текущего пароля;
- быстрый вход по PIN на доверенном устройстве по телефону;
- создание, замена и отключение PIN для текущего устройства.

Ограничение этапа: для реальной регистрации нужен настроенный Telegram-бот (`NEXUS_TELEGRAM_BOT_TOKEN`, `NEXUS_TELEGRAM_BOT_NAME`) и webhook `/api/auth/telegram/webhook`. Временный endpoint `POST /api/auth/dev/registration-proof` доступен только при `NEXUS_ENVIRONMENT=dev`, скрыт из OpenAPI и dev-кнопка не попадает в production build.

### Этап 4 — profile/settings/devices

Статус: рабочий baseline реализован.

Входит:

- authenticated `/api/users/me`;
- обновление профиля: display name, optional phone, phone visibility, language, theme;
- поиск пользователя по Nexus ID / username;
- проверка и смена username;
- список активных устройств;
- отзыв сессии устройства;
- история входов;
- frontend profile page с сохранением профиля и username;
- frontend settings page со списком устройств и историей входов;
- синхронизация language/theme между backend profile, frontend providers и Settings UI.

Ограничение этапа: расширенные настройки приватности, avatar picker и детальная security UX-валидация остаются на стабилизацию.

### Этап 5 — chats/messages/realtime

Статус: рабочий baseline реализован.

Входит:

- authenticated список чатов;
- создание или получение direct-чата по Nexus ID / username;
- получение одного чата;
- список последних сообщений чата;
- отправка текстового сообщения;
- хранение сообщений как Web Core baseline `plain_web_core` без E2EE;
- frontend chat list с созданием direct-чата;
- frontend chat page с загрузкой и отправкой сообщений;
- WebSocket `/ws`:
  - `connection.authenticated` / `connection.rejected`;
- `ping` -> `pong`;
- `chat.subscribe` / `chat.unsubscribe` с проверкой участия в чате;
- in-memory fan-out события `message.created` для подписанных клиентов одного backend-процесса;
- `error.unauthorized` и `error.validation_failed`.
- frontend reconnect после обрыва WebSocket с повторной подпиской на чат и загрузкой истории.

Ограничение этапа: realtime fan-out сейчас in-memory и подходит для dev/single-process baseline. Redis pub/sub, presence, ack/retry, delivery/read states и масштабирование на несколько backend-инстансов остаются задачами следующей стабилизации.

### Веха Web Communication — direct communication расширение

Статус: первый рабочий baseline реализован без групповых чатов и каналов.

Входит:

- типы сообщений `text`, `photo`, `video`, `voice`, `file`, `emoji`;
- metadata для фото/видео/voice: `media_url`, имя, mime type, размер, длительность;
- authenticated upload endpoint `POST /api/uploads` для файлов и медиа;
- local filesystem storage baseline в `apps/api/storage/uploads` с раздачей через `/storage/uploads/...`;
- allow-list MIME типов, лимит размера 100 МБ и базовая проверка сигнатуры содержимого файла;
- отправка фото/видео/voice из загруженных storage-файлов;
- голосовая запись в браузере через `MediaRecorder` с отправкой записанного audio blob;
- generic file-сообщения для поддерживаемых документов (`pdf`, `txt`) и медиа-файлов;
- быстрые emoji-сообщения;
- реакции на сообщения ограниченным набором emoji;
- таблица `message_reactions`;
- таблица `message_receipts`;
- базовые статусы сообщений: `sent`, `delivered`, `read`, `received`;
- read receipt endpoint;
- realtime события `message.reactions_updated`, `message.read`, `typing.started`, `typing.stopped`, `presence.active`;
- frontend composer для text/photo/video/voice/emoji;
- frontend отображение медиа, файлов, voice-player, реакций, статуса доставки и активности собеседника.
- PWA manifest, базовая app icon и mobile install metadata.

Ограничения вехи:

- групповые чаты и каналы намеренно не входят в эту веху;
- storage сейчас локальный dev/single-instance baseline, не production object storage;
- загруженные файлы раздаются публичным static URL без private ACL/signature links;
- realtime остаётся in-memory single-process baseline;
- delivery/read statuses базовые и будут расширяться перед production.

### MVP-A — демонстрационный web MVP без звонков

Статус: baseline готов к smoke-проверке в локальном/стейджинг окружении.

Входит:

- Telegram registration/login baseline;
- Nexus ID + password login;
- recovery code reset password flow;
- PIN login на доверенном устройстве;
- direct chats;
- text/photo/video/file/voice/emoji messages;
- reactions, typing/presence baseline, read status baseline;
- profile/settings/devices/login history;
- PWA manifest и базовый mobile polish;
- upload validation и лимит 100 МБ;
- WebSocket reconnect на frontend.

### Веха Web Push — уведомления

Статус: реализован полноценный контур уведомлений для Web/PWA.

Входит:

- центр уведомлений с непрочитанным счётчиком, историей и переходом к сообщению;
- realtime-доставка событий в открытое приложение через WebSocket;
- сохранение уведомлений на сервере и отметка прочитанными;
- Web Push-подписка браузера, Service Worker и открытие нужного чата по клику;
- VAPID-авторизация, автоматическое удаление истёкших push-подписок;
- управление подпиской в профиле и настройках, очистка подписки при выходе.

Для фоновой доставки заполните `NEXUS_VAPID_PRIVATE_KEY`,
`NEXUS_VAPID_PUBLIC_KEY` и `NEXUS_VAPID_CLAIMS_EMAIL` в `apps/api/.env` по примеру
из `apps/api/.env.example`. Web Push требует HTTPS в production (исключение — localhost).

Не входит в MVP-A:

- аудиозвонки;
- демонстрация экрана;
- групповые чаты и каналы;
- production object storage с private ACL/signed links;
- Redis pub/sub fan-out для нескольких backend-инстансов;
- Telegram recovery bot ручной процедуры.

Минимальный smoke-check перед показом:

1. `npm run build:web`.
2. `cd apps/api && .venv/bin/pytest`.
3. `cd apps/api && .venv/bin/alembic upgrade head` на целевой базе.
4. Проверить `/health` и `/health/infrastructure`.
5. Зарегистрировать двух пользователей через Telegram/dev-flow в dev.
6. Проверить login по Nexus ID + password.
7. Проверить recovery reset password и новый recovery code.
8. Проверить создание PIN, выход и вход по PIN на том же устройстве.
9. Создать direct chat по username/Nexus ID.
10. Отправить text/photo/file/voice/emoji, реакцию и read status в двух вкладках.
11. Обновить страницу чата и убедиться, что история и WebSocket reconnect работают.
12. Открыть приложение на mobile width и проверить manifest/installability в браузере.

### Этап 6 — стабилизация Web Core

Тесты, accessibility, PWA polish, безопасность, подготовка к следующей функциональной вехе.

## Команды

```bash
npm install
npm run dev:web
npm run build:web

python3 -m venv apps/api/.venv
source apps/api/.venv/bin/activate
pip install -r apps/api/requirements.txt
uvicorn app.main:app --app-dir apps/api --reload

cd apps/api
cp .env.example .env
.venv/bin/alembic upgrade head
.venv/bin/pytest

# Optional service integration tests against a disposable DB:
NEXUS_TEST_DATABASE_URL=postgresql+asyncpg://nexus:nexus@localhost:5433/nexus_test .venv/bin/pytest tests/test_services_integration.py
```

## Архитектурные источники

- `plans/architecture.md`
- `plans/web-core-design.md`
- `plans/ui-kit-and-screens.md`
