const DEFAULT_DEVELOPMENT_API_BASE_URL = 'http://localhost:8000';

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL
  || (import.meta.env.DEV ? DEFAULT_DEVELOPMENT_API_BASE_URL : ''))
  .trim()
  .replace(/\/$/, '');

const ERROR_MESSAGES = {
  'Invalid login identifier or password': {
    ru: 'Неверный e-mail или пароль.',
    en: 'Incorrect e-mail or password.',
  },
  'Login identifier is required': {
    ru: 'Введите e-mail.',
    en: 'Enter your e-mail address.',
  },
  'Email is already registered': {
    ru: 'Этот e-mail уже зарегистрирован.',
    en: 'This e-mail is already registered.',
  },
  'Email verification request not found': {
    ru: 'Заявка на подтверждение e-mail не найдена. Запросите код ещё раз.',
    en: 'The e-mail verification request was not found. Request a new code.',
  },
  'Email verification request is already used': {
    ru: 'Этот код уже использован. Запросите новый.',
    en: 'This verification request has already been used. Request a new code.',
  },
  'Email verification request is expired': {
    ru: 'Срок действия кода истёк. Запросите новый.',
    en: 'The verification code has expired. Request a new one.',
  },
  'Invalid e-mail confirmation code': {
    ru: 'Неверный код из письма.',
    en: 'The e-mail code is incorrect.',
  },
  'E-mail confirmation code is not available': {
    ru: 'Код подтверждения недоступен. Запросите новый.',
    en: 'The verification code is unavailable. Request a new one.',
  },
  'E-mail verification is not available on this device': {
    ru: 'Подтвердите e-mail на том же устройстве, с которого был запрошен код.',
    en: 'Confirm the e-mail on the device where the code was requested.',
  },
  'Too many e-mail verification requests. Try again later': {
    ru: 'Слишком много запросов кода. Попробуйте позже.',
    en: 'Too many code requests. Try again later.',
  },
  'Too many authentication requests. Try again later': {
    ru: 'Слишком много попыток. Попробуйте позже.',
    en: 'Too many attempts. Try again later.',
  },
  'SMTP e-mail delivery is not configured': {
    ru: 'Почтовая доставка пока не настроена на сервере.',
    en: 'E-mail delivery is not configured on the server yet.',
  },
  'Could not deliver verification e-mail': {
    ru: 'Не удалось отправить письмо с кодом. Попробуйте позже.',
    en: 'The verification e-mail could not be delivered. Try again later.',
  },
  'Этот username уже занят': {
    ru: 'Этот username уже занят.',
    en: 'This username is already taken.',
  },
  'Username должен содержать только латинские буквы и цифры, от 3 до 32 символов': {
    ru: 'Username может содержать только латинские буквы и цифры, от 3 до 32 символов.',
    en: 'Username must use 3 to 32 Latin letters or numbers only.',
  },
  'Пароль должен содержать только латинские буквы и цифры, от 5 до 30 символов': {
    ru: 'Пароль может содержать только латинские буквы и цифры, от 5 до 30 символов.',
    en: 'Password must use 5 to 30 Latin letters or numbers only.',
  },
  'Для регистрации нужно принять Политику конфиденциальности и Пользовательское соглашение': {
    ru: 'Для регистрации необходимо принять Политику конфиденциальности и Условия использования.',
    en: 'Accept the Privacy policy and Terms of use to register.',
  },
  'Invalid refresh token': {
    ru: 'Сессия истекла. Войдите снова.',
    en: 'Your session has expired. Sign in again.',
  },
  'Display name is required': {
    ru: 'Укажите отображаемое имя.',
    en: 'Enter a display name.',
  },
  'User not found': {
    ru: 'Пользователь не найден.',
    en: 'User not found.',
  },
  'Cannot create direct chat with yourself': {
    ru: 'Нельзя создать личный чат с собой.',
    en: 'You cannot create a direct chat with yourself.',
  },
  'This interaction is unavailable.': {
    ru: 'Это взаимодействие недоступно.',
    en: 'This interaction is unavailable.',
  },
  'Chat not found': {
    ru: 'Чат не найден или больше недоступен.',
    en: 'The chat was not found or is no longer available.',
  },
  'Text message cannot be empty': {
    ru: 'Текст сообщения не может быть пустым.',
    en: 'The message text cannot be empty.',
  },
  'Text message is too long': {
    ru: 'Текст сообщения не может быть длиннее 4 000 символов.',
    en: 'The message text cannot exceed 4,000 characters.',
  },
  'Public branch not found': {
    ru: 'Публичный канал не найден.',
    en: 'The public channel was not found.',
  },
  'This branch address is already in use': {
    ru: 'Этот адрес канала уже занят.',
    en: 'This channel address is already in use.',
  },
  'Channel avatar cannot be empty': {
    ru: 'Аватар канала не может быть пустым.',
    en: 'The channel avatar cannot be empty.',
  },
  'Invite link is invalid or revoked': {
    ru: 'Ссылка-приглашение недействительна или отозвана.',
    en: 'The invitation link is invalid or has been revoked.',
  },
  'Channel not found': {
    ru: 'Канал не найден или больше недоступен.',
    en: 'The channel was not found or is no longer available.',
  },
  'Group not found': {
    ru: 'Группа не найдена или больше недоступна.',
    en: 'The group was not found or is no longer available.',
  },
  'Only the group owner can edit this group': {
    ru: 'Изменять оформление группы может только её владелец.',
    en: 'Only the group owner can edit this group.',
  },
  'Only the group owner can delete this group': {
    ru: 'Удалить группу может только её владелец.',
    en: 'Only the group owner can delete this group.',
  },
  'Group avatar cannot be empty': {
    ru: 'Аватар группы не может быть пустым.',
    en: 'The group avatar cannot be empty.',
  },
  'User is already a group member': {
    ru: 'Этот пользователь уже состоит в группе.',
    en: 'This user is already a group member.',
  },
  'Transfer group ownership before leaving': {
    ru: 'Перед выходом передайте владение группой другому участнику.',
    en: 'Transfer group ownership before leaving.',
  },
  'Group member not found': {
    ru: 'Участник группы не найден.',
    en: 'The group member was not found.',
  },
  'Leave the group instead of removing yourself': {
    ru: 'Чтобы выйти из группы, используйте действие выхода.',
    en: 'Leave the group instead of removing yourself.',
  },
  'Group owner cannot be removed': {
    ru: 'Владельца группы нельзя удалить.',
    en: 'The group owner cannot be removed.',
  },
  'Only the group owner can change member roles': {
    ru: 'Изменять роли участников может только владелец группы.',
    en: 'Only the group owner can change member roles.',
  },
  'Unsupported group role': {
    ru: 'Такая роль в группе не поддерживается.',
    en: 'This group role is not supported.',
  },
  'Use ownership transfer to change the owner role': {
    ru: 'Чтобы изменить роль владельца, используйте передачу владения.',
    en: 'Use ownership transfer to change the owner role.',
  },
  'Only the group owner can transfer ownership': {
    ru: 'Передать владение может только владелец группы.',
    en: 'Only the group owner can transfer ownership.',
  },
  'Select another group member as the owner': {
    ru: 'Выберите другого участника группы новым владельцем.',
    en: 'Select another group member as the owner.',
  },
  'Only group administrators can manage this group': {
    ru: 'Управлять этой группой могут только её владелец и администраторы.',
    en: 'Only group administrators can manage this group.',
  },
  'Active user not found': {
    ru: 'Активный пользователь не найден.',
    en: 'The active user was not found.',
  },
  'Transfer channel ownership before leaving': {
    ru: 'Перед выходом передайте права владельца другому участнику.',
    en: 'Transfer channel ownership before leaving.',
  },
  'Channel member not found': {
    ru: 'Участник канала не найден.',
    en: 'The channel member was not found.',
  },
  'Unsupported channel role': {
    ru: 'Такая роль в канале не поддерживается.',
    en: 'This channel role is not supported.',
  },
  'Use ownership transfer before changing your own role': {
    ru: 'Чтобы изменить свою роль, сначала передайте права владельца.',
    en: 'Transfer ownership before changing your own role.',
  },
  'Only the channel owner can transfer ownership': {
    ru: 'Передать права владельца может только владелец канала.',
    en: 'Only the channel owner can transfer ownership.',
  },
  'Transfer channel ownership before changing the owner role': {
    ru: 'Чтобы изменить роль владельца, сначала передайте права владельца.',
    en: 'Transfer ownership before changing the owner role.',
  },
  'Only the channel owner can change member roles': {
    ru: 'Изменять роли участников может только владелец канала.',
    en: 'Only the channel owner can change member roles.',
  },
  'Leave the channel instead of removing yourself': {
    ru: 'Чтобы выйти из канала, используйте действие выхода.',
    en: 'Leave the channel instead of removing yourself.',
  },
  'Channel owner cannot be removed': {
    ru: 'Владельца канала нельзя удалить.',
    en: 'The channel owner cannot be removed.',
  },
  'Administrators can remove members only': {
    ru: 'Администраторы могут удалять только участников.',
    en: 'Administrators can remove members only.',
  },
  'Subscribe to this channel first': {
    ru: 'Сначала подпишитесь на этот канал.',
    en: 'Subscribe to this channel first.',
  },
  'Only channel administrators can manage this channel': {
    ru: 'Управлять этим каналом могут только его администраторы.',
    en: 'Only channel administrators can manage this channel.',
  },
  'Comments are disabled for this post': {
    ru: 'Комментарии к этой публикации отключены.',
    en: 'Comments are disabled for this post.',
  },
  'Subscribe to this branch to comment': {
    ru: 'Подпишитесь на этот канал, чтобы комментировать.',
    en: 'Subscribe to this channel to comment.',
  },
  'Comment cannot be empty': {
    ru: 'Комментарий не может быть пустым.',
    en: 'The comment cannot be empty.',
  },
  'Too many comments. Please try again in a minute': {
    ru: 'Слишком много комментариев. Попробуйте через минуту.',
    en: 'Too many comments. Please try again in a minute.',
  },
  'Only the author can edit this comment': {
    ru: 'Редактировать этот комментарий может только его автор.',
    en: 'Only the author can edit this comment.',
  },
  'Deleted comment cannot be edited': {
    ru: 'Удалённый комментарий нельзя изменить.',
    en: 'A deleted comment cannot be edited.',
  },
  'Only the author or a branch administrator can delete this comment': {
    ru: 'Удалить этот комментарий может только автор или администратор канала.',
    en: 'Only the author or a channel administrator can delete this comment.',
  },
  'Branch not found': {
    ru: 'Канал не найден или больше недоступен.',
    en: 'The channel was not found or is no longer available.',
  },
  'Branch post not found': {
    ru: 'Публикация канала не найдена.',
    en: 'The channel post was not found.',
  },
  'Comment not found': {
    ru: 'Комментарий не найден или уже удалён.',
    en: 'The comment was not found or has already been deleted.',
  },
  'Only branch administrators can post': {
    ru: 'Публиковать сообщения могут только администраторы канала.',
    en: 'Only channel administrators can post.',
  },
};

