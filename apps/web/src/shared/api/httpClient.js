export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';

const API_ERROR_MESSAGES = {
  'Username contains invalid characters': 'Username должен содержать только латинские буквы и цифры, от 3 до 32 символов.',
  'Username is already taken': 'Этот username уже занят.',
  'Password contains invalid characters': 'Пароль должен содержать только латинские буквы и цифры, от 5 до 30 символов.',
  'PIN must contain 4-8 digits': 'PIN должен содержать от 4 до 8 цифр.',
  'Invalid Nexus ID or password': 'Неверный Nexus ID или пароль.',
  'Invalid Nexus ID or PIN': 'Неверный Nexus ID или PIN.',
  'PIN is not available for this device': 'PIN недоступен на этом устройстве.',
  'PIN is locked': 'PIN временно заблокирован из-за нескольких неверных попыток.',
  'PIN is expired on this device': 'PIN на этом устройстве истёк. Войдите по паролю.',
  'Invalid current password': 'Неверный текущий пароль.',
  'Invalid Nexus ID or recovery code': 'Неверный Nexus ID или резервный код.',
  'Recovery code is locked': 'Резервный код временно заблокирован из-за нескольких неверных попыток.',
  'Unsupported avatar type': 'Неподдерживаемый тип аватара.',
  'Unsupported built-in avatar': 'Такой стандартный аватар недоступен.',
  'Unsupported uploaded avatar': 'Загруженный аватар имеет неподдерживаемый формат.',
  'Unsupported language': 'Неподдерживаемый язык интерфейса.',
  'Unsupported design theme': 'Неподдерживаемая тема оформления.',
  'User not found': 'Пользователь не найден.',
  'Profile not found': 'Профиль не найден.',
  'Early access registration limit is reached': 'Лимит раннего доступа исчерпан.',
  'Telegram identity is already registered': 'Этот Telegram-аккаунт уже зарегистрирован.',
  'Session user not found': 'Пользователь текущей сессии не найден. Войдите заново.',
  'Invalid refresh token': 'Сессия истекла. Войдите заново.',
  'Could not generate unique Nexus ID': 'Не удалось создать уникальный Nexus ID. Попробуйте ещё раз.',
  'Unsupported upload type': 'Неподдерживаемый тип файла.',
  'Upload is too large': 'Файл слишком большой.',
  'Upload is empty': 'Файл пустой.',
  'Upload content does not match declared type': 'Содержимое файла не совпадает с его типом.',
  'Username должен содержать только латинские буквы и цифры, от 3 до 32 символов': 'Username должен содержать только латинские буквы и цифры, от 3 до 32 символов.',
  'Пароль должен содержать только латинские буквы и цифры, от 5 до 30 символов': 'Пароль должен содержать только латинские буквы и цифры, от 5 до 30 символов.',
  'PIN должен содержать от 4 до 8 цифр': 'PIN должен содержать от 4 до 8 цифр.',
  'Этот username уже занят': 'Этот username уже занят.',
};

export function translateApiError(detail, fallbackStatus) {
  if (typeof detail === 'string') {
    return API_ERROR_MESSAGES[detail] ?? detail;
  }
  if (Array.isArray(detail) && detail.length > 0) {
    return 'Проверьте заполнение формы: некоторые поля имеют неверный формат.';
  }
  return `Ошибка запроса к API: ${fallbackStatus}`;
}

export async function apiRequest(path, options = {}) {
  const { body, headers, ...restOptions } = options;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    credentials: 'include',
    body: body ? JSON.stringify(body) : undefined,
    ...restOptions,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new Error(translateApiError(errorBody?.detail, response.status));
  }

  return response.json();
}
