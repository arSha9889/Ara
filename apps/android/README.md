# AraChat Android

Нативный Android-клиент AraChat на React Native. Минимальная версия ОС — Android 13 (API 33), идентификатор приложения — `arachat.messenger`.

Реализация Android v1 завершена. До публичного релиза остаются проверки на
физических устройствах, настройка production-инфраструктуры push, выпуск
подписанного APK и публикация в RuStore; полный чек-лист находится в
`../../plans/android-rustore-plan.md`.

## Локальная подготовка

Перед первой сборкой нужны Node.js 22+, JDK 17 и Android SDK. Для текущей версии React Native установите следующие пакеты SDK:

```sh
sdkmanager "platforms;android-37.0" "build-tools;37.0.0" "ndk;27.1.12297006" "cmake;3.22.1"
```

Задайте `JAVA_HOME`, `ANDROID_HOME` и `ANDROID_SDK_ROOT` для JDK 17 и корня Android SDK. Затем из корня репозитория установите зависимости. Gradle настроен на корневой `node_modules` монорепозитория:

```sh
npm install
```

## Адрес API

Клиент не содержит встроенного адреса production API. Передайте согласованный **HTTPS**-адрес при сборке через Gradle-свойство `ARACHAT_API_BASE_URL`:

```sh
./android/gradlew -p android assembleDebug -PARACHAT_API_BASE_URL=https://<your-api-host>
```

Значение является конфигурацией, а не секретом. Не добавляйте в него токены, пароли или query-параметры. Без адреса API экран входа честно сообщит, что подключение ещё не настроено.

## Обновления Android

APK не содержит URL страницы загрузки или карточки RuStore. После входа клиент получает metadata обновления из защищённого `GET /api/releases/android`. Серверу передаются только подтверждённые значения окружения:

- `NEXUS_ANDROID_LATEST_VERSION_CODE`;
- `NEXUS_ANDROID_DIRECT_DOWNLOAD_URL` для официальной HTTPS-страницы загрузки;
- `NEXUS_ANDROID_RUSTORE_APP_URL` и `NEXUS_ANDROID_RUSTORE_INSTALLER_PACKAGE` для RuStore.

Подтверждённая официальная страница прямого APK — `https://aramsg.ru/download`. RuStore — основной магазинный канал, но URL карточки и package installer не вносятся до её публикации и проверки фактических значений. Можно настроить только direct APK или только RuStore. Для APK из RuStore приложение предлагает страницу RuStore, для прямой установки — официальную страницу загрузки; при неопределённом источнике ссылка не показывается. Клиент не скачивает и не устанавливает APK самостоятельно: установку всегда подтверждает Android.

## Локальная конфигурация push и release-подписи

Для RuStore Push один раз создайте `android/push.properties` из `android/push.properties.example` и укажите ID проекта из кабинета RuStore. Этот ID передаётся в APK как конфигурация SDK, но файл всё равно исключён из Git, чтобы настройки окружений не смешивались. Его также можно передать при сборке как `-PARACHAT_RUSTORE_PUSH_PROJECT_ID=...`. Не добавляйте в этот файл service token или другие секреты. Прямой APK не содержит Firebase SDK и не получает фоновые push-уведомления.

Release-сборка использует только production-ключ. Она не может подписываться debug-ключом. Один раз создайте локальный файл из шаблона и заполните его данными своего ключа:

```sh
cd apps/android
cp android/release-signing.properties.example android/release-signing.properties
chmod 600 android/release-signing.properties
```

В `android/release-signing.properties` укажите абсолютный путь к `.p12`, alias и оба пароля. Этот файл исключён из Git; не отправляйте его содержимое в чат.

## Команды

Из `apps/android`:

```sh
npm run start
npm run android
npm run typecheck
npm test
npm run android:assemble:debug
npm run android:lint
./android/gradlew -p android assembleRelease
```

Для `android:assemble:debug` и запуска на устройстве при необходимости передавайте `-PARACHAT_API_BASE_URL` напрямую в Gradle, как в примере выше.

## Границы текущей основы

- Сессия и app-scoped `device_id` хранятся через Android Keystore (`react-native-keychain`), не в `AsyncStorage`.
- Обычный вход с e-mail и паролем использует существующий `/api/auth/login` после настройки адреса API.
- Навигация включает «Чаты», «Поиск», «Профиль» и «Настройки»; широкий экран использует двухпанельную композицию для чатов.
- После входа приложение открывает один защищённый WebSocket к `/ws`: новые сообщения, изменения, прочтение и presence синхронизируются без ручного обновления. В фоне соединение закрывается, а при возврате приложение переподключается и повторно синхронизирует чаты.
- Android использует RuStore Push только для приложения, установленного точным installer package RuStore `ru.vk.store`. Для прямой, Google Play и неопределённой установки push-провайдер не инициализируется, push-токен не запрашивается и системное разрешение на уведомления не предлагается. Доставка для RuStore работает при настроенных `NEXUS_RUSTORE_PUSH_PROJECT_ID` и `NEXUS_RUSTORE_PUSH_SERVICE_TOKEN`.
- Личные звонки 1:1 используют relay-only TURN, а native-аудиосессия запрашивает audio focus и позволяет выбрать телефон, динамик, проводную или Bluetooth-гарнитуру. Во время активного вызова Android foreground service удерживает медиа и защищённый WebSocket в фоне; видеозвонок при уходе из приложения переходит в системную картинку-в-картинке. Входящие вызовы после выгрузки процесса по-прежнему требуют отдельной проверки полного push/call-flow на физических устройствах. До Android-to-Web и Android-to-Android проверки через coturn на физических устройствах эта функция не должна заявляться как готовая для RuStore.
