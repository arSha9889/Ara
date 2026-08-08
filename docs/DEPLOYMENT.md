# Публичный релиз AraChat: домен REG.RU и VPS

Этот документ описывает запуск AraChat на одном публичном домене, например `https://chat.example.ru`. Внутри сервера работают:

- `web` — React/Vite-приложение в Nginx-контейнере;
- `api` — FastAPI-приложение;
- `postgres` — основная база данных;
- `redis` — инфраструктурный Redis для текущего контура и будущего масштабирования realtime;
- `turn` — подготовленный, но пока выключенный coturn для будущих WebRTC-звонков;
- `caddy` — внешний reverse proxy с автоматическим HTTPS от Let's Encrypt.

В этом варианте фронтенд, API и WebSocket находятся на одном домене, а медиафайлы — в S3-совместимом object storage:

- `https://<домен>/` — сайт;
- `https://<домен>/api/...` — API;
- `wss://<домен>/ws` — realtime WebSocket;
- `https://<media-домен>/uploads/...` — загруженные файлы из object storage.

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
Диск особенно важен для базы данных. Медиафайлы production-конфигурация хранит
в S3-совместимом object storage, поэтому они не занимают Docker volume VPS.
30 ГБ — нижняя граница для базы и контейнеров. Точный лимит пользователей заранее
не обещаем: он зависит от размера вложений и реальной активности.

## 2. До запуска: обязательные условия

Минимально желательно:

- VPS/выделенный сервер с Linux;
- root-доступ или пользователь с `sudo`;
- открытые входящие порты `80` и `443`;
- Docker и Docker Compose v2;
- характеристики VPS не ниже рекомендованного выше тарифа;
- постоянный диск под PostgreSQL.

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
sudo mkdir -p /opt
sudo git clone <URL_ВАШЕГО_РЕПОЗИТОРИЯ> /opt/arachat
sudo chown -R "$USER":"$USER" /opt/arachat
cd /opt/arachat
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
NEXUS_S3_ENDPOINT_URL=https://<account-id>.r2.cloudflarestorage.com
NEXUS_S3_BUCKET=<имя-bucket>
NEXUS_S3_ACCESS_KEY_ID=<access-key-id>
NEXUS_S3_SECRET_ACCESS_KEY=<secret-access-key>
NEXUS_S3_PUBLIC_BASE_URL=https://<media-домен>
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

### Администратор и контактный номер

Права администратора должны быть привязаны к уже подтверждённому e-mail владельца
аккаунта, а не к номеру телефона. В `deploy/production.env` укажите этот e-mail и
очистите устаревший резервный номер:

```dotenv
NEXUS_ADMIN_EMAIL=owner@example.com
NEXUS_ADMIN_PHONE=
```

Перезапустите API после изменения конфигурации. После этого номер можно сохранить в
профиле как контактный. Не снимайте ограничение через код, пока задан только
`NEXUS_ADMIN_PHONE`: иначе любой пользователь, указавший этот номер, получит доступ
к админ-панели.

Секреты можно сгенерировать так:

```bash
openssl rand -hex 32
```

Права на секретный файл должны быть доступны только владельцу:

```bash
chmod 600 deploy/production.env
```

Перед запуском убедитесь, что в `production.env` не осталось примерных значений `change-me`, `example.ru` или `203.0.113.10`.

## 6. Object storage для production

Production Compose намеренно требует S3-совместимое хранилище: API не запускается,
если не заполнены его реквизиты. Поддерживаются Cloudflare R2, AWS S3, MinIO и
другие провайдеры с S3 API. Для первого релиза рекомендуется Cloudflare R2.

1. Создайте bucket, например `arachat-media`.
2. Создайте отдельный API token с правом **Object Read & Write** только к этому bucket.
3. Подключите к bucket публичный custom domain, например `media.<ваш-домен>`.
   Альтернативно на старте допустим выданный R2.dev-домен. Не передавайте URL S3 API
   в `NEXUS_S3_PUBLIC_BASE_URL`: это именно публичный URL для браузера.
4. Заполните `NEXUS_S3_*` в `deploy/production.env` по примеру.

Для Cloudflare R2 endpoint имеет вид
`https://<account-id>.r2.cloudflarestorage.com`, регион — `auto`. Для AWS S3
укажите регион bucket и его региональный endpoint. Не добавляйте ключи доступа в
frontend, `.env` клиента или Git: они нужны только API-контейнеру.

