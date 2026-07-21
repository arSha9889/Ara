# Production deployment: домен reg.ru и российский сервер

Проект уже готовится к варианту, где пользователь открывает один публичный домен, например `https://nexus.example.ru`, а внутри сервера работают:

- `web` — React/Vite-приложение в Nginx-контейнере;
- `api` — FastAPI-приложение;
- `postgres` — основная база данных;
- `redis` — инфраструктурный Redis для текущего контура и будущего масштабирования realtime;
- `turn` — coturn для стабильных WebRTC-звонков за NAT;
- `caddy` — внешний reverse proxy с автоматическим HTTPS от Let's Encrypt.

В этом варианте фронтенд, API, WebSocket и загруженные файлы находятся на одном домене:

- `https://<домен>/` — сайт;
- `https://<домен>/api/...` — API;
- `wss://<домен>/ws` — realtime WebSocket;
- `https://<домен>/storage/uploads/...` — текущая раздача загруженных файлов.

Такой same-origin деплой проще и надёжнее для MVP: браузеру не нужны отдельные публичные API-домены, CORS становится менее хрупким, а Web Push работает через HTTPS.

## 1. Что нужно от хостинга

Минимально желательно:

- VPS/выделенный сервер с Linux;
- root-доступ или пользователь с `sudo`;
- открытые входящие порты `80` и `443`;
- Docker и Docker Compose v2;
- 2+ ГБ RAM для комфортного baseline-запуска;
- постоянный диск под PostgreSQL и загрузки пользователей.

Для аудиозвонков и демонстрации экрана также откройте на firewall/security group:

- `3478/udp` и `3478/tcp` — TURN/STUN;
- UDP-диапазон `49160-49200` — relay-порты coturn из production-конфига.

Если хостинг окажется не VPS, а панельным/shared-хостингом без Docker, схема будет другой. Тогда нужно будет адаптировать запуск под конкретную панель.

## 2. DNS в reg.ru

В панели reg.ru для домена создайте запись:

```text
Тип: A
Имя: @
Значение: <публичный IPv4 сервера>
TTL: по умолчанию
```

Если нужен `www`, добавьте ещё одну запись:

```text
Тип: CNAME
Имя: www
Значение: <ваш-домен>.
```

Важно: HTTPS-сертификат выпустится только после того, как DNS уже указывает на сервер и порты `80/443` доступны извне.

## 3. Файлы деплоя в репозитории

Добавлены production-шаблоны:

- `deploy/compose.production.yml` — Docker Compose для `postgres`, `redis`, `api`, `web`, `turn`, `caddy`;
- `deploy/Caddyfile` — публичный HTTPS reverse proxy;
- `deploy/production.env.example` — шаблон переменных окружения для сервера.

Секретный файл на сервере должен называться `deploy/production.env`. Его нельзя коммитить в Git.

## 4. Подготовка сервера

На сервере установите Docker и Compose по инструкции вашего хостинга/дистрибутива. Затем получите код проекта, например через Git:

```bash
git clone <URL_ВАШЕГО_РЕПОЗИТОРИЯ> nexus
cd nexus
```

Создайте production env:

```bash
cp deploy/production.env.example deploy/production.env
nano deploy/production.env
```

В `deploy/production.env` обязательно заменить:

