# Закрытая бета AraChat для Windows

Этот процесс публикует проверенный Windows x64 NSIS-пакет для закрытой беты.
Установщик становится доступен по общей ссылке **11 ноября 2026 года в 10:00
МСК** (`2026-11-11T07:00:00Z`). До этого момента API отвечает `404`, даже если
файл уже скопирован на сервер.

> В этой версии нет технического лимита на 30 скачиваний. Доступ к первым 30
> тестировщикам контролируется вручную: не публикуйте ссылку в открытых каналах
> и рассылайте её только выбранным людям.

## Условия перед публикацией

1. В GitHub Actions вручную запущен workflow **Desktop packages** для
   зафиксированного коммита.
2. Скачаны артефакты `AraChat-windows-x64` с установщиком `.exe` и
   `AraChat-windows-x64-checksum` с файлом `.sha256` из того же запуска.
3. На чистой Windows 10 или 11 x64 подтверждены установка, запуск, вход,
   восстановление сессии, личный чат, файл/медиа, WebSocket reconnect и выход.
4. Выполнена CORS preflight-проверка для `Origin: http://tauri.localhost` по
   [инструкции деплоя](DEPLOYMENT.md#5-cors-для-desktop-клиента).
5. Нет известных критических или высокоприоритетных дефектов.

## Проверка пакета

На тестовой Windows в каталоге с двумя файлами выполните:

```powershell
Get-FileHash .\<имя-установщика>.exe -Algorithm SHA256
Get-Content .\<имя-установщика>.exe.sha256
```

Значения хеша должны совпадать. Не подменяйте установщик или файл контрольной
суммы после этой проверки.

## Подготовка и запуск на сайте

1. На сервере создайте закрытый каталог релиза и скопируйте в него оба файла из
   проверенного CI-артефакта. Не используйте публичный `/var/lib/arachat/downloads`:

   ```bash
   install -d -m 0750 /var/lib/arachat/releases
   install -m 0640 <имя-установщика>.exe /var/lib/arachat/releases/
   install -m 0640 <имя-установщика>.exe.sha256 /var/lib/arachat/releases/
   ```

2. В `deploy/production.env` укажите имя проверенного файла
   `AraChat_0.9.3_x64-setup.exe` и уже утверждённое время старта. Время хранится
   в UTC:

   ```dotenv
   NEXUS_WINDOWS_BETA_RELEASES_DIR=/var/lib/arachat/releases
   NEXUS_WINDOWS_BETA_INSTALLER_FILENAME=AraChat_0.9.3_x64-setup.exe
   NEXUS_WINDOWS_BETA_RELEASE_AT=2026-11-11T07:00:00Z
   ```

   `07:00:00Z` соответствует `10:00` по Москве. SHA-256 файла:

   ```text
   c152814076b9af94f31a2482af567ef346925acca3e3977015f8aa94669495ad
   ```

   Обе переменные обязательны: неполная конфигурация не даст API запуститься,
   чтобы релиз не открылся случайно.

3. До времени запуска разверните API и web:

   ```bash
   docker compose --env-file deploy/production.env -f deploy/compose.production.yml up -d --build api web
   ```

4. Проверьте подготовку до 10:00 МСК:

   ```bash
   curl -sS https://aramsg.ru/api/releases/windows/beta
   curl -sS -o /dev/null -w '%{http_code}\n' https://aramsg.ru/api/releases/windows/beta/download
   ```

   Первый запрос должен содержать `"is_available":false`, второй — вернуть
   `404`. В 10:00 МСК API автоматически начнёт отдавать файл, а страница
   `/download?platform=windows` обновит кнопку без нового деплоя.

5. После старта убедитесь, что `GET /api/releases/windows/beta` возвращает
   `"is_available":true`, скачайте файл с сайта и ещё раз сравните SHA-256 с
   опубликованным `.sha256`.

## Откат

Очистите **обе** переменные `NEXUS_WINDOWS_BETA_RELEASE_AT` и
`NEXUS_WINDOWS_BETA_INSTALLER_FILENAME` в `deploy/production.env`, затем
пересоздайте API-контейнер:

```bash
docker compose --env-file deploy/production.env -f deploy/compose.production.yml up -d --no-deps --build api
```

После этого удалите отозванный `.exe` и `.sha256` из
`/var/lib/arachat/releases`. API немедленно вернёт `404` для ссылки загрузки.

## Переход на обновления из приложения

Версия `0.9.3` не содержит Tauri updater-плагина и не может скачать следующую
версию сама. Для первого перехода нужно вручную передать тестировщикам
проверенный установщик `0.9.4` через этот же закрытый beta-канал. После запуска
`0.9.4` последующие версии пользователи смогут проверять и устанавливать в
**Настройки → О приложении → Обновления Desktop**.

Не заменяйте API-маршрут Windows-беты манифестом updater: это разные каналы.
Подписанные updater-артефакты, их публикация и откат описаны в
[инструкции обновлений Desktop](DESKTOP_UPDATES.md).
