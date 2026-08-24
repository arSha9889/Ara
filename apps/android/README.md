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

## Команды

Из `apps/android`:

```sh
npm run start
npm run android
npm run typecheck
npm test
npm run android:assemble:debug
npm run android:lint
```

Для `android:assemble:debug` и запуска на устройстве при необходимости передавайте `-PARACHAT_API_BASE_URL` напрямую в Gradle, как в примере выше.

## Границы текущей основы

- Сессия и app-scoped `device_id` хранятся через Android Keystore (`react-native-keychain`), не в `AsyncStorage`.
- Обычный вход с e-mail и паролем использует существующий `/api/auth/login` после настройки адреса API.
- Навигация включает «Чаты», «Поиск», «Профиль» и «Настройки»; широкий экран использует двухпанельную композицию для чатов.
- После входа приложение открывает один защищённый WebSocket к `/ws`: новые сообщения, изменения, прочтение и presence синхронизируются без ручного обновления. В фоне соединение закрывается, а при возврате приложение переподключается и повторно синхронизирует чаты.
- Push, обращения в поддержку и вложения пока не реализованы. Настройки не выдают их за доступные.
- Действие звонка является только UI-заглушкой и показывает «Звонки скоро появятся»; оно не запрашивает микрофон и не начинает WebRTC-вызов.
