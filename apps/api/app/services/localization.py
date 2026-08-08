from collections.abc import Mapping


SUPPORTED_LANGUAGES = frozenset({'ru', 'en', 'kk', 'ky', 'uk', 'be', 'uz'})
DEFAULT_LANGUAGE = 'ru'


def normalize_language(value: str | None) -> str:
    language = (value or '').strip().lower().replace('_', '-').split('-', maxsplit=1)[0]
    return language if language in SUPPORTED_LANGUAGES else DEFAULT_LANGUAGE


MESSAGES: dict[str, dict[str, str]] = {
    'ru': {
        'email.registration.subject': 'Код подтверждения e-mail — AraChat',
        'email.registration.heading': 'Подтвердите e-mail',
        'email.registration.description': 'Введите этот код, чтобы завершить регистрацию в AraChat.',
        'email.password_change.subject': 'Код смены пароля — AraChat',
        'email.password_change.heading': 'Подтвердите смену пароля',
        'email.password_change.description': 'Введите этот код, чтобы изменить пароль AraChat.',
        'email.password_reset.subject': 'Код восстановления доступа — AraChat',
        'email.password_reset.heading': 'Восстановление доступа',
        'email.password_reset.description': 'Введите этот код, чтобы задать новый пароль AraChat.',
        'email.email_change.subject': 'Код смены e-mail — AraChat',
        'email.email_change.heading': 'Подтвердите новый e-mail',
        'email.email_change.description': 'Введите этот код, чтобы привязать этот e-mail к AraChat.',
        'email.default.subject': 'Код подтверждения — AraChat',
        'email.default.heading': 'Подтвердите действие',
        'email.default.description': 'Введите этот код в AraChat.',
        'email.code': 'Код: {code}',
        'email.safety': 'Он действует {minutes} мин. Никому не сообщайте этот код. Если запрос сделали не вы, просто проигнорируйте это письмо.',
        'notification.photo': '📷 Фото',
        'notification.video': '🎬 Видео',
        'notification.video_note': '🎥 Видеосообщение',
        'notification.voice': '🎤 Голосовое сообщение',
        'notification.file': '📎 Файл',
        'notification.new_message': 'Новое сообщение',
        'notification.comment': 'Комментарий: {text}',
        'notification.test': 'Проверка push-уведомлений',
        'telegram.greeting': 'Привет! Я бот AraChat. Начните регистрацию в приложении и выберите подтверждение телефона, чтобы я отправил код.',
        'telegram.expired': 'Заявка на подтверждение телефона истекла. Запросите новый код в приложении AraChat.',
        'telegram.used': 'Эта заявка уже использована. Если нужно, запросите новый код в приложении.',
        'telegram.other_account': 'Эта заявка уже привязана к другому Telegram-аккаунту. Запросите новый код в приложении AraChat.',
        'telegram.own_contact': 'Пожалуйста, отправьте именно свой контакт через кнопку Telegram.',
        'telegram.start_in_app': 'Сначала запросите код в приложении AraChat, затем откройте бота по ссылке.',
        'telegram.invalid_phone': 'Не удалось распознать номер. Введите номер выбранной страны сообщением или отправьте контакт кнопкой Telegram.',
        'telegram.callback_expired': 'Заявка истекла',
        'telegram.callback_other_account': 'Это заявка другого Telegram-аккаунта',
        'telegram.callback_sent': 'Код отправлен',
        'telegram.code': 'Ваш код подтверждения AraChat: {code}\nВведите его в приложении. Код действует {minutes} мин.',
        'telegram.prompt': 'Привет! Подтвердите номер для регистрации в AraChat.\n\nСтрана: {country}\nНомер из приложения: {phone}\n\nЕсли это ваш номер, нажмите «Подтвердить». Если нужен другой номер — отправьте контакт кнопкой ниже или напишите номер сообщением.',
        'telegram.confirm': 'Подтвердить',
        'telegram.contact_prompt': 'Можно отправить номер из Telegram одной кнопкой:',
        'telegram.share_contact': 'Отправить мой номер',
    },
    'en': {
        'email.registration.subject': 'E-mail verification code — AraChat',
        'email.registration.heading': 'Verify your e-mail',
        'email.registration.description': 'Enter this code to complete your AraChat registration.',
        'email.password_change.subject': 'Password change code — AraChat',
        'email.password_change.heading': 'Confirm your password change',
        'email.password_change.description': 'Enter this code to change your AraChat password.',
        'email.password_reset.subject': 'Access recovery code — AraChat',
        'email.password_reset.heading': 'Recover access',
        'email.password_reset.description': 'Enter this code to set a new AraChat password.',
        'email.email_change.subject': 'E-mail change code — AraChat',
        'email.email_change.heading': 'Verify your new e-mail',
        'email.email_change.description': 'Enter this code to link this e-mail to AraChat.',
        'email.default.subject': 'Verification code — AraChat',
        'email.default.heading': 'Confirm the action',
        'email.default.description': 'Enter this code in AraChat.',
        'email.code': 'Code: {code}',
        'email.safety': 'It expires in {minutes} minutes. Do not share this code with anyone. If you did not make this request, simply ignore this e-mail.',
        'notification.photo': '📷 Photo',
        'notification.video': '🎬 Video',
        'notification.video_note': '🎥 Video message',
        'notification.voice': '🎤 Voice message',
        'notification.file': '📎 File',
        'notification.new_message': 'New message',
        'notification.comment': 'Comment: {text}',
        'notification.test': 'Push notification test',
        'telegram.greeting': 'Hello! I am the AraChat bot. Start registration in the app and choose phone verification so I can send a code.',
        'telegram.expired': 'This phone verification request has expired. Request a new code in the AraChat app.',
        'telegram.used': 'This request has already been used. Request a new code in the app if needed.',
        'telegram.other_account': 'This request is linked to another Telegram account. Request a new code in the AraChat app.',
        'telegram.own_contact': 'Please send your own contact using the Telegram button.',
        'telegram.start_in_app': 'Request a code in the AraChat app first, then open the bot from the link.',
        'telegram.invalid_phone': 'The phone number could not be recognized. Enter a number for the selected country or send your contact with the Telegram button.',
        'telegram.callback_expired': 'Request expired',
        'telegram.callback_other_account': 'This request belongs to another Telegram account',
        'telegram.callback_sent': 'Code sent',
        'telegram.code': 'Your AraChat verification code: {code}\nEnter it in the app. The code is valid for {minutes} minutes.',
        'telegram.prompt': 'Hello! Confirm your phone number for AraChat registration.\n\nCountry: {country}\nNumber from the app: {phone}\n\nIf this is your number, tap “Confirm”. To use another number, send your contact with the button below or type it in a message.',
        'telegram.confirm': 'Confirm',
        'telegram.contact_prompt': 'You can send your Telegram phone number with one button:',
        'telegram.share_contact': 'Share my number',
    },
    'kk': {
        'email.registration.subject': 'E-mail растау коды — AraChat', 'email.registration.heading': 'E-mail-ды растаңыз', 'email.registration.description': 'AraChat-та тіркелуді аяқтау үшін осы кодты енгізіңіз.',
        'email.password_change.subject': 'Құпиясөзді өзгерту коды — AraChat', 'email.password_change.heading': 'Құпиясөзді өзгертуді растаңыз', 'email.password_change.description': 'AraChat құпиясөзін өзгерту үшін осы кодты енгізіңіз.',
        'email.password_reset.subject': 'Қолжетімділікті қалпына келтіру коды — AraChat', 'email.password_reset.heading': 'Қолжетімділікті қалпына келтіру', 'email.password_reset.description': 'Жаңа AraChat құпиясөзін орнату үшін осы кодты енгізіңіз.',
        'email.email_change.subject': 'E-mail өзгерту коды — AraChat', 'email.email_change.heading': 'Жаңа e-mail-ды растаңыз', 'email.email_change.description': 'Осы e-mail-ды AraChat-қа байланыстыру үшін кодты енгізіңіз.',
        'email.default.subject': 'Растау коды — AraChat', 'email.default.heading': 'Әрекетті растаңыз', 'email.default.description': 'Осы кодты AraChat-қа енгізіңіз.',
        'email.code': 'Код: {code}', 'email.safety': 'Код {minutes} минут жарамды. Оны ешкімге айтпаңыз. Егер сұрауды сіз жасамаған болсаңыз, хатты елемеңіз.',
        'notification.photo': '📷 Фото', 'notification.video': '🎬 Бейне', 'notification.video_note': '🎥 Бейнехабар', 'notification.voice': '🎤 Дауыс хабарламасы', 'notification.file': '📎 Файл', 'notification.new_message': 'Жаңа хабарлама', 'notification.comment': 'Пікір: {text}', 'notification.test': 'Push-хабарландыруды тексеру',
        'telegram.greeting': 'Сәлем! Мен AraChat ботымын. Қолданбада тіркелуді бастап, телефонды растауды таңдаңыз — сонда код жіберемін.', 'telegram.expired': 'Телефонды растау сұрауының мерзімі өтті. AraChat қолданбасынан жаңа код сұраңыз.', 'telegram.used': 'Бұл сұрау бұрын қолданылған. Қажет болса, қолданбада жаңа код сұраңыз.', 'telegram.other_account': 'Бұл сұрау басқа Telegram аккаунтына байланыстырылған. AraChat қолданбасынан жаңа код сұраңыз.', 'telegram.own_contact': 'Telegram батырмасы арқылы өз контактіңізді жіберіңіз.', 'telegram.start_in_app': 'Алдымен AraChat қолданбасынан код сұрап, содан кейін сілтеме арқылы ботты ашыңыз.', 'telegram.invalid_phone': 'Телефон нөмірін тану мүмкін болмады. Таңдалған елдің нөмірін жазыңыз не Telegram батырмасымен контактіңізді жіберіңіз.', 'telegram.callback_expired': 'Сұраудың мерзімі өтті', 'telegram.callback_other_account': 'Бұл сұрау басқа Telegram аккаунтына тиесілі', 'telegram.callback_sent': 'Код жіберілді', 'telegram.code': 'AraChat растау коды: {code}\nОны қолданбаға енгізіңіз. Код {minutes} минут жарамды.', 'telegram.prompt': 'Сәлем! AraChat-та тіркелу үшін телефон нөмірін растаңыз.\n\nЕл: {country}\nҚолданбадағы нөмір: {phone}\n\nЕгер бұл сіздің нөміріңіз болса, «Растау» түймесін басыңыз. Басқа нөмір үшін төмендегі батырмамен контактіні жіберіңіз немесе нөмірді хабарламада жазыңыз.', 'telegram.confirm': 'Растау', 'telegram.contact_prompt': 'Telegram нөміріңізді бір батырмамен жіберуге болады:', 'telegram.share_contact': 'Нөмірімді жіберу',
    },
    'ky': {
        'email.registration.subject': 'E-mail ырастоо коду — AraChat', 'email.registration.heading': 'E-mail дарегиңизди ырастаңыз', 'email.registration.description': 'AraChat каттоосун аяктоо үчүн бул кодду киргизиңиз.',
        'email.password_change.subject': 'Сырсөздү өзгөртүү коду — AraChat', 'email.password_change.heading': 'Сырсөздүн өзгөрүшүн ырастаңыз', 'email.password_change.description': 'AraChat сырсөзүн өзгөртүү үчүн бул кодду киргизиңиз.',
        'email.password_reset.subject': 'Кирүүнү калыбына келтирүү коду — AraChat', 'email.password_reset.heading': 'Кирүүнү калыбына келтирүү', 'email.password_reset.description': 'Жаңы AraChat сырсөзүн коюу үчүн бул кодду киргизиңиз.',
        'email.email_change.subject': 'E-mail өзгөртүү коду — AraChat', 'email.email_change.heading': 'Жаңы e-mail дарегин ырастаңыз', 'email.email_change.description': 'Бул e-mail дарегин AraChat-ка байлоо үчүн кодду киргизиңиз.',
        'email.default.subject': 'Ырастоо коду — AraChat', 'email.default.heading': 'Аракетти ырастаңыз', 'email.default.description': 'Бул кодду AraChat-ка киргизиңиз.',
        'email.code': 'Код: {code}', 'email.safety': 'Код {minutes} мүнөт жарактуу. Аны эч кимге айтпаңыз. Эгер бул суроону сиз кылбасаңыз, катты этибарга албаңыз.',
        'notification.photo': '📷 Сүрөт', 'notification.video': '🎬 Видео', 'notification.video_note': '🎥 Видео билдирүү', 'notification.voice': '🎤 Үн билдирүүсү', 'notification.file': '📎 Файл', 'notification.new_message': 'Жаңы билдирүү', 'notification.comment': 'Комментарий: {text}', 'notification.test': 'Push-билдирүүнү текшерүү',
        'telegram.greeting': 'Салам! Мен AraChat ботумун. Колдонмодон каттоону баштап, телефонду ырастоону тандаңыз — ошондо код жиберем.', 'telegram.expired': 'Телефонду ырастоо өтүнмөсүнүн мөөнөтү бүттү. AraChat колдонмосунан жаңы код сураңыз.', 'telegram.used': 'Бул өтүнмө мурда колдонулган. Зарыл болсо, колдонмодон жаңы код сураңыз.', 'telegram.other_account': 'Бул өтүнмө башка Telegram аккаунтуна байланган. AraChat колдонмосунан жаңы код сураңыз.', 'telegram.own_contact': 'Telegram баскычы аркылуу өзүңүздүн контактыңызды жөнөтүңүз.', 'telegram.start_in_app': 'Адегенде AraChat колдонмосунан код сурап, андан соң шилтеме аркылуу ботту ачыңыз.', 'telegram.invalid_phone': 'Телефон номери таанылган жок. Тандалган өлкөнүн номерин жазыңыз же Telegram баскычы менен контактыңызды жөнөтүңүз.', 'telegram.callback_expired': 'Өтүнмөнүн мөөнөтү бүттү', 'telegram.callback_other_account': 'Бул өтүнмө башка Telegram аккаунтуна тиешелүү', 'telegram.callback_sent': 'Код жөнөтүлдү', 'telegram.code': 'AraChat ырастоо коду: {code}\nАны колдонмого киргизиңиз. Код {minutes} мүнөт жарактуу.', 'telegram.prompt': 'Салам! AraChat-та катталуу үчүн телефон номериңизди ырастаңыз.\n\nӨлкө: {country}\nКолдонмодогу номер: {phone}\n\nЭгер бул сиздин номериңиз болсо, «Ырастоо» баскычын басыңыз. Башка номер үчүн төмөнкү баскыч менен контакт жөнөтүңүз же номерди билдирүүдө жазыңыз.', 'telegram.confirm': 'Ырастоо', 'telegram.contact_prompt': 'Telegram номериңизди бир баскыч менен жөнөтсөңүз болот:', 'telegram.share_contact': 'Номеримди жөнөтүү',
    },
    'uk': {
        'email.registration.subject': 'Код підтвердження e-mail — AraChat', 'email.registration.heading': 'Підтвердьте e-mail', 'email.registration.description': 'Введіть цей код, щоб завершити реєстрацію в AraChat.',
        'email.password_change.subject': 'Код зміни пароля — AraChat', 'email.password_change.heading': 'Підтвердьте зміну пароля', 'email.password_change.description': 'Введіть цей код, щоб змінити пароль AraChat.',
        'email.password_reset.subject': 'Код відновлення доступу — AraChat', 'email.password_reset.heading': 'Відновлення доступу', 'email.password_reset.description': 'Введіть цей код, щоб встановити новий пароль AraChat.',
        'email.email_change.subject': 'Код зміни e-mail — AraChat', 'email.email_change.heading': 'Підтвердьте новий e-mail', 'email.email_change.description': 'Введіть цей код, щоб прив’язати цю адресу e-mail до AraChat.',
        'email.default.subject': 'Код підтвердження — AraChat', 'email.default.heading': 'Підтвердьте дію', 'email.default.description': 'Введіть цей код у AraChat.',
        'email.code': 'Код: {code}', 'email.safety': 'Код діє {minutes} хв. Нікому не повідомляйте цей код. Якщо ви не робили запит, просто проігноруйте лист.',
        'notification.photo': '📷 Фото', 'notification.video': '🎬 Відео', 'notification.video_note': '🎥 Відеоповідомлення', 'notification.voice': '🎤 Голосове повідомлення', 'notification.file': '📎 Файл', 'notification.new_message': 'Нове повідомлення', 'notification.comment': 'Коментар: {text}', 'notification.test': 'Перевірка push-сповіщень',
        'telegram.greeting': 'Вітаю! Я бот AraChat. Почніть реєстрацію у застосунку та виберіть підтвердження телефону — тоді я надішлю код.', 'telegram.expired': 'Термін дії запиту на підтвердження телефону минув. Запросіть новий код у застосунку AraChat.', 'telegram.used': 'Цей запит уже використано. За потреби запросіть новий код у застосунку.', 'telegram.other_account': 'Цей запит прив’язано до іншого акаунта Telegram. Запросіть новий код у застосунку AraChat.', 'telegram.own_contact': 'Надішліть власний контакт за допомогою кнопки Telegram.', 'telegram.start_in_app': 'Спочатку запросіть код у застосунку AraChat, потім відкрийте бота за посиланням.', 'telegram.invalid_phone': 'Не вдалося розпізнати номер. Введіть номер вибраної країни або надішліть контакт кнопкою Telegram.', 'telegram.callback_expired': 'Термін запиту минув', 'telegram.callback_other_account': 'Цей запит належить іншому акаунту Telegram', 'telegram.callback_sent': 'Код надіслано', 'telegram.code': 'Ваш код підтвердження AraChat: {code}\nВведіть його у застосунку. Код діє {minutes} хв.', 'telegram.prompt': 'Вітаю! Підтвердьте номер телефону для реєстрації в AraChat.\n\nКраїна: {country}\nНомер із застосунку: {phone}\n\nЯкщо це ваш номер, натисніть «Підтвердити». Для іншого номера надішліть контакт кнопкою нижче або введіть номер у повідомленні.', 'telegram.confirm': 'Підтвердити', 'telegram.contact_prompt': 'Можна надіслати номер з Telegram однією кнопкою:', 'telegram.share_contact': 'Надіслати мій номер',
    },
    'be': {
        'email.registration.subject': 'Код пацвярджэння e-mail — AraChat', 'email.registration.heading': 'Пацвердзіце e-mail', 'email.registration.description': 'Увядзіце гэты код, каб завяршыць рэгістрацыю ў AraChat.',
        'email.password_change.subject': 'Код змены пароля — AraChat', 'email.password_change.heading': 'Пацвердзіце змену пароля', 'email.password_change.description': 'Увядзіце гэты код, каб змяніць пароль AraChat.',
        'email.password_reset.subject': 'Код аднаўлення доступу — AraChat', 'email.password_reset.heading': 'Аднаўленне доступу', 'email.password_reset.description': 'Увядзіце гэты код, каб усталяваць новы пароль AraChat.',
        'email.email_change.subject': 'Код змены e-mail — AraChat', 'email.email_change.heading': 'Пацвердзіце новы e-mail', 'email.email_change.description': 'Увядзіце гэты код, каб прывязаць гэты e-mail да AraChat.',
        'email.default.subject': 'Код пацвярджэння — AraChat', 'email.default.heading': 'Пацвердзіце дзеянне', 'email.default.description': 'Увядзіце гэты код у AraChat.',
        'email.code': 'Код: {code}', 'email.safety': 'Код дзейнічае {minutes} хв. Нікому не паведамляйце гэты код. Калі запыт рабілі не вы, проста праігнаруйце ліст.',
        'notification.photo': '📷 Фота', 'notification.video': '🎬 Відэа', 'notification.video_note': '🎥 Відэапаведамленне', 'notification.voice': '🎤 Галасавое паведамленне', 'notification.file': '📎 Файл', 'notification.new_message': 'Новае паведамленне', 'notification.comment': 'Каментар: {text}', 'notification.test': 'Праверка push-апавяшчэнняў',
        'telegram.greeting': 'Вітаю! Я бот AraChat. Пачніце рэгістрацыю ў праграме і абярыце пацвярджэнне тэлефона — тады я дашлю код.', 'telegram.expired': 'Тэрмін дзеяння запыту на пацвярджэнне тэлефона мінуў. Запытайце новы код у праграме AraChat.', 'telegram.used': 'Гэты запыт ужо выкарыстаны. Пры неабходнасці запытайце новы код у праграме.', 'telegram.other_account': 'Гэты запыт прывязаны да іншага акаўнта Telegram. Запытайце новы код у праграме AraChat.', 'telegram.own_contact': 'Дашліце ўласны кантакт праз кнопку Telegram.', 'telegram.start_in_app': 'Спачатку запытайце код у праграме AraChat, затым адкрыйце бота па спасылцы.', 'telegram.invalid_phone': 'Не ўдалося распазнаць нумар. Увядзіце нумар выбранай краіны або дашліце кантакт кнопкай Telegram.', 'telegram.callback_expired': 'Тэрмін запыту мінуў', 'telegram.callback_other_account': 'Гэты запыт належыць іншаму акаўнту Telegram', 'telegram.callback_sent': 'Код дасланы', 'telegram.code': 'Ваш код пацвярджэння AraChat: {code}\nУвядзіце яго ў праграме. Код дзейнічае {minutes} хв.', 'telegram.prompt': 'Вітаю! Пацвердзіце нумар тэлефона для рэгістрацыі ў AraChat.\n\nКраіна: {country}\nНумар з праграмы: {phone}\n\nКалі гэта ваш нумар, націсніце «Пацвердзіць». Для іншага нумара дашліце кантакт кнопкай ніжэй або ўвядзіце нумар у паведамленні.', 'telegram.confirm': 'Пацвердзіць', 'telegram.contact_prompt': 'Можна даслаць нумар з Telegram адной кнопкай:', 'telegram.share_contact': 'Даслаць мой нумар',
    },
    'uz': {
        'email.registration.subject': 'E-mail tasdiqlash kodi — AraChat', 'email.registration.heading': 'E-mail manzilingizni tasdiqlang', 'email.registration.description': 'AraChat ro‘yxatdan o‘tishini yakunlash uchun ushbu kodni kiriting.',
        'email.password_change.subject': 'Parolni o‘zgartirish kodi — AraChat', 'email.password_change.heading': 'Parol o‘zgartirilishini tasdiqlang', 'email.password_change.description': 'AraChat parolini o‘zgartirish uchun ushbu kodni kiriting.',
        'email.password_reset.subject': 'Kirishni tiklash kodi — AraChat', 'email.password_reset.heading': 'Kirishni tiklash', 'email.password_reset.description': 'Yangi AraChat parolini o‘rnatish uchun ushbu kodni kiriting.',
        'email.email_change.subject': 'E-mail o‘zgartirish kodi — AraChat', 'email.email_change.heading': 'Yangi e-mail manzilini tasdiqlang', 'email.email_change.description': 'Ushbu e-mail manzilini AraChat-ga bog‘lash uchun kodni kiriting.',
        'email.default.subject': 'Tasdiqlash kodi — AraChat', 'email.default.heading': 'Harakatni tasdiqlang', 'email.default.description': 'Ushbu kodni AraChat-ga kiriting.',
        'email.code': 'Kod: {code}', 'email.safety': 'Kod {minutes} daqiqa amal qiladi. Uni hech kimga aytmang. Agar so‘rovni siz yubormagan bo‘lsangiz, xatni e’tiborsiz qoldiring.',
        'notification.photo': '📷 Surat', 'notification.video': '🎬 Video', 'notification.video_note': '🎥 Video xabar', 'notification.voice': '🎤 Ovozli xabar', 'notification.file': '📎 Fayl', 'notification.new_message': 'Yangi xabar', 'notification.comment': 'Izoh: {text}', 'notification.test': 'Push-bildirishnomani tekshirish',
        'telegram.greeting': 'Salom! Men AraChat botiman. Ilovada ro‘yxatdan o‘tishni boshlang va telefonni tasdiqlashni tanlang — shunda kod yuboraman.', 'telegram.expired': 'Telefonni tasdiqlash so‘rovining muddati tugadi. AraChat ilovasidan yangi kod so‘rang.', 'telegram.used': 'Bu so‘rov allaqachon ishlatilgan. Zarur bo‘lsa, ilovadan yangi kod so‘rang.', 'telegram.other_account': 'Bu so‘rov boshqa Telegram hisobiga bog‘langan. AraChat ilovasidan yangi kod so‘rang.', 'telegram.own_contact': 'Telegram tugmasi orqali o‘z kontaktingizni yuboring.', 'telegram.start_in_app': 'Avval AraChat ilovasidan kod so‘rang, so‘ng havola orqali botni oching.', 'telegram.invalid_phone': 'Telefon raqamini aniqlab bo‘lmadi. Tanlangan mamlakat raqamini yozing yoki Telegram tugmasi bilan kontaktingizni yuboring.', 'telegram.callback_expired': 'So‘rov muddati tugadi', 'telegram.callback_other_account': 'Bu so‘rov boshqa Telegram hisobiga tegishli', 'telegram.callback_sent': 'Kod yuborildi', 'telegram.code': 'AraChat tasdiqlash kodingiz: {code}\nUni ilovaga kiriting. Kod {minutes} daqiqa amal qiladi.', 'telegram.prompt': 'Salom! AraChat ro‘yxatdan o‘tishi uchun telefon raqamingizni tasdiqlang.\n\nMamlakat: {country}\nIlovadagi raqam: {phone}\n\nAgar bu sizning raqamingiz bo‘lsa, «Tasdiqlash»ni bosing. Boshqa raqam uchun quyidagi tugma bilan kontaktni yuboring yoki raqamni xabarda yozing.', 'telegram.confirm': 'Tasdiqlash', 'telegram.contact_prompt': 'Telegram raqamingizni bitta tugma bilan yuborishingiz mumkin:', 'telegram.share_contact': 'Raqamimni yuborish',
    },
}


