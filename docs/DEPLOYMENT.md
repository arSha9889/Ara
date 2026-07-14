# Закрытая бета: GitHub, Railway и Vercel

Репозиторий — npm-монорепозиторий:

- `apps/web` — пользовательское React-приложение, деплоится в Vercel;
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
VITE_TELEGRAM_BOT_NAME=<имя_бота_без_@>
```

4. После первого Vercel-деплоя добавьте точный URL Vercel в `NEXUS_ALLOWED_ORIGINS` Railway и передеплойте API.

`apps/web/vercel.json` содержит SPA rewrite, поэтому прямое открытие маршрутов вроде `/app/chats/...` не даст 404.

## Перед открытием беты

1. Откройте Vercel-приложение и проверьте регистрацию, вход, чат и загрузку файла.
2. Проверьте API `/health` и `/health/infrastructure`.
3. Убедитесь, что Telegram callback и домен Vercel разрешены в настройках Telegram-бота.
4. Не масштабируйте Railway API выше одного инстанса: realtime сейчас реализован в памяти одного процесса.
5. Локальное файловое хранилище на Railway подходит для закрытой беты только с подключённым Volume; для production перенесите файлы в object storage.