const KAZAKH_ERROR_MESSAGES = {
  'Invalid login identifier or password': 'E-mail немесе құпиясөз қате.',
  'Login identifier is required': 'E-mail мекенжайын енгізіңіз.',
  'Email is already registered': 'Бұл e-mail бұрын тіркелген.',
  'Email verification request not found': 'E-mail растау сұрауы табылмады. Кодты қайта сұратыңыз.',
  'Email verification request is already used': 'Бұл код бұрын қолданылған. Жаңасын сұратыңыз.',
  'Email verification request is expired': 'Кодтың жарамдылық мерзімі аяқталды. Жаңасын сұратыңыз.',
  'Invalid e-mail confirmation code': 'Хаттағы код қате.',
  'E-mail confirmation code is not available': 'Растау коды қолжетімсіз. Жаңасын сұратыңыз.',
  'E-mail verification is not available on this device': 'E-mail мекенжайын код сұратылған құрылғыда растаңыз.',
  'Too many e-mail verification requests. Try again later': 'Код сұраулары тым көп. Кейінірек қайталап көріңіз.',
  'Too many authentication requests. Try again later': 'Әрекеттер тым көп. Кейінірек қайталап көріңіз.',
  'SMTP e-mail delivery is not configured': 'Серверде e-mail жеткізу әлі бапталмаған.',
  'Could not deliver verification e-mail': 'Коды бар хатты жіберу мүмкін болмады. Кейінірек қайталап көріңіз.',
  'Этот username уже занят': 'Бұл username бос емес.',
  'Username должен содержать только латинские буквы и цифры, от 3 до 32 символов': 'Username 3-тен 32-ге дейін тек латын әріптері мен сандарынан тұруы керек.',
  'Пароль должен содержать только латинские буквы и цифры, от 5 до 30 символов': 'Құпиясөз 5-тен 30-ға дейін тек латын әріптері мен сандарынан тұруы керек.',
  'Для регистрации нужно принять Политику конфиденциальности и Пользовательское соглашение': 'Тіркелу үшін Құпиялылық саясаты мен Пайдалану шарттарын қабылдаңыз.',
  'Invalid refresh token': 'Сессия мерзімі аяқталды. Қайта кіріңіз.',
  'Display name is required': 'Көрсетілетін атты енгізіңіз.',
  'User not found': 'Пайдаланушы табылмады.',
  'Cannot create direct chat with yourself': 'Өзіңізбен жеке чат ашу мүмкін емес.',
  'This interaction is unavailable.': 'Бұл әрекет қолжетімсіз.',
  'Chat not found': 'Чат табылмады немесе енді қолжетімсіз.',
  'Text message cannot be empty': 'Хабарлама мәтіні бос болмауы керек.',
  'Text message is too long': 'Хабарлама мәтіні 4 000 таңбадан аспауы керек.',
  'Public branch not found': 'Ашық арна табылмады.',
  'This branch address is already in use': 'Бұл арна мекенжайы бос емес.',
  'Channel avatar cannot be empty': 'Арна аватары бос болмауы керек.',
  'Invite link is invalid or revoked': 'Шақыру сілтемесі жарамсыз немесе кері қайтарылған.',
  'Channel not found': 'Арна табылмады немесе енді қолжетімсіз.',
  'Group not found': 'Топ табылмады немесе енді қолжетімсіз.',
  'Only the group owner can edit this group': 'Топ безендіруін тек оның иесі өзгерте алады.',
  'Only the group owner can delete this group': 'Топты тек оның иесі жоя алады.',
  'Group avatar cannot be empty': 'Топ аватары бос болмауы керек.',
  'User is already a group member': 'Бұл пайдаланушы топта әлдеқашан бар.',
  'Transfer group ownership before leaving': 'Шығу алдында топ иелігін басқа қатысушыға беріңіз.',
  'Group member not found': 'Топ қатысушысы табылмады.',
  'Leave the group instead of removing yourself': 'Өзіңізді жоюдың орнына топтан шығыңыз.',
  'Group owner cannot be removed': 'Топ иесін жоюға болмайды.',
  'Only the group owner can change member roles': 'Қатысушылардың рөлдерін тек топ иесі өзгерте алады.',
  'Unsupported group role': 'Мұндай топ рөліне қолдау көрсетілмейді.',
  'Use ownership transfer to change the owner role': 'Иесінің рөлін өзгерту үшін иелікті беруді пайдаланыңыз.',
  'Only the group owner can transfer ownership': 'Иелікті тек топ иесі бере алады.',
  'Select another group member as the owner': 'Жаңа иесі ретінде басқа топ қатысушысын таңдаңыз.',
  'Only group administrators can manage this group': 'Бұл топты тек оның иесі мен әкімшілері басқара алады.',
  'Active user not found': 'Белсенді пайдаланушы табылмады.',
  'Transfer channel ownership before leaving': 'Шығу алдында иелік құқығын басқа қатысушыға беріңіз.',
  'Channel member not found': 'Арна қатысушысы табылмады.',
  'Unsupported channel role': 'Мұндай арна рөліне қолдау көрсетілмейді.',
  'Use ownership transfer before changing your own role': 'Өз рөліңізді өзгерту алдында иелікті беріңіз.',
  'Only the channel owner can transfer ownership': 'Иелікті тек арна иесі бере алады.',
  'Transfer channel ownership before changing the owner role': 'Иесінің рөлін өзгерту алдында иелікті беріңіз.',
  'Only the channel owner can change member roles': 'Қатысушылардың рөлдерін тек арна иесі өзгерте алады.',
  'Leave the channel instead of removing yourself': 'Өзіңізді жоюдың орнына арнадан шығыңыз.',
  'Channel owner cannot be removed': 'Арна иесін жоюға болмайды.',
  'Administrators can remove members only': 'Әкімшілер тек қатысушыларды жоя алады.',
  'Subscribe to this channel first': 'Алдымен осы арнаға жазылыңыз.',
  'Only channel administrators can manage this channel': 'Бұл арнаны тек оның әкімшілері басқара алады.',
  'Comments are disabled for this post': 'Бұл жарияланымда пікірлер өшірілген.',
  'Subscribe to this branch to comment': 'Пікір жазу үшін осы арнаға жазылыңыз.',
  'Comment cannot be empty': 'Пікір бос болмауы керек.',
  'Too many comments. Please try again in a minute': 'Пікір тым көп. Бір минуттан кейін қайталап көріңіз.',
  'Only the author can edit this comment': 'Бұл пікірді тек авторы өңдей алады.',
  'Deleted comment cannot be edited': 'Жойылған пікірді өңдеуге болмайды.',
  'Only the author or a branch administrator can delete this comment': 'Бұл пікірді тек авторы немесе арна әкімшісі жоя алады.',
  'Branch not found': 'Арна табылмады немесе енді қолжетімсіз.',
  'Branch post not found': 'Арна жарияланымы табылмады.',
  'Comment not found': 'Пікір табылмады немесе жойылған.',
  'Only branch administrators can post': 'Жарияланым жаза алатындар — тек арна әкімшілері.',
};