Загружаемый файл сначала проходит серверную проверку размера, MIME-типа и сигнатуры;
после этого API отправляет объект в bucket под UUID-именем. Объекты предназначены
для публичного чтения через media-домен. Приватные вложения с подписанными ссылками
требуют отдельной авторизационной модели и пока не реализованы.

## 7. Первый запуск

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

## 8. SMTP и OAuth-провайдеры

До первого запуска заполните в `deploy/production.env` SMTP-параметры из `deploy/production.env.example`: `NEXUS_SMTP_HOST`, `NEXUS_SMTP_PORT`, `NEXUS_SMTP_FROM_EMAIL` и, при необходимости, учётные данные, TLS/SSL и таймаут. Без корректного SMTP регистрация, смена e-mail и восстановление пароля будут недоступны.

Проверьте доставку на контролируемый ящик: зарегистрируйте тестового пользователя, запросите смену e-mail и восстановление пароля. Не используйте production-пароль для этой проверки.

Yandex ID и VK ID необязательны. Если они нужны, для каждого провайдера:

1. Создайте OAuth-приложение в кабинете провайдера.
2. Зарегистрируйте точный callback URL: `https://<ваш-домен>/api/auth/oauth/yandex/callback` либо `https://<ваш-домен>/api/auth/oauth/vk/callback`.
3. Укажите соответствующие `NEXUS_YANDEX_CLIENT_ID`/`NEXUS_YANDEX_CLIENT_SECRET` либо `NEXUS_VK_CLIENT_ID`/`NEXUS_VK_CLIENT_SECRET`.
4. Выполните тест: войдите обычным способом, привяжите provider identity в настройках, затем выйдите и войдите через этого провайдера.

OAuth-клиентские секреты и SMTP-пароль не публикуйте в репозитории, issues, чатах или логах. Внешние identity не создают аккаунты автоматически: они работают только после ручной привязки из авторизованного AraChat-аккаунта.

Telegram webhook может быть настроен только для необязательных устаревших функций. Он не требуется для регистрации, смены и восстановления пароля.

## 9. Web Push/VAPID

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

## 10. TURN/WebRTC-звонки (задел на будущее)

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

## 11. Smoke-check после запуска

Проверьте:

1. `https://<ваш-домен>` открывается без VPN с обычного российского интернета.
2. `https://<ваш-домен>/health` возвращает `{"status":"ok","service":"arachat-api"}`.
3. `https://<ваш-домен>/health/infrastructure` показывает `database: ok`, `redis: ok` и `storage: ok`.
4. SMTP-код приходит на тестовый e-mail, а регистрация с подтверждённым кодом создаёт пользователя.
5. Вход по AraChat ID/e-mail + password работает.
6. Смена пароля требует текущий пароль и SMTP-код; восстановление пароля нейтрально отвечает для неизвестного e-mail и отзывает сессии после успешного сброса.
7. Смена e-mail требует текущий пароль и код, отправленный на новый адрес.
8. PIN создаётся и работает на доверенном устройстве.
9. Если настроены Yandex ID/VK ID, identity можно привязать только из авторизованного аккаунта, а вход через непривязанную identity отклоняется.
10. Direct chat создаётся по username/AraChat ID.
11. Text/photo/video/file/voice/emoji сообщения отправляются и сохраняются.
12. Realtime-сообщения приходят во второй вкладке без обновления страницы.
13. Загруженные файлы открываются по URL `https://<media-домен>/uploads/...` и имеют корректный `Content-Type`.
14. Push-подписка включается в профиле/настройках, если заполнены VAPID-ключи.
15. Проверка аудиозвонков и демонстрации экрана откладывается до реализации server-side call signaling.

Дополнительно проверьте HTTP-заголовки и отсутствие открытых служебных портов:

```bash
curl -sS -D- -o /dev/null https://<ваш-домен>
sudo ss -lntup
```

У ответа сайта должны быть `Strict-Transport-Security`, `Content-Security-Policy` и `X-Content-Type-Options`. В `ss` не должны быть слушающими на внешнем интерфейсе порты PostgreSQL, Redis, API и Nginx.

## 12. Обновление production

На сервере из корня проекта:

```bash
git pull
docker compose --env-file deploy/production.env -f deploy/compose.production.yml up -d --build
```

API-контейнер при старте применяет миграции:

```text
alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
```

