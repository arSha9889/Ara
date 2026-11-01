# AraChat macOS: карта миграции с Tauri/React на SwiftUI

## Статус документа

Этот документ составлен по фактическому коду desktop-клиента в `apps/pc`,
backend в `apps/api` и существующему iOS-проекту на Swift. Он фиксирует
границу функционального паритета для будущего нативного macOS-клиента в
`apps/macos`.

Текущий проект `apps/ios` не используется как источник бизнес-логики: в нём
есть демонстрационные данные и отключённые сценарии звонков. Его допускается
использовать только как пример организации SwiftUI-кода и визуальных токенов.

## 1. Исходная реализация и целевая архитектура

| Исходный модуль | Ответственность | Нативный модуль macOS |
| --- | --- | --- |
| `src/DesktopApp.jsx` | маршрутизация welcome/auth/workspace, восстановление сессии | `App/AppState.swift`, `App/AraChatMacApp.swift`, `Features/AppRootView.swift` |
| `src/components/Titlebar.jsx` и Tauri window API | кастомная верхняя панель окна | `App/AppWindowController.swift`, SwiftUI toolbar/AppKit bridge только при необходимости |
| `src/hooks/useSession.js` и `shared/session/secureSession.js` | access/refresh tokens, обновление и logout | `Core/Session/SessionStore.swift`, `Core/Keychain/KeychainStore.swift` |
| `src/hooks/usePreferences.js` | тема, язык, плотность, уведомления | `Core/Preferences/PreferencesStore.swift` |
| `src/shared/api/apiClient.js` | HTTP, ошибки API, адрес сервера | `Core/Networking/APIClient.swift`, `Core/Networking/APIConfiguration.swift` |
| `features/auth/*`, `LoginScreen`, `RegisterScreen` | вход, регистрация, e-mail verification | `Features/Auth/*` |
| `WorkspaceScreen` и `screens/workspace/*` | рабочее пространство, чаты, профиль, каналы, настройки | `Features/Workspace/*`, `Features/Chats/*`, `Features/Profile/*`, `Features/Settings/*` |
| `features/chats/realtimeClient.js` | WebSocket, ping/pong, reconnect | `Core/Realtime/RealtimeClient.swift` |
| `features/notifications/*` | история и системные уведомления | `Features/Notifications/*`, `Core/Notifications/DesktopNotificationService.swift` |
| `features/calls/*` | signalling, WebRTC, аудио/видео/экран | `Features/Calls/*`, внешний WebRTC adapter (см. раздел 8) |
| `shared/crypto/e2eeDesktop.js` | P-256 ECDH/ECDSA, HKDF, AES-GCM, trust state | `Core/E2EE/*` |

Целевая архитектура использует SwiftUI для представлений, `@MainActor`
наблюдаемые feature store/view model для UI-состояния, `actor` для сети,
Keychain и realtime, `URLSession` для REST и `URLSessionWebSocketTask` для
WebSocket. Токены не хранятся в `UserDefaults`.

## 2. Подтверждённые пользовательские сценарии

### 2.1 Старт и авторизация

| Сценарий | Фактическая реализация | Статус переноса |
| --- | --- | --- |
| Welcome-экран, выбор темы и языка | `WelcomeScreen.jsx`, `ThemeLanguageControls.jsx` | Не перенесён |
| Вход по e-mail и паролю | `LoginScreen.jsx` | Не перенесён |
| «Запомнить меня» и восстановление сессии | `useSession.js`, Tauri secure storage | Не перенесён |
| Фоновое обновление access token до истечения | `useSession.js` | Не перенесён |
| Выход с отзывом refresh token | `DesktopApp.jsx`, `authApi.js` | Не перенесён |
| Регистрация: страна, код e-mail, профиль, пароль, legal consent | `RegisterScreen.jsx` | Не перенесён |
| Открытие политики конфиденциальности и условий | `openLegalDocument.js` | Не перенесён |

