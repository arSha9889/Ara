# Подписанные обновления AraChat Desktop

Этот контур обновляет собранный Tauri Desktop-клиент по HTTPS. Клиент получает
`https://aramsg.ru/desktop-updates/latest.json`, скачивает указанный в нём
артефакт и перед установкой проверяет Ed25519-подпись. Манифест общедоступен,
но не даёт возможности подменить обновление без приватного ключа.

> `0.9.3` не содержит updater-плагина. Его нельзя обновить из приложения.
> Первый updater-enabled выпуск должен быть `0.9.4` или выше и устанавливается
> пользователю вручную через текущий Windows beta-канал.

## Ключ подписи

Публичный ключ уже зашит в
[`apps/pc/src-tauri/tauri.conf.json`](../apps/pc/src-tauri/tauri.conf.json).
Он соответствует ключу релизного оператора:

- приватный ключ: `~/.config/arachat/tauri-updater.key`;
- пароль: macOS Keychain, service `AraChat Tauri Updater Signing Key`.

Никогда не коммитьте этот файл, его пароль, `.sig` вместо ожидаемого артефакта
или переменные `TAURI_SIGNING_PRIVATE_KEY*`. Потеря приватного ключа означает,
что уже установленный клиент больше нельзя будет обновлять доверенным способом.

В GitHub repository secrets добавьте оба значения без вывода их в терминал:

```bash
pbcopy < "$HOME/.config/arachat/tauri-updater.key"
# Вставьте буфер в TAURI_SIGNING_PRIVATE_KEY.

security find-generic-password -a "$USER" -s "AraChat Tauri Updater Signing Key" -w | pbcopy
# Вставьте буфер в TAURI_SIGNING_PRIVATE_KEY_PASSWORD.
```

Секреты нужны workflow **Desktop packages**. До их добавления запуск workflow
не должен использоваться для публикации updater-релиза.

## Подготовка сервера (один раз)

1. В `deploy/production.env` установите:

   ```dotenv
   ARACHAT_DESKTOP_UPDATES_DIR=/var/lib/arachat/desktop-updates
   ```

2. Создайте каталог для публичных, но только подписанных артефактов:

   ```bash
   install -d -m 0755 /var/lib/arachat/desktop-updates
   ```

3. Разверните изменённые `deploy/compose.production.yml` и
   `apps/web/nginx.conf.template`, затем пересоздайте web-контейнер:

   ```bash
   docker compose --env-file deploy/production.env -f deploy/compose.production.yml up -d --no-deps --build web
   ```

Nginx отдаёт каталог только по `/desktop-updates/`; `latest.json` запрещён к
долгому кэшированию, а версии артефактов кэшируются как неизменяемые.

## Публикация версии

1. Поднимите версию одинаково в `apps/pc/package.json`,
   `apps/pc/src-tauri/tauri.conf.json` и `apps/pc/src-tauri/Cargo.toml`.
   Версия должна быть валидным SemVer и больше предыдущего выпуска.
2. Запустите **Desktop packages** в GitHub Actions на зафиксированном коммите,
   указав заметки к релизу. Workflow собирает обычные установщики и отдельный
   артефакт `AraChat-updater-release` с подписанными файлами и `latest.json`.
3. На Windows 10/11 x64 проверьте обычный NSIS `.exe`: установку поверх
   предыдущей версии, вход, базовые чаты, медиа, WebSocket и выход. На macOS
   публикуйте обновление только после проверки подписи Developer ID и
   notarization.
4. Скачайте `AraChat-updater-release`. Сначала скопируйте в серверный каталог
   все новые неизменяемые артефакты и их `.sig`, затем последним замените
   `latest.json`:

   ```bash
   install -m 0644 AraChat_0.9.4_x64-setup.exe /var/lib/arachat/desktop-updates/
   install -m 0644 AraChat_0.9.4_x64-setup.exe.sig /var/lib/arachat/desktop-updates/
   install -m 0644 latest.json /var/lib/arachat/desktop-updates/latest.json
   ```

   Для macOS аналогично загрузите `.app.tar.gz` и его `.sig`. В `latest.json`
   публикуйте только те platform entries, чьи артефакты уже лежат на сервере.
5. Проверьте с внешней машины:

   ```bash
   curl --fail --silent --show-error https://aramsg.ru/desktop-updates/latest.json | jq .
   curl --fail --head https://aramsg.ru/desktop-updates/AraChat_0.9.4_x64-setup.exe
   ```

6. На тестовой машине с предыдущей updater-enabled версией откройте
   **Настройки → О приложении**, нажмите «Проверить обновления», затем
   «Скачать и установить» и «Перезапустить AraChat». Убедитесь, что версия
   изменилась и приложение запускается.

## Bootstrap c Windows beta `0.9.3`

Соберите и протестируйте `0.9.4`, затем опубликуйте его полный NSIS
установщик через инструкцию [Windows beta](WINDOWS_BETA.md). Пользователь
`0.9.3` устанавливает его вручную один раз. Не заявляйте, что `0.9.3`
обновится сам: в ней нет нужного нативного плагина.

## Откат и экстренный выпуск

Не удаляйте уже опубликованные updater-артефакты. Если проблема обнаружена до
массовой установки, верните предыдущий проверенный `latest.json` — это
остановит получение новой версии теми, кто ещё её не скачал. Клиент не
выполняет downgrade, поэтому уже обновившихся пользователей нельзя безопасно
вернуть на старую версию через этот канал. Для них выпустите исправление с
большей версией, например `0.9.5`.
