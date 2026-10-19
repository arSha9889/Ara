# AraChat Desktop

Отдельный desktop-клиент AraChat для macOS и Windows на Tauri 2, Vite и React.
Production-сборки обращаются к API на `https://aramsg.ru`.

Техническое состояние и приоритетный остаток работ ведутся в
[плане Desktop](../../plans/desktop-frontend-plan.md). Этот README описывает
только запуск, сборку и реально реализованные контуры.

## API и окружения

- `npm --workspace @arachat/desktop run dev` по умолчанию использует локальный
  API `http://localhost:8000`;
- для личного стенда скопируйте `.env.example` в `.env.local` и укажите
  `VITE_API_BASE_URL` без завершающего `/`;
- production-адрес определён в отслеживаемом `.env.production`. Он публичный и
  встраивается в приложение при сборке, поэтому секреты туда добавлять нельзя.

Для production API нужны CORS origins `tauri://localhost` (macOS/Linux) и
`http://tauri.localhost` (Windows). Их настройка описана в
[docs/DEPLOYMENT.md](../../docs/DEPLOYMENT.md).

## Локальный запуск

Из корня репозитория:

```bash
npm install
npm run dev:desktop
```

Для запуска нативного окна необходимы Rust toolchain, системные зависимости
Tauri и Node.js 22+:

```bash
npm run tauri:desktop -- dev
```

## Проверка и сборка

Production-сборка frontend:

```bash
npm run build:desktop
```

Модульные тесты записи медиа:

```bash
node --test apps/pc/src/features/chats/useMediaRecorder.test.js
```

Сборка DMG на macOS Apple Silicon:

```bash
npm --workspace @arachat/desktop run tauri -- build --bundles dmg
```

Артефакт создаётся в
`apps/pc/src-tauri/target/release/bundle/dmg/`. На 17 октября 2026 года
production frontend, release-бинарник и локальный ARM64 `.dmg` успешно
собраны; целостность образа проверена `hdiutil verify`.

## Пакеты для macOS и Windows

Ручной workflow **Desktop packages** в GitHub Actions создаёт:

- `.dmg` для Apple Silicon на `macos-14`;
- NSIS `.exe` для Windows x64 на `windows-latest`.

Запустите его во вкладке **Actions**, выберите **Desktop packages** и нажмите
**Run workflow**. Готовые файлы появятся в artifacts этого запуска.

Workflow формирует пакеты, но не заменяет ручную проверку установки. Windows
пакет и пользовательские сценарии на Windows должны быть проверены отдельно.
До настройки сертификата подписи Windows, Apple Developer ID и notarization
macOS пакеты нельзя считать готовыми для публичного распространения.

## Реализовано в клиенте

- кастомное нативное окно, темы и локализация RU/EN;
- 2D-приветствие, вход и регистрация по e-mail через реальный API;
- безопасное сохранение refresh-токена в системном keychain и обновление сессии;
- личные чаты, поиск пользователей, текст, файлы/медиа, голосовые сообщения,
  видеозаметки, реакции, ответы, редактирование, удаление и закрепление;
- WebSocket, typing/presence, read receipts и reconnect;
- клиентский контур E2EE для личных чатов и вложений;
- профиль, настройки, устройства, PIN, смена пароля/e-mail, история входов;
- центр и нативные уведомления для событий realtime в запущенном приложении;
- личные аудио-/видеозвонки и демонстрация экрана/окна через WebRTC.

## Ограничения и следующий фокус

- Функциональность реализована в коде, но не вся подтверждена на физических
  устройствах и на Windows. Перед бета-выпуском требуются сквозные тесты с
  реальным API, CORS, WebSocket, медиа и WebRTC.
- В клиенте пока нет входа по AraChat ID/PIN, восстановления пароля, OAuth
  Yandex/VK, управления аватаром/приватностью профиля, поддержки, жалоб и
  блокировок.
- Контур E2EE требует отдельной security review и межплатформенной проверки;
  не следует обещать криптографическую готовность только по наличию кода.
- В `tauri.conf.json` CSP временно отключена (`"csp": null`); до публичного
  выпуска нужна строгая политика источников.
- Автообновления, фоновая доставка и автозапуск не реализованы.

Полный список приоритетов и критериев готовности — в
[плане Desktop](../../plans/desktop-frontend-plan.md).
