# Закрытая бета: GitHub, Railway, Vercel и альтернативный web-хостинг

Репозиторий — npm-монорепозиторий:

- `apps/web` — пользовательское React-приложение, деплоится в Vercel или на доступный из РФ web-хостинг/VPS;
- `packages/ui` — переиспользуемые базовые UI-компоненты;
- `apps/api` — FastAPI API, деплоится в Railway;
- `.github/workflows/ci.yml` — проверка сборки web и тестов API в GitHub Actions.

## 1. GitHub

Из корня проекта:

```bash
git init
git add .
git commit -m "Prepare closed beta deployment"
git branch -M main
git remote add origin <URL_ВАШЕГО_РЕПОЗИТОРИЯ>
git push -u origin main
```

Перед публикацией убедитесь, что `apps/api/.env` не добавлен в индекс. В нём находятся секреты, а `.gitignore` исключает его по умолчанию.

## 2. Railway: API и PostgreSQL

1. Создайте проект Railway и добавьте сервис **PostgreSQL**.
2. Добавьте сервис из GitHub-репозитория. В настройках сервиса укажите **Root Directory**: `apps/api`.
3. Railway использует `apps/api/Dockerfile`; миграции Alembic применяются перед запуском API.
4. Добавьте Volume, смонтированный в `/data`, чтобы файлы не исчезали при перезапуске контейнера.
5. Задайте переменные API:

```dotenv
NEXUS_ENVIRONMENT=production
NEXUS_DATABASE_URL=${{Postgres.DATABASE_URL}}
NEXUS_REDIS_URL=
NEXUS_ALLOWED_ORIGINS=["https://<ваш-проект>.vercel.app"]
NEXUS_TELEGRAM_BOT_TOKEN=<секрет Telegram-бота>
NEXUS_TELEGRAM_BOT_NAME=<имя_бота_без_@>
NEXUS_TELEGRAM_WEBHOOK_SECRET=<случайная строка для Telegram webhook>
NEXUS_REGISTRATION_PROOF_SECRET=<случайная длинная строка>
NEXUS_ACCESS_TOKEN_SECRET=<случайная длинная строка>
NEXUS_UPLOAD_DIR=/data/uploads
NEXUS_STORAGE_PUBLIC_URL_PREFIX=/storage/uploads
NEXUS_STORAGE_PUBLIC_BASE_URL=https://<ваш-api>.up.railway.app
NEXUS_VAPID_PRIVATE_KEY=<VAPID private key>
NEXUS_VAPID_PUBLIC_KEY=<VAPID public key>
NEXUS_VAPID_CLAIMS_EMAIL=mailto:<ваш-email>
```

API автоматически преобразует предоставленный Railway адрес PostgreSQL в формат драйвера `asyncpg`. `NEXUS_REDIS_URL` пока можно оставить пустым: API продолжает работать, а `/health/infrastructure` отметит Redis как недоступный. Для нескольких API-инстансов нужен Redis pub/sub; для закрытой беты используйте один инстанс Railway.

После деплоя проверьте `https://<ваш-api>.up.railway.app/health`: должен вернуться `{"status":"ok","service":"nexus-api"}`.

## 3. Vercel: web

1. Импортируйте тот же GitHub-репозиторий в Vercel.
2. Укажите **Root Directory**: `apps/web`. Framework Preset — Vite.
3. Добавьте переменные окружения во все нужные окружения Vercel:

```dotenv
VITE_API_BASE_URL=https://<ваш-api>.up.railway.app
VITE_WS_BASE_URL=wss://<ваш-api>.up.railway.app
```

4. После первого Vercel-деплоя добавьте точный URL Vercel в `NEXUS_ALLOWED_ORIGINS` Railway и передеплойте API.

`apps/web/vercel.json` содержит SPA rewrite, поэтому прямое открытие маршрутов вроде `/app/chats/...` не даст 404.

## 4. Альтернативный web-хостинг для доступа из России

Если у пользователя без VPN не открывается сам домен Vercel, это нельзя исправить внутри React-приложения: браузер не получает HTML/JS приложения. Для пользователей из России используйте домен и хостинг/VPS, доступные из РФ, и разверните `apps/web` как Docker-контейнер с Nginx.