Парольное восстановление поддержано backend API, но в текущем desktop UI
ссылка «Забыли пароль?» выводит информационное сообщение и не открывает
готовый сценарий. Нативный клиент не должен объявлять такую функцию
перенесённой, пока не будет подтверждён и реализован desktop-сценарий.

### 2.2 Рабочее пространство

| Сценарий | Исходные экраны | Статус переноса |
| --- | --- | --- |
| Навигация: чаты, группы, каналы, контакты, звонки, уведомления, профиль, настройки | `WorkspaceNavigation.jsx`, `WorkspaceScreen.jsx` | Не перенесён |
| Список, поиск, обновление и массовое скрытие личных чатов | `WorkspaceChatList.jsx` | Не перенесён |
| Поиск пользователя и создание личного чата | `ContactsPanel.jsx` | Не перенесён |
| Личный чат: история, отправка, reply, edit, delete, pin, reactions, read status | `ChatPanel.jsx`, `MessageContextMenu.jsx` | Не перенесён |
| Вложения, фото, видео, аудио, документы | `ChatPanel.jsx`, `MessageContent.jsx` | Не перенесён |
| Запись голосового сообщения и video note | `useMediaRecorder.js`, `ChatPanel.jsx` | Не перенесён |
| Группы: создание, участники, роли, owner transfer, invites, details | `GroupCreatePanel.jsx`, `GroupChatPanel.jsx`, `GroupDetailsPanel.jsx` | Не перенесён |
| Каналы: каталог, подписка, private invite, публикации, comments, moderation | `ChannelsPanel.jsx`, `ChannelChatPanel.jsx`, `ChannelCommentsPanel.jsx`, `ChannelDetailsPanel.jsx` | Не перенесён |
| Профиль: имя, username, аватар, AraChat ID | `ProfilePanel.jsx` | Не перенесён |
| Настройки внешнего вида, плотности, языка, уведомлений, PIN, e-mail/password, устройства, история | `SettingsPanel.jsx` | Не перенесён |
| История уведомлений и переход к цели уведомления | `NotificationsPanel.jsx`, `notificationTarget.js` | Не перенесён |
| Системные уведомления | Tauri notification plugin | Не перенесён |
| Аудио/видеозвонок и демонстрация экрана | `useDirectCall.js`, `CallOverlay.jsx`, `CallsPanel.jsx` | Заблокирован внешней WebRTC-зависимостью |

## 3. REST API: фактический контракт desktop-клиента

Все авторизованные запросы используют `Authorization: Bearer <access token>`.
Адрес API задаётся на desktop через `VITE_API_BASE_URL`; в Swift-клиенте он
будет задаваться через `xcconfig` и `Info.plist` build setting. Для development
исходный клиент использует `http://localhost:8000`.

### Авторизация и профиль

| Метод и путь | Назначение |
| --- | --- |
| `POST /api/auth/login` | вход: `email`, `password`, `device_id` |
| `POST /api/auth/refresh` | обновление по `refresh_token` |
| `POST /api/auth/logout` | завершение сессии по `refresh_token` |
| `POST /api/auth/email-verification/start` | запрос кода: `email`, `device_id`, `language` |
| `POST /api/auth/email-verification/confirm` | проверка `verification_id`, `code` |
| `POST /api/auth/register/complete` | завершение регистрации |
| `POST /api/auth/password/change/start` | запрос кода для смены пароля |
| `POST /api/auth/password/change/confirm` | завершение смены пароля |
| `POST /api/auth/email/change/start` | запрос кода для смены e-mail |
| `POST /api/auth/email/change/confirm` | завершение смены e-mail |
| `GET /api/users/me` | текущий профиль |
| `PATCH /api/users/me/profile` | профиль, язык, тема, phone visibility, avatar |
| `GET /api/users/search?query=` | публичный поиск пользователя |
| `POST /api/uploads/avatar` | multipart upload аватара |

### Чаты, группы и каналы