При этом обновлении Compose пересоздаст контейнеры, чтобы применить лимиты
Docker-логов: не более 10 МБ × 3 сжатых файла на контейнер. Старые образы и
build cache не удаляются этой командой — за них отвечает безопасный systemd
таймер ниже.

## 13. Хранение, безопасная очистка и контроль места

В production уже включены следующие предохранители:

- логи всех контейнеров Docker используют драйвер `local`, ограниченный 10 МБ × 3;
- Redis ограничен `NEXUS_REDIS_MAXMEMORY` (по умолчанию 256 МБ) и может вытеснять
  только TTL-ключи rate limit по LRU; он не содержит сессии, чаты или сообщения;
- медиафайлы production находятся в S3, а не в Docker volume VPS;
- прикладной retention удаляет лишь устаревшие служебные записи и объекты,
  зарегистрированные новым реестром хранилища. Активные сообщения, используемые
  вложения и исторические S3-объекты без записи в реестре не удаляются автоматически.

Установите host-side задачи. Они выполняются только systemd от root, не получают
параметров из HTTP и не дают панели администратора доступа к Docker socket или
томам:

```bash
sudo install -d -m 0750 /etc/arachat /var/lib/arachat/maintenance
sudo install -d -m 0755 /usr/local/lib/arachat
sudo install -m 0755 deploy/maintenance/*.sh /usr/local/lib/arachat/
sudo install -m 0644 deploy/maintenance/*.service deploy/maintenance/*.timer /etc/systemd/system/
sudo tee /etc/arachat/maintenance.env > /dev/null <<'EOF'
ARACHAT_PROJECT_DIR=/opt/arachat
ARACHAT_DOCKER_RETENTION_HOURS=336
ARACHAT_BACKUP_DIR=/var/lib/arachat/backups
ARACHAT_POSTGRES_VOLUME=nexus-production_nexus_postgres_data
ARACHAT_REDIS_VOLUME=nexus-production_nexus_redis_data
EOF
sudo chmod 600 /etc/arachat/maintenance.env
sudo systemctl daemon-reload
sudo systemctl enable --now arachat-storage-status.timer arachat-host-cleanup.timer arachat-app-retention.timer
sudo systemctl start arachat-storage-status.service
```

`arachat-host-cleanup` ежедневно удаляет **только** неиспользуемые Docker images
и build cache старше 14 дней. Он намеренно не запускает `docker volume prune`,
`docker system prune --volumes`, очистку контейнеров или Redis `FLUSHALL`.
`arachat-app-retention` запускает фиксированную команду внутри API-контейнера;
ручной запуск из вкладки «Хранение» использует тот же прикладной механизм и
защищён от параллельного запуска PostgreSQL advisory lock.

Периоды прикладного retention по умолчанию:

| Данные | Срок до очистки |
| --- | --- |
| Подтверждения e-mail/телефона и подтверждения пароля | 30 дней после истечения |
| OAuth-попытки | 7 дней после истечения |
| Истёкшие или отозванные сессии и PIN | 30 дней |
| История входов | 180 дней |
| Прочитанные/непрочитанные уведомления | 30 / 90 дней |
| Audit log | 365 дней |
| Загруженный, но не прикреплённый файл | 1 день |
| Вложение удалённого сообщения | 30 дней после удаления сообщения |
| Заменённый загруженный аватар | 1 день после замены |

Вкладка **Панель управления → Хранение** показывает read-only JSON-снимок
хоста и предварительный объём прикладной очистки. Отсутствие снимка означает,
что systemd collector не установлен или не запускался; это не причина выполнять
опасные команды из панели.

Контролируйте таймеры и последние результаты:

```bash
sudo systemctl list-timers 'arachat-*'
sudo systemctl status arachat-storage-status.service arachat-host-cleanup.service arachat-app-retention.service
sudo journalctl -u arachat-host-cleanup.service -u arachat-app-retention.service --since '24 hours ago'
cat /var/lib/arachat/maintenance/storage-status.json
docker system df
df -h /
```

Пороги реакции: до 70% диска — нормальный режим; 70–85% — проверьте разбивку в
панели и `docker system df`; 85–92% — срочно проверьте успешность backup и
host-cleanup, а также размер PostgreSQL; выше 92% — остановите необязательные
обновления/загрузки, освободите место вручную после диагностики и не удаляйте
volumes либо данные пользователей «на глаз».

