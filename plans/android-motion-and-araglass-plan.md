# Android motion и AraGlass: зафиксированный план

## Статус

**Решение зафиксировано, но ещё не реализовано.** Этот документ определяет
следующий UI-этап для `apps/android`: осмысленные motion-состояния и
Android-версию визуального приёма Liquid Glass. Он не меняет API, навигацию,
realtime, auth, chat, call или upload-сценарии.

Цель — усилить ощущение спокойного, технологичного AraShift, сохранив
читабельность сообщений, производительность списков и доступность. Это не
буквальное копирование iOS Liquid Glass: Apple-приём не является системным
паттерном Android и не должен становиться стилем каждого контейнера.

## Зафиксированный motion-набор

### 1. Выбор нижней вкладки — первая очередь

**Где:** custom `AraTabBar` в `src/navigation/MainTabs.tsx`.

**Поведение:** активная индиго-плашка раскрывается только по горизонтали от
центра; иконка и подпись одновременно меняют цвет и акцентный вес. Позиции
пяти вкладок и содержимое экранов не двигаются.

**Параметры:** `opacity + scaleX`, 140 мс, без пружинного отскока.

**Основание:** [Material 3 Navigation Bar](https://m3.material.io/components/navigation-bar/guidelines)
рекомендует раскрывать active indicator от центра только по одной оси.

### 2. Единый вход и выход нижних панелей — первая очередь

**Где:** меню действий сообщения, выбор вложений, запись voice/video note,
панели безопасности и жалобы.

**Поведение:** scrim плавно появляется, а sheet поднимается по одной
вертикальной оси на 20–24 dp. При закрытии движение короче, чем при открытии.

**Параметры:** вход — `opacity + translateY`, 220 мс; выход — 140 мс. Никаких
пружин, bounce или изменения раскладки в процессе перехода.

**Основание:** [Material 3 Bottom Sheets](https://m3.material.io/components/bottom-sheets/guidelines)
и [Material transition patterns](https://m3.material.io/styles/motion/transitions/transition-patterns).

### 3. Локальная трансформация composer — вторая очередь

**Где:** переход между обычным composer, reply, черновиком вложения, записью
голоса/видео и действием отправки.

**Поведение:** остающийся на месте контейнер меняет содержимое через короткий
crossfade; допустимо очень небольшое изменение его ширины. Список сообщений и
высота экрана не анимируются.

**Параметры:** 140–220 мс, `opacity` и при необходимости небольшой `scale` или
изменение ширины. Без bounce.

### 4. Раскрытие фото в viewer — вторая очередь, после прототипа

**Где:** только переход из photo attachment к существующему fullscreen viewer
и обратно.

**Поведение:** source-thumbnail визуально связывается с viewer через
ограниченный container transform. Не применяется для файлов, видео, голосовых
сообщений и навигации в целом.

## Что не добавляем

- каскадное появление или сдвиг всех элементов `FlatList`;
- анимацию каждого входящего сообщения;
- параллакс, частицы, постоянные декоративные loop-эффекты;
- blur/fade-эффекты для текста переписки и сообщений;
- bounce, elastic и «желейную» физику в обычных рабочих сценариях;
- анимацию полной смены темы: она может дать вспышку и ухудшить ориентацию.

Для AraChat подходит **Material Standard**, а не Expressive motion: по
[Material 3 Motion](https://m3.material.io/styles/motion/overview/how-it-works)
стандартная схема функциональна и имеет минимальный bounce; это соответствует
плотному мессенджеру.

## AraGlass — Android-интерпретация Liquid Glass

### Визуальное решение

AraGlass — это фирменная Android-поверхность, а не эффект для всего экрана:

1. полупрозрачный тематический слой на основе семантических `glass`,
   `glassStrong`, `glassBorder` и `shadow`;
2. тонкая граница с достаточным контрастом;
3. мягкая тень и существующие радиусы AraShift;
4. необязательное backdrop blur/refraction только на поддерживаемых устройствах;
5. непрозрачный, читаемый fallback для случаев без аппаратного эффекта.

Это ближе к Android Material 3 Expressive, который строит глубину через
тональные поверхности, формы и motion, а не требует системного копирования
Apple-материала: [Android Developers — Material 3](https://developer.android.com/develop/ui/compose/designsystems/material3).

### Допустимые места

**Можно применить:**

- custom bottom tab bar;
- modal bottom sheets и action sheets;
- composer поверх списка сообщений;
- компактные верхние controls в fullscreen media viewer;
- call overlay controls.

**Нельзя применить:**

- пузырьки сообщений;
- основной canvas экранов;
- длинные списки чатов, настроек и обращений;
- текстовые поля, критичные для ввода, и alert/error-слои;
- несколько вложенных или перекрывающихся glass-панелей.

### Подтверждённый кандидат для прототипа

**`@sbaiahmed1/react-native-blur` 6.0.2** — основной кандидат на изолированный
Android-прототип. У него есть `LiquidGlassView`, Android demo и fallback;
эффект для Android 13+ использует AGSL shader из
[AndroidLiquidGlassView](https://github.com/QmDeve/AndroidLiquidGlassView).

Источники и подтверждённые требования:

- [npm package](https://www.npmjs.com/package/@sbaiahmed1/react-native-blur);
- [документация по установке](https://sbaiahmed1.github.io/react-native-blur/docs/installation):
  React Native 0.80+ с New Architecture, Android API 24+, AGP 8.9.1+;
- [репозиторий пакета](https://github.com/sbaiahmed1/react-native-blur), включая
  Android demo;
- [AndroidLiquidGlassView](https://github.com/QmDeve/AndroidLiquidGlassView):
  рефракция и дисперсия доступны на Android 13+.

### Совместимость с текущим клиентом

- React Native: `0.87.0` — соответствует требованию кандидата `0.80+`.
- Fabric/New Architecture: включён в
  `android/gradle.properties` (`newArchEnabled=true`).
- Минимальный Android: `minSdk = 33`, то есть Android 13. Полный shader-эффект
  может быть доступен на всех устройствах, которые поддерживает текущий APK.
- Версию Android Gradle Plugin нужно подтвердить отдельным debug build после
  установки: пакет требует `8.9.1+`, а в проекте версия не задана явно в
  `android/build.gradle`.

### Ограничения и решение по зависимости

Пакет — **не утверждён для production до прототипа**:

- он добавляет native Fabric-компоненты;
- blur подтягивает `QmBlurView` из JitPack, значит требуется отдельная проверка
  supply-chain и повторяемости Gradle-сборки;
- рефракция и backdrop capture увеличивают GPU-нагрузку;
- нельзя использовать эффект в скроллируемых списках или анимировать его
  одновременно с раскрытием sheet.

Нативный Android `RenderEffect` появился лишь в API 31, а AGSL runtime shaders
— в API 33: [Android Developers — RenderScript migration](https://developer.android.com/guide/topics/renderscript/migrate).
Поэтому самописный shader-мост сейчас не оправдан: он увеличит объём native
кода и риск без преимущества над ограниченным прототипом готового компонента.

### Обязательный fallback

Даже если пользователь включает glass, интерфейс обязан быть полноценным без
его real-time части:

- доступный fallback — тематический `glassStrong`/непрозрачный surface с
  границей и тенью;
- текст и иконки сохраняют контраст в светлой и тёмной теме;
- никакая функция не зависит от видимого blur/refraction;
- при low-power или проблемах рендеринга приложение не оставляет прозрачную
  поверхность без фона.

## Доступность и производительность

- Реакция на `AccessibilityInfo.isReduceMotionEnabled()` обязательна. При
  reduced motion spatial-анимации заменяются коротким fade или отсутствуют.
- Эффект не должен мигать, менять фокус TalkBack или скрывать элемент за
  клавиатурой/safe area.
- Для blur/refraction — не более одной крупной active glass-поверхности на
  экране; не более двух компактных элементов управления поверх медиа/звонка.
- Необходимо проверить 60 fps при скролле переписки, открытии sheet,
  переключении вкладок и во время media/call overlay.
- [WCAG 2.3.3](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html)
  требует возможности отключить несущественное движение, вызванное
  взаимодействием.

## Порядок реализации после одобрения

1. Добавить и протестировать без зависимости motion первой очереди на
   встроенном `Animated` и токенах `motion`.
2. Создать `AraGlassSurface` с полностью токенизированным непрозрачным
   fallback; подключить его только к одному sheet в debug-прототипе.
3. В отдельной ветке добавить фиксированную версию
   `@sbaiahmed1/react-native-blur`, выполнить debug build и проверить
   автолинкинг, размер APK, Gradle resolution и отсутствие конфликта с WebRTC.
4. Сравнить на реальных Android 13+ устройствах `AraGlassSurface` fallback и
   `LiquidGlassView`: контраст, FPS, расход батареи и корректность dark theme.
5. Включать shader-вариант только для тех поверхностей, где он проходит
   проверку; иначе оставить AraGlass fallback как релизный вариант.
6. После принятия: typecheck, ESLint, Jest, debug APK и device-level regression
   с TalkBack, largest text, IME, light/dark и reduced motion.

## Критерии принятия

Прототип может перейти в production только если одновременно:

1. все проверки сборки и тестов проходят;
2. нет просадки плавности при скролле чата и открытии sheet;
3. текст, иконки, error/disabled/selected states сохраняют контраст в обеих
   темах;
4. отключённая анимация и fallback выглядят законченным продуктом;
5. native-зависимость и транзитивный JitPack-артефакт прошли отдельный review;
6. app size и поведение на Android 13+ измерены на физических устройствах.