| Метод и путь | Назначение |
| --- | --- |
| `GET, DELETE /api/chats` | список чатов / скрыть все personal chats |
| `GET /api/chats/{chat_id}` | детали чата |
| `POST /api/chats/direct/users/{user_id}` | создать или открыть direct chat |
| `GET, POST /api/chats/{chat_id}/messages` | история / отправка сообщения |
| `GET, PATCH, DELETE /api/chats/{chat_id}/messages/{message_id}` | сообщение, edit, delete |
| `POST /api/chats/{chat_id}/messages/{message_id}/pin` | pin/unpin |
| `POST /api/chats/{chat_id}/messages/{message_id}/reactions` | реакция |
| `POST /api/chats/{chat_id}/read` | отметить сообщения прочитанными |
| `GET /api/chats/{chat_id}/e2ee-keys` | ключи устройств участников direct chat |
| `POST /api/chats/groups` | создать группу |
| `PATCH, DELETE /api/chats/groups/{chat_id}` | редактировать / удалить группу |
| `POST /api/chats/groups/{chat_id}/leave` | покинуть группу |
| `GET, POST /api/chats/groups/{chat_id}/members` | участники / добавить участника |
| `PATCH, DELETE /api/chats/groups/{chat_id}/members/{user_id}` | роль / удалить участника |
| `POST /api/chats/groups/{chat_id}/ownership` | передать владение |
| `GET, POST, DELETE /api/chats/groups/{chat_id}/invite` | invite state / создать / отозвать invite |
| `GET /api/chats/branches/public` | каталог открытых каналов |
| `POST, DELETE /api/chats/branches/{chat_id}/subscribe` | подписка/отписка |
| `POST /api/chats/branches/private` | создать private channel |
| `POST /api/chats/branches/join` | вступить по invite token |
| `PATCH, DELETE /api/chats/branches/{chat_id}` | изменить / удалить private channel |
| `POST /api/chats/branches/{chat_id}/leave` | покинуть private channel |
| `GET, POST, DELETE /api/chats/branches/{chat_id}/invite` | invite state / создать / отозвать invite |
| `GET /api/chats/branches/{chat_id}/members` | участники канала |
| `PATCH, DELETE /api/chats/branches/{chat_id}/members/{user_id}` | роль / удалить участника |
| `PATCH /api/chats/branches/{chat_id}/notifications` | переключить уведомления канала |
| `PATCH /api/chats/branches/{chat_id}/messages/{post_id}/comments-enabled` | переключить комментарии к публикации |
| `GET, POST /api/chats/{chat_id}/messages/{post_id}/comments` | комментарии |
| `PATCH, DELETE /api/chats/{chat_id}/comments/{comment_id}` | изменить / удалить комментарий |
| `POST /api/uploads` | multipart обычного вложения |
| `POST /api/uploads/e2ee` | multipart зашифрованного вложения |

### Уведомления, безопасность и звонки

| Метод и путь | Назначение |
| --- | --- |
| `GET /api/notifications` | история уведомлений |
| `POST /api/notifications/read` | прочитать отдельные или все уведомления |
| `DELETE /api/notifications/history` | очистить историю |
| `GET, DELETE /api/devices`, `GET /api/login-history` | активные устройства и история входов |
| `POST /api/security/pin/create`, `POST /api/security/pin/reset` | создать/сменить PIN |
| `PUT /api/security/e2ee/web-key` | зарегистрировать E2EE public keys устройства |
| `GET /api/calls/ice-servers` | TURN configuration, policy `relay` |
| `GET /api/calls/history` | история звонков |

## 4. Realtime: подтверждённый WebSocket-протокол

Endpoint: `ws://` или `wss://` от API host с путём `/ws`.

1. После открытия клиент отправляет `{"event":"connection.authenticate","token":"..."}`.
2. При `connection.authenticated` начинается heartbeat: `ping` раз в 25 секунд,
   тайм-аут `pong` — 10 секунд.