```dotenv
NEXUS_PUBLIC_DOMAIN=<ваш-домен>
NEXUS_ACME_EMAIL=<ваш-email>
NEXUS_POSTGRES_PASSWORD=<длинный-случайный-пароль>
NEXUS_ALLOWED_ORIGINS=["https://<ваш-домен>"]
NEXUS_STORAGE_PUBLIC_BASE_URL=https://<ваш-домен>
NEXUS_REGISTRATION_PROOF_SECRET=<длинная-случайная-строка>
NEXUS_ACCESS_TOKEN_SECRET=<длинная-случайная-строка>
NEXUS_TELEGRAM_BOT_TOKEN=<токен-бота>
NEXUS_TELEGRAM_BOT_NAME=<username-бота-без-@>
NEXUS_TELEGRAM_WEBHOOK_SECRET=<длинная-случайная-строка>
NEXUS_EARLY_ACCESS_BYPASS_LIMIT=100
NEXUS_TURN_REALM=<ваш-домен>
NEXUS_TURN_EXTERNAL_IP=<публичный-IPv4-сервера>
NEXUS_TURN_USERNAME=<turn-логин>
NEXUS_TURN_PASSWORD=<длинный-случайный-turn-пароль>
VITE_RTC_ICE_SERVERS=[{"urls":["stun:<ваш-домен>:3478","turn:<ваш-домен>:3478?transport=udp","turn:<ваш-домен>:3478?transport=tcp"],"username":"<turn-логин>","credential":"<turn-пароль>"}]
```

`NEXUS_EARLY_ACCESS_BYPASS_LIMIT=100` ограничивает регистрацию закрытой беты первыми 100 активными аккаунтами. Значение `0` отключает лимит.

Секреты можно сгенерировать так:

```bash
openssl rand -hex 32
```

## 5. Первый запуск

Из корня проекта:

```bash
docker compose --env-file deploy/production.env -f deploy/compose.production.yml up -d --build
```

Что произойдёт:

1. поднимется PostgreSQL;
2. поднимется Redis;
3. API применит Alembic-миграции и запустит FastAPI;
4. web соберёт React-приложение и запустит Nginx;
5. coturn начнёт принимать TURN/STUN-трафик;
6. Caddy выпустит HTTPS-сертификат и начнёт принимать внешний трафик.

Проверка статуса:

```bash
docker compose --env-file deploy/production.env -f deploy/compose.production.yml ps
docker compose --env-file deploy/production.env -f deploy/compose.production.yml logs -f caddy
docker compose --env-file deploy/production.env -f deploy/compose.production.yml logs -f api
docker compose --env-file deploy/production.env -f deploy/compose.production.yml logs -f turn
```

## 6. Telegram webhook

После запуска сайта настройте webhook Telegram-бота на production API:

```bash
curl -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://<ваш-домен>/api/auth/telegram/webhook",
    "secret_token": "<NEXUS_TELEGRAM_WEBHOOK_SECRET>"
  }'
```

Проверить текущий webhook:

```bash
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getWebhookInfo"
```

## 7. Web Push/VAPID

Для фоновых push-уведомлений production должен работать по HTTPS и иметь заполненные переменные:

```dotenv
NEXUS_VAPID_PRIVATE_KEY=<private key>
NEXUS_VAPID_PUBLIC_KEY=<public key>
NEXUS_VAPID_CLAIMS_EMAIL=mailto:<ваш-email>
```

