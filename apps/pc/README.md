# AraChat Desktop

Отдельный desktop-клиент AraChat для macOS и Windows. Production-сборки обращаются к API на `https://aramsg.ru`.

## API и окружения

- `npm --workspace @arachat/desktop run dev` по умолчанию использует локальный API `http://localhost:8000`;
- для личного стенда скопируйте `.env.example` в `.env.local` и укажите `VITE_API_BASE_URL` без завершающего `/`;
- production-адрес определён в отслеживаемом файле `.env.production`. Он публичный и встраивается в приложение при сборке, поэтому секреты туда добавлять нельзя.

Для production API необходимы CORS origins `tauri://localhost` (macOS/Linux) и `http://tauri.localhost` (Windows). Их настройка описана в [docs/DEPLOYMENT.md](../../docs/DEPLOYMENT.md).

## Запуск frontend

Из корня репозитория:

```bash
npm install
npm --workspace @arachat/desktop run dev
```

## Запуск в Tauri

Нужны Rust toolchain, системные зависимости Tauri и Node.js 22+:

```bash
npm --workspace @arachat/desktop run tauri dev
```

## Сборка macOS

На macOS после установки Rust toolchain:

```bash
npm --workspace @arachat/desktop run tauri build
```

Tauri создаст установочный пакет для настроенной целевой платформы. Перед публикацией нужно добавить подписанные иконки приложения и настроить code signing/notarization Apple.

Локальная сборка на Apple Silicon создаёт `.dmg` в
`apps/pc/src-tauri/target/release/bundle/dmg/`. Для распространения через
Gatekeeper необходимы Apple Developer ID, подпись и notarization.

## Пакеты для macOS и Windows

Ручной workflow **Desktop packages** в GitHub Actions собирает:

- `.dmg` для Apple Silicon на `macos-14`;
- NSIS `.exe` для Windows x64 на `windows-latest`.

Запустите его во вкладке **Actions**, выберите **Desktop packages** и нажмите
**Run workflow**. Готовые файлы появятся в artifacts этого запуска. Workflow
только собирает пакеты: подпись Windows и подпись/notarization macOS нужно
настроить отдельно до публичного распространения.

## Текущий статус

- Tauri 2 и Vite/React подготовлены;
- окно 1200 x 800 с кастомной верхней панелью;
- есть светлая и тёмная темы, русский и английский языки;
- есть интерактивные UI-сценарии приветствия, входа и трёхшаговой регистрации;
- приветствие использует существующий знак ара, мягкий ореол, траектории сообщений и акцентное перо; 3D-модель не требуется.