3. При сетевом закрытии выполняется exponential reconnect от 1 секунды до
   15 секунд. При `connection.rejected` reconnect прекращается.
4. Клиент подписывается на открытые чаты событием `chat.subscribe` и отписывается
   через `chat.unsubscribe`.

События, обрабатываемые текущим desktop-клиентом:

- `message.created`, `message.updated`, `message.deleted`, `message.pin_updated`,
  `message.read`, `message.reaction_updated`;
- `typing.started`, `typing.stopped`, `file.uploading`, `voice.uploading`;
- `presence.active`, `presence.status`;
- `notification.created`;
- `group.updated`, `group.deleted`, `group.member_added`, `group.member_left`,
  `group.member_removed`, `group.member_role_updated`, `group.ownership_transferred`;
- channel lifecycle and membership events, которые вызывают resync чата;
- `call.invite`, `call.accept`, `call.reject`, `call.cancel`, `call.end`,
  `call.connected`, `call.offer`, `call.answer`, `call.ice_candidate`,
  `call.media_state`, `call.failed`.

## 5. Локальные данные и миграция

| Данные | Сейчас | Целевое хранение | Стратегия |
| --- | --- | --- | --- |
| Refresh token | системное secure storage Tauri | Keychain | Нельзя безопасно читать напрямую из нового приложения. Пользователь входит один раз; новый refresh token хранится в Keychain. |
| Access token | память React | память `SessionStore` | Не сохранять на диск. |
| Temporary refresh token («не запоминать») | память React | память `SessionStore` | Удаляется при завершении приложения. |
| Preferences | `localStorage` key `arachat-desktop-preferences` | `UserDefaults` suite приложения | Тема, язык, palette, density, sound, previews, notifications переносятся только если будет добавлен явный экспорт из legacy-клиента; текущий sandbox Tauri недоступен нативному приложению. |
| Device ID | browser/Tauri storage | Keychain-backed stable UUID | Новый device ID регистрируется сервером; не подменять legacy ID. |
| E2EE private keys and trust records | IndexedDB | Keychain (key bytes) + Application Support (trust metadata) | Создать новую device identity и зарегистрировать её в API. Существующие web keys не экспортируются без отдельного безопасного migration flow. |
| Кэш сообщений | state React | на первом этапе не хранится между запусками | Сервер остаётся источником истины; при необходимости добавить шифрованный кэш отдельно. |

## 6. E2EE: подтверждённая совместимость

Нативная реализация должна быть полностью совместима с
`E2EE_WEB_ALGORITHM = ECDH_P256_HKDF_SHA256_A256GCM_ECDSA_P256`.

- Key agreement: P-256 ECDH, raw public key в Base64.
- Signature: P-256 ECDSA SHA-256, подпись в raw IEEE P1363 (`r || s`) Base64.
- KDF: HKDF-SHA-256, 32-byte random salt, `info`:
  `AraChat E2EE Web v1|{chatId}|{senderId}|{recipientId}`.
- Cipher: AES-256-GCM, 12-byte IV; ciphertext в envelope содержит ciphertext
  с authentication tag в конце, как результат Web Crypto API.
- Additional authenticated data:
  `AraChat E2EE Web v1|{chatId}|{senderId}|{recipientId}`.
- Envelope is JSON with `version`, `algorithm`, `sender_device_id`,
  `sender_ephemeral_public_key`, `sender_signing_public_key`, `recipients`,
  `signature`.
- Перед signing/verifying сериализуется canonical JSON с recipients,
  отсортированными по строковому recipient key. В canonical payload отсутствует
  `signature`.
- Вложение использует независимый 32-byte AES key и AAD
  `AraChat E2EE attachment v1|{chatId}|{senderId}`.

Для Swift допустим CryptoKit только с явным преобразованием форматов:
`P256.Signing.ECDSASignature.rawRepresentation`, AES-GCM ciphertext/tag и raw
P-256 key representation должны быть проверены test vectors. До появления
проверенных test vectors запрещено объявлять E2EE-перенос завершённым.

