# AraChat Android

Нативный Android-клиент AraChat на React Native. Минимальная версия ОС — Android 13 (API 33), идентификатор приложения — `arachat.messenger`.

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

## Локальная конфигурация push и release-подписи

Для RuStore + FCM поместите загруженный из Firebase файл `google-services.json` в `android/app/google-services.json`. Файл исключён из Git. Service account JSON Firebase относится только к backend: не храните его в проекте или APK.

Для RuStore Push один раз создайте `android/push.properties` из `android/push.properties.example` и укажите ID проекта из кабинета RuStore. Этот ID передаётся в APK как конфигурация SDK, но файл всё равно исключён из Git, чтобы настройки окружений не смешивались. Его также можно передать при сборке как `-PARACHAT_RUSTORE_PUSH_PROJECT_ID=...`. Не добавляйте в этот файл service token или другие секреты.

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
- Регистрация Android push-токенов RuStore и FCM готова, но delivery на сервере до проверки на физическом подписанном устройстве отключён. Поэтому приложение не обещает фоновые уведомления.
- Личные аудиозвонки 1:1 работают только в foreground: WebRTC использует relay-only TURN, а native-аудиосессия запрашивает audio focus и позволяет выбрать телефон, динамик, проводную или Bluetooth-гарнитуру. При уходе приложения в фон звонок завершается; входящие звонки в фоне и после выгрузки приложения не поддерживаются. До Android-to-Web и Android-to-Android проверки через coturn на физических устройствах эта функция не должна заявляться как готовая для RuStore.