export class ApiRequestError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
  }
}

function currentLanguage() {
  const language = document.documentElement.lang;
  return ['en', 'kk'].includes(language) ? language : 'ru';
}

function translateApiError(detail, status) {
  const language = currentLanguage();
  if (typeof detail === 'string') {
    if (language === 'kk') return KAZAKH_ERROR_MESSAGES[detail] ?? detail;
    return ERROR_MESSAGES[detail]?.[language] ?? detail;
  }
  if (Array.isArray(detail)) {
    return {
      en: 'Check the form: one or more fields have an invalid format.',
      kk: 'Пішінді тексеріңіз: бір немесе бірнеше өріс қате толтырылған.',
      ru: 'Проверьте форму: один или несколько полей заполнены неверно.',
    }[language];
  }
  return {
    en: `The server returned an error (${status}).`,
    kk: `Сервер қатені қайтарды (${status}).`,
    ru: `Сервер вернул ошибку (${status}).`,
  }[language];
}

export function apiUrlFor(path) {
  if (!API_BASE_URL) {
    throw new ApiRequestError(
      {
        en: 'The AraChat API address is not configured for this build.',
        kk: 'AraChat API мекенжайы бұл жинақ үшін бапталмаған.',
        ru: 'Адрес API AraChat не настроен для этой сборки.',
      }[currentLanguage()],
    );
  }
  return `${API_BASE_URL}${path}`;
}

export async function apiRequest(path, options = {}) {
  const { body, headers, ...requestOptions } = options;
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
  let response;

  try {
    response = await fetch(apiUrlFor(path), {
      ...requestOptions,
      headers: {
        ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
        ...headers,
      },
      body: body === undefined ? undefined : isFormData ? body : JSON.stringify(body),
    });
  } catch (error) {
    if (error instanceof ApiRequestError) throw error;
    throw new ApiRequestError(
      {
        en: 'Could not connect to the AraChat server. Check your connection and try again.',
        kk: 'AraChat серверіне қосылу мүмкін болмады. Қосылымды тексеріп, қайталап көріңіз.',
        ru: 'Не удалось подключиться к серверу AraChat. Проверьте подключение и повторите попытку.',
      }[currentLanguage()],
    );
  }

  if (!response.ok) {
    const responseBody = await response.json().catch(() => null);
    throw new ApiRequestError(translateApiError(responseBody?.detail, response.status), response.status);
  }

  if (response.status === 204) return undefined;
  return response.json();
}
