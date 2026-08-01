# Публичный релиз AraChat: домен REG.RU и VPS

Этот документ описывает запуск AraChat на одном публичном домене, например `https://chat.example.ru`. Внутри сервера работают:

- `web` — React/Vite-приложение в Nginx-контейнере;
- `api` — FastAPI-приложение;
- `postgres` — основная база данных;
- `redis` — инфраструктурный Redis для текущего контура и будущего масштабирования realtime;
- `turn` — подготовленный, но пока выключенный coturn для будущих WebRTC-звонков;
- `caddy` — внешний reverse proxy с автоматическим HTTPS от Let's Encrypt.

В этом варианте фронтенд, API, WebSocket и загруженные файлы находятся на одном домене:

- `https://<домен>/` — сайт;
- `https://<домен>/api/...` — API;
- `wss://<домен>/ws` — realtime WebSocket;
- `https://<домен>/storage/uploads/...` — текущая раздача загруженных файлов.

Такой same-origin деплой проще и надёжнее для MVP: браузеру не нужны отдельные публичные API-домены, CORS становится менее хрупким, а Web Push работает через HTTPS.

## 1. Какой VPS выбрать на FirstVPS

Для текущего single-server MVP нужны не только frontend и API: на VPS одновременно
работают PostgreSQL, Redis, Nginx, Caddy и FastAPI. Поэтому тариф с 1 ГБ RAM для
этого проекта не подходит.

| Сценарий | Рекомендуемые характеристики | Когда выбирать |
| --- | --- | --- |
| Личная демонстрация без звонков | 2 vCPU, 2 ГБ RAM, 30 ГБ NVMe, публичный IPv4 | Короткий тест для нескольких знакомых. Возможны ограничения при одновременной регистрации и загрузках. |
| Закрытая бета — рекомендуемый минимум | **2 vCPU, 4 ГБ RAM, 60 ГБ NVMe, публичный IPv4, от 1 ТБ трафика/месяц** | Оптимальный стартовый тариф для проекта. |
| Первые публичные пользователи | 4 vCPU, 8 ГБ RAM, 100+ ГБ NVMe, публичный IPv4, от 2 ТБ трафика/месяц | Запас для базы, файлов и более активных чатов. |

Выберите Linux VPS с **Ubuntu 24.04 LTS**, выделенным публичным IPv4 и без
ограничений на входящий UDP. Последнее понадобится для будущих WebRTC-звонков.
Диск особенно важен: база данных и загруженные файлы сейчас хранятся на VPS.
30 ГБ — только нижняя граница; при росте медиафайлов увеличивайте диск или
переносите файлы в объектное хранилище. Точный лимит пользователей заранее
не обещаем: он зависит от размера вложений и реальной активности.

## 2. До запуска: обязательные условия

Минимально желательно:

- VPS/выделенный сервер с Linux;
- root-доступ или пользователь с `sudo`;
- открытые входящие порты `80` и `443`;
- Docker и Docker Compose v2;
- характеристики VPS не ниже рекомендованного выше тарифа;
- постоянный диск под PostgreSQL и загрузки пользователей.

Не публикуйте PostgreSQL (`5432`), Redis (`6379`), API (`8000`) или web-контейнер (`8080`) в интернет: в production-конфигурации наружу открыты только Caddy на портах `80/443` и coturn для звонков.

На сервере используйте отдельного пользователя с `sudo`, SSH по ключу и отключите вход `root` по паролю. В панели REG.RU и в локальном firewall разрешите только нужные входящие порты:

- `22/tcp` — SSH, лучше ограничить вашим IP;
- `80/tcp`, `443/tcp` — сайт и выпуск TLS-сертификата;
- `3478/tcp`, `3478/udp` и `49160-49200/udp` — не нужны сейчас; откройте их только после реализации и включения звонков.

Порты TURN/STUN (`3478/tcp`, `3478/udp` и `49160-49200/udp`) пока не
открывайте: текущий backend не поддерживает сигнализацию звонков. Инструкция
для их включения будет нужна позднее, после реализации этой функции.

Если хостинг окажется не VPS, а панельным/shared-хостингом без Docker, схема будет другой. Тогда нужно будет адаптировать запуск под конкретную панель.

## 3. DNS в REG.RU

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

Проверьте распространение DNS до запуска контейнеров:

```bash
dig +short <ваш-домен> A
```

Команда должна вернуть публичный IPv4 VPS. Не включайте прокси/CDN перед первым выпуском сертификата, если не уверены, что он пропускает ACME-проверку.

## 4. Файлы деплоя в репозитории

Добавлены production-шаблоны:

- `deploy/compose.production.yml` — Docker Compose для `postgres`, `redis`, `api`, `web`, `turn`, `caddy`;
- `deploy/Caddyfile` — публичный HTTPS reverse proxy;
- `deploy/production.env.example` — шаблон переменных окружения для сервера.

Секретный файл на сервере должен называться `deploy/production.env`. Его нельзя коммитить в Git.

## 5. Подготовка сервера на FirstVPS

Ниже — команды для чистого Ubuntu 24.04. Подключитесь к IP сервера по SSH под
пользователем с `sudo`. Сначала обновите систему, установите Git и Docker Engine
с Compose-плагином из официального репозитория Docker:

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y ca-certificates curl git ufw
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
. /etc/os-release
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${UBUNTU_CODENAME:-$VERSION_CODENAME} stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
docker compose version
```

Откройте firewall. Если SSH у провайдера работает на нестандартном порту,
подставьте его вместо `22` до включения UFW. Если FirstVPS предоставляет
отдельную сетевую защиту, разрешите в ней те же порты.

```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status verbose
```

Затем получите код проекта через Git:

```bash
git clone <URL_ВАШЕГО_РЕПОЗИТОРИЯ> arachat
cd arachat
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
NEXUS_EARLY_ACCESS_BYPASS_LIMIT=0
```

Для публичного релиза укажите `NEXUS_EARLY_ACCESS_BYPASS_LIMIT=0`. Положительное значение включает ограничение на число активных аккаунтов и подходит только для закрытой беты.
Параметры `NEXUS_TURN_*` и `VITE_RTC_ICE_SERVERS` пока можно оставить
примерными: профиль `calls` по умолчанию выключен.

Секреты можно сгенерировать так:

```bash
openssl rand -hex 32
```

Права на секретный файл должны быть доступны только владельцу:

```bash
chmod 600 deploy/production.env
```

Перед запуском убедитесь, что в `production.env` не осталось примерных значений `change-me`, `example.ru` или `203.0.113.10`.

## 6. Первый запуск

Из корня проекта:

```bash
docker compose --env-file deploy/production.env -f deploy/compose.production.yml up -d --build
```

Что произойдёт:

1. поднимется PostgreSQL;
2. поднимется Redis;
3. API применит Alembic-миграции и запустит FastAPI;
4. web соберёт React-приложение и запустит Nginx;
5. Caddy выпустит HTTPS-сертификат и начнёт принимать внешний трафик.

`turn` не запускается по умолчанию: звонки пока не реализованы на backend,
и API возвращает `calls_temporarily_unavailable`. Это не мешает чатам,
вложениям, WebSocket и push-уведомлениям.

Перед `up` можно проверить итоговую конфигурацию без запуска контейнеров:

```bash
docker compose --env-file deploy/production.env -f deploy/compose.production.yml config -q
```

Проверка статуса:

```bash
docker compose --env-file deploy/production.env -f deploy/compose.production.yml ps
docker compose --env-file deploy/production.env -f deploy/compose.production.yml logs -f caddy
docker compose --env-file deploy/production.env -f deploy/compose.production.yml logs -f api
```

## 7. Telegram webhook

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

В ответе `getWebhookInfo` не должно быть `last_error_message`. Токен бота и URL webhook не публикуйте в issues, чатах или коммитах.

## 8. Web Push/VAPID

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

## 9. TURN/WebRTC-звонки (задел на будущее)

Сейчас запускать этот раздел не нужно: серверная сигнализация звонков ещё не
реализована. Когда она появится, откройте порты в UFW и в панели FirstVPS:

```bash
sudo ufw allow 3478/tcp
sudo ufw allow 3478/udp
sudo ufw allow 49160:49200/udp
```

После этого включите профиль TURN:

```bash
docker compose --profile calls --env-file deploy/production.env -f deploy/compose.production.yml up -d
```

Фронтенд получает ICE-конфигурацию из runtime-переменной `VITE_RTC_ICE_SERVERS`. Значение — JSON-массив для `RTCPeerConnection`, например:

```dotenv
VITE_RTC_ICE_SERVERS=[{"urls":["stun:<ваш-домен>:3478","turn:<ваш-домен>:3478?transport=udp","turn:<ваш-домен>:3478?transport=tcp"],"username":"<turn-логин>","credential":"<turn-пароль>"}]
```

Текущая конфигурация использует static TURN credentials. Это нормально для первого production-baseline, но перед публичной нагрузкой лучше перейти на временные TURN credentials через backend endpoint.

Проверить порты на сервере:

```bash
sudo ss -lunpt | grep 3478
```

Проверить снаружи можно через WebRTC ICE checker, указав `turn:<домен>:3478?transport=udp`, username и credential из production env. Для реального smoke-check откройте direct chat у двух пользователей на разных сетях, начните звонок и включите демонстрацию экрана.

## 10. Smoke-check после запуска

Проверьте:

1. `https://<ваш-домен>` открывается без VPN с обычного российского интернета.
2. `https://<ваш-домен>/health` возвращает `{"status":"ok","service":"arachat-api"}`.
3. `https://<ваш-домен>/health/infrastructure` показывает `database: ok` и `redis: ok`.
4. Регистрация через Telegram-бота создаёт пользователя.
5. Вход по AraChat ID + password работает.
6. PIN создаётся и работает на доверенном устройстве.
7. Direct chat создаётся по username/AraChat ID.
8. Text/photo/video/file/voice/emoji сообщения отправляются и сохраняются.
9. Realtime-сообщения приходят во второй вкладке без обновления страницы.
10. Загруженные файлы открываются по URL `/storage/uploads/...`.
11. Push-подписка включается в профиле/настройках, если заполнены VAPID-ключи.
12. Проверка аудиозвонков и демонстрации экрана откладывается до реализации server-side call signaling.