После каждого обновления, если менялись файлы `deploy/maintenance/`, повторите
команды `install` для скриптов/unit-файлов и `sudo systemctl daemon-reload`.

## 14. Резервные копии

Перед реальными пользователями обязательно настройте backup PostgreSQL и bucket object storage.

Используйте `restic` и репозиторий вне VPS/основного аккаунта. Скрипт
`backup-postgres.sh` формирует сжатый dump во временной директории, отправляет
его в удалённый `restic` repository и удаляет локальный файл при любом исходе.
Не сохраняйте ежедневные dumps в `backups/` на VPS: это снова создаст
неконтролируемый рост диска.

```bash
sudo apt install -y restic
sudo install -m 600 /dev/null /etc/arachat/restic-password
sudo nano /etc/arachat/restic-password
sudo nano /etc/arachat/maintenance.env
```

Добавьте в `/etc/arachat/maintenance.env` параметры настоящего внешнего
repository. Тип и учётные данные зависят от выбранного провайдера; они должны
быть отдельны от VPS и production media bucket:

```dotenv
RESTIC_REPOSITORY=<удалённый-restic-repository>
RESTIC_PASSWORD_FILE=/etc/arachat/restic-password
# Например, для S3-compatible repository также потребуются AWS_ACCESS_KEY_ID,
# AWS_SECRET_ACCESS_KEY и при необходимости RESTIC_REPOSITORY_OPTIONS.
ARACHAT_RESTIC_KEEP_DAILY=7
ARACHAT_RESTIC_KEEP_WEEKLY=4
ARACHAT_RESTIC_KEEP_MONTHLY=12
```

Инициализируйте пустой repository один раз и включите таймер:

```bash
sudo systemctl start arachat-restic-init.service
sudo systemctl enable --now arachat-postgres-backup.timer
sudo systemctl start arachat-postgres-backup.service
sudo journalctl -u arachat-postgres-backup.service -n 100 --no-pager
```

Перед обновлением с миграциями запустите тот же backup unit вручную и убедитесь,
что он завершился успешно: `sudo systemctl start arachat-postgres-backup.service`.

Проверьте восстановление в изолированную тестовую PostgreSQL базу не реже раза
в месяц. Для object storage включите lifecycle/версионирование и репликацию или
backup bucket в отдельном аккаунте. Один VPS, один bucket или один repository
не является полноценной резервной копией.

## 15. Ограничения перед массовым запуском

- Realtime fan-out пока in-memory в одном API-процессе. Не запускайте несколько API-инстансов до внедрения Redis pub/sub fan-out.
- Медиафайлы хранятся в object storage, но текущая модель раздаёт их публично через media-домен. Для приватных вложений нужны защищённый endpoint и короткоживущие signed URLs.
- SMTP и OAuth-провайдеры необходимо проверить с реальными production-настройками: корректность callback URL, тип и разрешения VK-приложения, а также доставку почты зависят от выбранных поставщиков.
- У исторических аккаунтов e-mail не считается подтверждённым автоматически. Пользователь, который забыл пароль до повторного подтверждения почты, нуждается в отдельном безопасном процессе поддержки.
- TURN сейчас использует static credentials, которые видны браузеру как часть ICE-конфигурации. Для публичного масштаба нужны временные credentials и rate limiting.
- Нужны регулярные backup базы и bucket object storage.
- Перед запуском необходимо самостоятельно проверить актуальность пользовательского соглашения и политики конфиденциальности, реквизитов оператора и применимых требований к персональным данным. Этот репозиторий не заменяет юридическую консультацию.

## Старый вариант: Railway/Vercel/Amvera

Ранее проект описывался под Railway/Vercel и отдельный web-хостинг. Это всё ещё возможно, но для купленного домена и российского VPS основной рекомендуемый путь теперь — `deploy/compose.production.yml` на одном сервере.

Если понадобится вернуть схему с внешним API и отдельным web-хостингом:

- web-контейнер поддерживает `NEXUS_API_UPSTREAM=https://<api-домен>`;
- в same-origin production `VITE_API_BASE_URL` и `VITE_WS_BASE_URL` лучше оставлять пустыми;
- если API расположен на отдельном публичном домене, задайте `VITE_API_BASE_URL=https://<api-домен>` и `VITE_WS_BASE_URL=wss://<api-домен>` на этапе сборки или через runtime `/env.js`.