Вариант с одним публичным доменом для web:

- пользователь открывает `https://<ваш-доступный-домен>`;
- Nginx отдаёт собранный React web;
- запросы `/api`, `/ws` и `/storage/uploads` проксируются на API;
- в браузере не используется недоступный `*.vercel.app` домен.

Сборка образа из директории `apps/web`:

```bash
docker build -t nexus-web apps/web
```

Запуск контейнера:

```bash
docker run -d \
  --name nexus-web \
  -p 8080:8080 \
  -e NEXUS_API_UPSTREAM=https://<ваш-api-домен> \
  nexus-web
```

Если web и API находятся в одной Docker-сети, можно указать внутренний адрес API, например:

```bash
NEXUS_API_UPSTREAM=http://api:8000
```

Для такого same-origin деплоя `VITE_API_BASE_URL` и `VITE_WS_BASE_URL` можно не задавать: production-сборка web по умолчанию будет обращаться к `/api` и `/ws` на том же домене. Если API остаётся на отдельном публичном домене, задайте переменные при сборке:

```bash
docker build \
  --build-arg VITE_API_BASE_URL=https://<ваш-api-домен> \
  --build-arg VITE_WS_BASE_URL=wss://<ваш-api-домен> \
  -t nexus-web apps/web
```

Для same-origin варианта в API достаточно разрешить публичный web-домен:

```dotenv
NEXUS_ALLOWED_ORIGINS=["https://<ваш-доступный-домен>"]
NEXUS_STORAGE_PUBLIC_BASE_URL=https://<ваш-доступный-домен>
```

Практический критерий готовности: `https://<ваш-доступный-домен>` должен открываться с обычного российского мобильного/домашнего интернета без VPN.

### Amvera: web вместо Vercel

Для Amvera в корне репозитория добавлены:

- `amvera.yml` — указывает Amvera собирать Docker-образ и слушать порт `8080`;
- `Dockerfile.amvera-web` — собирает только `apps/web` из монорепозитория;
- `.dockerignore` — исключает тяжёлые локальные файлы из Docker-контекста;
- `/env.js` runtime-config — позволяет читать переменные Amvera на этапе запуска контейнера, потому что на этапе сборки они недоступны.

Рекомендуемый порядок:

1. Создайте в Amvera новое приложение для frontend, например `nexus-web`.
2. Подключите GitHub-репозиторий `arSha9889/Nex` или загрузите код через git Amvera.
3. В качестве конфигурации используйте корневой `amvera.yml`.
4. Добавьте переменные приложения:

```dotenv
NEXUS_API_UPSTREAM=https://<ваш-api-домен>
```

`VITE_API_BASE_URL` и `VITE_WS_BASE_URL` для Amvera web обычно не задаются: frontend обращается к `/api` и `/ws` на своём домене, а Nginx проксирует их в `NEXUS_API_UPSTREAM`.

После изменения переменных в Amvera перезапустите контейнер: entrypoint заново сгенерирует `/env.js`.

5. После первого успешного запуска возьмите публичный домен Amvera и добавьте его в переменные API:

```dotenv
NEXUS_ALLOWED_ORIGINS=["https://<ваш-домен-amvera>"]
NEXUS_STORAGE_PUBLIC_BASE_URL=https://<ваш-домен-amvera>
```

6. Передеплойте API и проверьте:

- `https://<ваш-домен-amvera>` открывается без VPN;
- `https://<ваш-домен-amvera>/env.js` содержит ожидаемые URL API/WS, если вы их задавали;
- `https://<ваш-домен-amvera>/health` возвращает health API;
- вход, чаты, загрузка файлов и realtime-сообщения работают.

## Перед открытием беты

1. Откройте Vercel-приложение и проверьте регистрацию, вход, чат и загрузку файла.
2. Проверьте API `/health` и `/health/infrastructure`.
3. Убедитесь, что Telegram webhook настроен на `/api/auth/telegram/webhook` и передаёт `NEXUS_TELEGRAM_WEBHOOK_SECRET`.
4. Не масштабируйте Railway API выше одного инстанса: realtime сейчас реализован в памяти одного процесса.
5. Локальное файловое хранилище на Railway подходит для закрытой беты только с подключённым Volume; для production перенесите файлы в object storage.