Дополнительно проверьте HTTP-заголовки и отсутствие открытых служебных портов:

```bash
curl -sS -D- -o /dev/null https://<ваш-домен>
sudo ss -lntup
```

У ответа сайта должны быть `Strict-Transport-Security`, `Content-Security-Policy` и `X-Content-Type-Options`. В `ss` не должны быть слушающими на внешнем интерфейсе порты PostgreSQL, Redis, API и Nginx.

## 11. Обновление production

На сервере из корня проекта:

```bash
git pull
docker compose --env-file deploy/production.env -f deploy/compose.production.yml up -d --build
```

API-контейнер при старте применяет миграции:

```text
alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
```

## 12. Резервные копии

Перед реальными пользователями обязательно настройте backup PostgreSQL и uploads volume.

Пример ручного дампа PostgreSQL:

```bash
docker compose --env-file deploy/production.env -f deploy/compose.production.yml exec postgres \
  pg_dump -U nexus nexus > nexus-$(date +%Y-%m-%d).sql
```

Uploads лежат в Docker volume `nexus-production_nexus_api_uploads`. Их тоже нужно регулярно копировать или переносить в production object storage.

Минимальный план: ежедневный зашифрованный дамп PostgreSQL и копия uploads вне VPS с проверкой восстановления не реже раза в месяц. Один дамп на том же сервере не является резервной копией.

Перед обновлениями с миграциями всегда делайте отдельный дамп:

```bash
mkdir -p backups
docker compose --env-file deploy/production.env -f deploy/compose.production.yml exec -T postgres \
  sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip > "backups/arachat-$(date +%F-%H%M).sql.gz"
```

Команда использует переменные `POSTGRES_USER` и `POSTGRES_DB` внутри контейнера и не требует загрузки production-секретов в shell.

## 13. Ограничения перед массовым запуском

- Realtime fan-out пока in-memory в одном API-процессе. Не запускайте несколько API-инстансов до внедрения Redis pub/sub fan-out.
- Локальное файловое хранилище подходит для одного сервера, но для полноценного production лучше перейти на object storage с private ACL/signed links.
- Загруженные файлы сейчас раздаются публичным static URL.
- Email-регистрация подтверждается через Telegram-бота: это связывает указанный email с Telegram-аккаунтом, но не доказывает доступ к почтовому ящику. Для полноценной email-verification нужно добавить SMTP/почтовый провайдер.
- TURN сейчас использует static credentials, которые видны браузеру как часть ICE-конфигурации. Для публичного масштаба нужны временные credentials и rate limiting.
- Нужны регулярные backup базы и uploads.
- Перед запуском необходимо самостоятельно проверить актуальность пользовательского соглашения и политики конфиденциальности, реквизитов оператора и применимых требований к персональным данным. Этот репозиторий не заменяет юридическую консультацию.

## Старый вариант: Railway/Vercel/Amvera

Ранее проект описывался под Railway/Vercel и отдельный web-хостинг. Это всё ещё возможно, но для купленного домена и российского VPS основной рекомендуемый путь теперь — `deploy/compose.production.yml` на одном сервере.

Если понадобится вернуть схему с внешним API и отдельным web-хостингом:

- web-контейнер поддерживает `NEXUS_API_UPSTREAM=https://<api-домен>`;
- в same-origin production `VITE_API_BASE_URL` и `VITE_WS_BASE_URL` лучше оставлять пустыми;
- если API расположен на отдельном публичном домене, задайте `VITE_API_BASE_URL=https://<api-домен>` и `VITE_WS_BASE_URL=wss://<api-домен>` на этапе сборки или через runtime `/env.js`.