COUNTRY_NAMES: dict[str, dict[str, str]] = {
    'ru': {'RU': 'Россия', 'KZ': 'Казахстан', 'KG': 'Кыргызстан', 'UA': 'Украина', 'BY': 'Беларусь', 'UZ': 'Узбекистан'},
    'en': {'RU': 'Russia', 'KZ': 'Kazakhstan', 'KG': 'Kyrgyzstan', 'UA': 'Ukraine', 'BY': 'Belarus', 'UZ': 'Uzbekistan'},
    'kk': {'RU': 'Ресей', 'KZ': 'Қазақстан', 'KG': 'Қырғызстан', 'UA': 'Украина', 'BY': 'Беларусь', 'UZ': 'Өзбекстан'},
    'ky': {'RU': 'Орусия', 'KZ': 'Казакстан', 'KG': 'Кыргызстан', 'UA': 'Украина', 'BY': 'Беларусь', 'UZ': 'Өзбекстан'},
    'uk': {'RU': 'Росія', 'KZ': 'Казахстан', 'KG': 'Киргизстан', 'UA': 'Україна', 'BY': 'Білорусь', 'UZ': 'Узбекистан'},
    'be': {'RU': 'Расія', 'KZ': 'Казахстан', 'KG': 'Кіргізія', 'UA': 'Украіна', 'BY': 'Беларусь', 'UZ': 'Узбекістан'},
    'uz': {'RU': 'Rossiya', 'KZ': 'Qozog‘iston', 'KG': 'Qirg‘iziston', 'UA': 'Ukraina', 'BY': 'Belarus', 'UZ': 'O‘zbekiston'},
}


def tr(language: str | None, key: str, **values: object) -> str:
    template = MESSAGES[normalize_language(language)].get(key) or MESSAGES[DEFAULT_LANGUAGE][key]
    return template.format(**values)


def country_name(language: str | None, country: str) -> str:
    locale = normalize_language(language)
    return COUNTRY_NAMES[locale].get(country, COUNTRY_NAMES[DEFAULT_LANGUAGE]['RU'])


def email_message_content(language: str | None, purpose: str) -> tuple[str, str, str]:
    prefix = f'email.{purpose}' if f'email.{purpose}.subject' in MESSAGES[DEFAULT_LANGUAGE] else 'email.default'
    return (
        tr(language, f'{prefix}.subject'),
        tr(language, f'{prefix}.heading'),
        tr(language, f'{prefix}.description'),
    )


def message_preview(language: str | None, message_type: str, payload: str, media_name: str | None) -> str:
    if message_type in {'text', 'emoji'}:
        return payload[:240]
    label = tr(language, f'notification.{message_type}') if f'notification.{message_type}' in MESSAGES[DEFAULT_LANGUAGE] else tr(language, 'notification.new_message')
    return f'{label}: {media_name}' if media_name else label