Сгенерировать пару можно локально в `apps/api` после установки зависимостей:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
.venv/bin/python -c "import base64; from cryptography.hazmat.primitives.serialization import Encoding, NoEncryption, PrivateFormat, PublicFormat; from py_vapid import Vapid; v=Vapid(); v.generate_keys(); print('NEXUS_VAPID_PRIVATE_KEY=' + base64.urlsafe_b64encode(v.private_key.private_bytes(Encoding.DER, PrivateFormat.PKCS8, NoEncryption())).rstrip(b'=').decode()); print('NEXUS_VAPID_PUBLIC_KEY=' + base64.urlsafe_b64encode(v.public_key.public_bytes(Encoding.X962, PublicFormat.UncompressedPoint)).rstrip(b'=').decode())"
```

## 8. TURN/WebRTC звонки

Фронтенд получает ICE-конфигурацию из runtime-переменной `VITE_RTC_ICE_SERVERS`. Значение — JSON-массив для `RTCPeerConnection`, например:

```dotenv
VITE_RTC_ICE_SERVERS=[{"urls":["stun:nexus.example.ru:3478","turn:nexus.example.ru:3478?transport=udp","turn:nexus.example.ru:3478?transport=tcp"],"username":"nexus-turn","credential":"<turn-password>"}]
```

Текущая конфигурация использует static TURN credentials. Это нормально для первого production-baseline, но перед публичной нагрузкой лучше перейти на временные TURN credentials через backend endpoint.

Проверить порты на сервере:

```bash
sudo ss -lunpt | grep 3478
```

Проверить снаружи можно через WebRTC ICE checker, указав `turn:<домен>:3478?transport=udp`, username и credential из production env. Для реального smoke-check откройте direct chat у двух пользователей на разных сетях, начните звонок и включите демонстрацию экрана.

## 9. Smoke-check после запуска

Проверьте:

1. `https://<ваш-домен>` открывается без VPN с обычного российского интернета.
2. `https://<ваш-домен>/health` возвращает `{"status":"ok","service":"nexus-api"}`.
3. `https://<ваш-домен>/health/infrastructure` показывает `database: ok` и `redis: ok`.
4. Регистрация через Telegram-бота создаёт пользователя.
5. Вход по Nexus ID + password работает.
6. PIN создаётся и работает на доверенном устройстве.
7. Direct chat создаётся по username/Nexus ID.
8. Text/photo/video/file/voice/emoji сообщения отправляются и сохраняются.
9. Realtime-сообщения приходят во второй вкладке без обновления страницы.
10. Загруженные файлы открываются по URL `/storage/uploads/...`.
11. Push-подписка включается в профиле/настройках, если заполнены VAPID-ключи.
12. Аудиозвонок соединяется между двумя пользователями в разных сетях, микрофон mute/unmute работает, демонстрация экрана стартует и останавливается.

## 10. Обновление production

На сервере из корня проекта:

```bash
git pull
docker compose --env-file deploy/production.env -f deploy/compose.production.yml up -d --build
```

API-контейнер при старте применяет миграции:

```text
alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
```

## 11. Резервные копии

Перед реальными пользователями обязательно настройте backup PostgreSQL и uploads volume.

Пример ручного дампа PostgreSQL:

```bash
docker compose --env-file deploy/production.env -f deploy/compose.production.yml exec postgres \
  pg_dump -U nexus nexus > nexus-$(date +%Y-%m-%d).sql
```

Uploads лежат в Docker volume `nexus-production_nexus_api_uploads`. Их тоже нужно регулярно копировать или переносить в production object storage.

## 12. Важные ограничения текущего MVP

- Realtime fan-out пока in-memory в одном API-процессе. Не запускайте несколько API-инстансов до внедрения Redis pub/sub fan-out.
- Локальное файловое хранилище подходит для одного сервера, но для полноценного production лучше перейти на object storage с private ACL/signed links.
- Загруженные файлы сейчас раздаются публичным static URL.
- Email-регистрация подтверждается через Telegram-бота: это связывает указанный email с Telegram-аккаунтом, но не доказывает доступ к почтовому ящику. Для полноценной email-verification нужно добавить SMTP/почтовый провайдер.
- TURN сейчас использует static credentials, которые видны браузеру как часть ICE-конфигурации. Для публичного масштаба нужны временные credentials и rate limiting.
- Нужны регулярные backup базы и uploads.

## Старый вариант: Railway/Vercel/Amvera

Ранее проект описывался под Railway/Vercel и отдельный web-хостинг. Это всё ещё возможно, но для купленного домена и российского VPS основной рекомендуемый путь теперь — `deploy/compose.production.yml` на одном сервере.

Если понадобится вернуть схему с внешним API и отдельным web-хостингом:

- web-контейнер поддерживает `NEXUS_API_UPSTREAM=https://<api-домен>`;
- в same-origin production `VITE_API_BASE_URL` и `VITE_WS_BASE_URL` лучше оставлять пустыми;
- если API расположен на отдельном публичном домене, задайте `VITE_API_BASE_URL=https://<api-домен>` и `VITE_WS_BASE_URL=wss://<api-домен>` на этапе сборки или через runtime `/env.js`.
