# AraChat Desktop

Отдельный desktop-клиент AraChat для macOS и Windows. Это frontend-первый этап: приветственная сцена, вход и регистрация пока не подключены к production API.

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

## Текущий статус

- Tauri 2 и Vite/React подготовлены;
- окно 1200 x 800 с кастомной верхней панелью;
- есть светлая и тёмная темы, русский и английский языки;
- есть интерактивные UI-сценарии приветствия, входа и трёхшаговой регистрации;
- настоящая авторизация, почтовый код, OAuth и 3D-модель ара будут подключены в следующих этапах.