## 7. Визуальные, локализационные и accessibility-требования

- Локали: `ru`, `en`, `kk`; пользовательские строки не размещаются прямо во
  view, а хранятся в String Catalog.
- Тема: `light` / `dark`; palette desktop: `green`, `cyan`, `yellow`, `orange`;
  плотность: `comfortable` / `compact`.
- Минимальный размер окна parity с Tauri: 960 × 680; стандартные macOS toolbar,
  menu commands и keyboard shortcuts предпочтительнее имитации веб-контролов.
- Все иконки должны иметь единый SF Symbols/asset strategy. Интерактивные
  icon-only controls получают `accessibilityLabel`.
- Формы используют `@FocusState`; после validation error фокус остаётся
  видимым и переходит к первой ошибке. VoiceOver labels и selected/disabled
  state обязательны.
- Material/transparency отключается или уменьшается при системном
  `accessibilityReduceTransparency`; анимации уважают `accessibilityReduceMotion`.

## 8. Блокер звонков и необходимое решение

Текущий desktop-клиент использует browser primitives `RTCPeerConnection`,
`getUserMedia`, `getDisplayMedia`, `MediaStream` и `MediaRecorder`.
Стандартные публичные macOS frameworks дают AVFoundation/ScreenCaptureKit,
но **не предоставляют WebRTC peer connection, SDP negotiation, ICE и TURN
transport**. В Xcode найден только внутренний WebKit `libwebrtc.tbd`, который
не является публичным API и не может использоваться в распространяемом
macOS-приложении.

Для сохранения функционального паритета нужен внешний поддерживаемый WebRTC
XCFramework/Swift package с macOS support и приемлемой лицензией. Решение
должно определить:

1. разрешённую библиотеку и закреплённую версию;
2. лицензионную политику для поставки с AraChat;
3. допустимость загрузки зависимости из сети в CI или необходимость хранить
   проверенный binary artifact в контролируемом registry;
4. минимальную версию macOS для ScreenCaptureKit и system-audio capture.

Пока решения нет, запрещено заменять звонки заглушкой или выпускать Swift
клиент как функционально эквивалентный. Работа над не зависящими от WebRTC
слоями может продолжаться после подтверждения выбранного способа поставки.

## 9. Сборка, выпуск и CI

Целевая структура:

```text
apps/macos/
  AraChatMac.xcodeproj/
  AraChatMac/
  AraChatMacTests/
  Config/
  Scripts/
```

- `Debug.xcconfig` задаёт локальный API URL, `Release.xcconfig` не содержит
  production secret и получает `ARACHAT_API_BASE_URL` на CI.
- `xcodebuild` собирает `Release` для `arm64` в отдельный build directory.
- Скрипт создаёт DMG из `.app`; затем CI запускает `hdiutil verify`.
- Workflow `Desktop packages` остаётся ручным. macOS matrix entry на
  `macos-15` будет переключена на Swift-клиент только после прохождения всех
  критериев parity. Windows Tauri job остаётся без изменений.
- Developer ID certificate и notarization credentials задаются только через
  GitHub Secrets. Без них CI может выпускать unsigned DMG, но не должен
  сообщать об успешной notarization.

## 10. Критерии переключения macOS CI

Переключение macOS job допустимо только когда:

1. все сценарии из раздела 2 имеют нативную рабочую реализацию;
2. REST и WebSocket контракты подтверждены автоматическими тестами;
3. E2EE имеет совместимые test vectors, проверку шифрования/расшифрования с
   current desktop client и проверку отклонения подменённой подписи;
4. звонки, запись медиа и screen sharing проверены с утверждённой native
   WebRTC реализацией на физическом Apple Silicon Mac;
5. `xcodebuild test`, release build, DMG build и `hdiutil verify` проходят;
6. протокол ручного workflow GitHub Actions публикует ARM64 DMG artifact;
7. нет случайных build artifacts в git и `git diff --check` проходит.

