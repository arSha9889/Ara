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
};

export class ApiRequestError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
  }
}

function currentLanguage() {
  return document.documentElement.lang === 'en' ? 'en' : 'ru';
}

function translateApiError(detail, status) {
  const language = currentLanguage();
  if (typeof detail === 'string') return ERROR_MESSAGES[detail]?.[language] ?? detail;
  if (Array.isArray(detail)) {
    return language === 'en'
      ? 'Check the form: one or more fields have an invalid format.'
      : 'Проверьте форму: один или несколько полей заполнены неверно.';
  }
  return language === 'en'
    ? `The server returned an error (${status}).`
    : `Сервер вернул ошибку (${status}).`;
}

export function apiUrlFor(path) {
  if (!API_BASE_URL) {
    throw new ApiRequestError(
      currentLanguage() === 'en'
        ? 'The AraChat API address is not configured for this build.'
        : 'Адрес API AraChat не настроен для этой сборки.',
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
      currentLanguage() === 'en'
        ? 'Could not connect to the AraChat server. Check your connection and try again.'
        : 'Не удалось подключиться к серверу AraChat. Проверьте подключение и повторите попытку.',
    );
  }

  if (!response.ok) {
    const responseBody = await response.json().catch(() => null);
    throw new ApiRequestError(translateApiError(responseBody?.detail, response.status), response.status);
  }

  return response.json();
}
