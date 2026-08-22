# Изолированный staging API на существующем VPS

Эта инструкция поднимает отдельное тестовое окружение AraChat рядом с уже
работающим сайтом. Оно не использует production Compose и **не занимает порты
80/443**: API публикуется Docker только на `127.0.0.1:18000`. Внешний HTTPS
поддомен подключается одним дополнительным правилом в уже работающем Caddy или
Nginx.

> Не заменяйте существующий `Caddyfile`, конфигурацию Nginx или Docker Compose
> сайта целиком. Добавляйте только блок для нового staging-поддомена.

## 1. Что потребуется

- VPS с Docker Engine и Docker Compose plugin;
- отдельный DNS-поддомен, например `staging.example.ru`, с A-записью на IPv4 VPS;
- работающий HTTPS reverse proxy на VPS (Caddy либо Nginx);
- SMTP для тестовых писем. Используйте отдельный staging sender и контролируемый
  почтовый ящик, а не production-учётные данные;
- клон этого репозитория на VPS.

Порт `18000` не нужно открывать в UFW, в панели провайдера или наружу: он
слушает только loopback-интерфейс. Снаружи должны быть доступны лишь уже
используемые портами reverse proxy `80/443`.

## 2. Получить актуальный код и создать конфигурацию

На VPS, в каталоге репозитория:

```sh
git pull --ff-only
cp deploy/staging.env.example deploy/staging.env
chmod 600 deploy/staging.env
nano deploy/staging.env
```

Заполните в `deploy/staging.env`:

1. `NEXUS_PUBLIC_DOMAIN` — только hostname, например `staging.example.ru`;
2. `NEXUS_ALLOWED_ORIGINS`, `NEXUS_PUBLIC_BASE_URL` и
   `NEXUS_STORAGE_PUBLIC_BASE_URL` — тот же адрес с `https://`;
3. отдельный пароль PostgreSQL, а также два независимых секрета. Для каждого
   значения выполните локально на VPS `openssl rand -hex 32`;
4. SMTP-параметры и отдельный адрес отправителя.

Не оставляйте `replace-with-...`, `example.ru` или одинаковые секреты. Файл
`deploy/staging.env` игнорируется Git и не должен покидать VPS.

## 3. Подключить HTTPS-поддомен к существующему reverse proxy

Перед этим убедитесь, что DNS уже указывает на VPS:

```sh
dig +short staging.example.ru A
```

### Если на VPS используется Caddy

Добавьте **отдельный** блок в текущий Caddyfile, сохранив остальные сайты:

```caddyfile
staging.example.ru {
    encode zstd gzip
    reverse_proxy 127.0.0.1:18000
}
```

Проверьте и примените конфигурацию штатной командой текущей установки Caddy.
Для systemd-установки это обычно:

```sh
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Если Caddy работает в контейнере, используйте путь и команду reload из его
существующего Compose-проекта. Не запускайте второй Caddy из этого репозитория:
он конфликтовал бы с портами `80/443`.

### Если на VPS используется Nginx

Создайте отдельный виртуальный хост, сохранив актуальную схему сертификатов
сервера. Для уже выпущенного сертификата типовой HTTPS-блок выглядит так:

```nginx
server {
    listen 443 ssl http2;
    server_name staging.example.ru;

    ssl_certificate     /etc/letsencrypt/live/staging.example.ru/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/staging.example.ru/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:18000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
    }
}
```

Если в вашей Nginx-конфигурации не определена переменная `$connection_upgrade`,
добавьте один раз внутри контекста `http { ... }`:

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}
```

Выпустите сертификат привычным для VPS способом, затем проверьте и примените
конфигурацию:

```sh
sudo nginx -t
sudo systemctl reload nginx
```

## 4. Проверить Compose и запустить staging

Из корня репозитория на VPS:

```sh
docker compose --env-file deploy/staging.env -f deploy/compose.staging.yml config -q
docker compose --env-file deploy/staging.env -f deploy/compose.staging.yml up -d --build
docker compose --env-file deploy/staging.env -f deploy/compose.staging.yml ps
```

Первый запуск собирает API, создаёт отдельные Docker volumes, применяет Alembic
миграции и запускает сервис. Он не подключается к production PostgreSQL, Redis
или object storage.

Если API не перешёл в `healthy`, смотрите только логи staging-контура:

```sh
docker compose --env-file deploy/staging.env -f deploy/compose.staging.yml logs --tail=200 api
docker compose --env-file deploy/staging.env -f deploy/compose.staging.yml logs --tail=100 postgres redis
```

## 5. Smoke-check

Сначала с самого VPS:

```sh
curl -fsS http://127.0.0.1:18000/health
curl -fsS http://127.0.0.1:18000/health/infrastructure
```

Ожидаемые ответы:

```json
{"status":"ok","service":"arachat-api"}
{"database":"ok","redis":"ok","storage":"ok"}
```

Затем с компьютера или с VPS проверьте публичный HTTPS:

```sh
curl -fsS https://staging.example.ru/health
curl -fsS https://staging.example.ru/health/infrastructure
```

После этого создайте тестовый аккаунт на staging и подтвердите, что письмо
пришло на контролируемый ящик. Проверьте регистрацию, вход, refresh/logout и
восстановление пароля. Не используйте production-пароли или личные данные.

## 6. Подключить Android debug-сборку

На рабочем компьютере, в `apps/android`, соберите APK только с подтверждённым
HTTPS staging-адресом:

```sh
./android/gradlew -p android assembleDebug \
  -PARACHAT_API_BASE_URL=https://staging.example.ru
```

Установите созданный APK на эмулятор/тестовое Android-устройство и пройдите
реальный auth-flow. Не добавляйте адрес API в исходный код и не используйте
HTTP, IP-адрес или URL с query-параметрами: клиент намеренно принимает только
полный HTTPS URL.

## 7. Обновление и остановка staging

Для обновления:

```sh
git pull --ff-only
docker compose --env-file deploy/staging.env -f deploy/compose.staging.yml up -d --build
```

Чтобы остановить только контейнеры, сохранив staging-данные:

```sh
docker compose --env-file deploy/staging.env -f deploy/compose.staging.yml down
```

Не используйте `down -v`, если тестовые данные ещё нужны: эта команда удалит
volumes PostgreSQL, Redis и staging uploads.
