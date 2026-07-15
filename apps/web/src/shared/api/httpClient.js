export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';

export const ACCESS_TOKEN_STORAGE_KEY = 'nexus_access_token';
export const REFRESH_TOKEN_STORAGE_KEY = 'nexus_refresh_token';

let authSessionHandlers = {
  onRefresh: null,
  onExpire: null,
};
let refreshPromise = null;

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

export function configureAuthSessionHandlers(handlers) {
  authSessionHandlers = {
    onRefresh: handlers?.onRefresh ?? null,
    onExpire: handlers?.onExpire ?? null,
  };
}

function isRefreshEndpoint(path) {
  return path === '/api/auth/refresh';
}

function getAuthorizationHeader(headers) {
  return new Headers(headers ?? {}).get('Authorization') ?? '';
}

function withAccessToken(headers, accessToken) {
  const nextHeaders = new Headers(headers ?? {});
  nextHeaders.set('Authorization', `Bearer ${accessToken}`);
  return nextHeaders;
}

async function parseErrorMessage(response) {
  const errorBody = await response.json().catch(() => null);
  return translateApiError(errorBody?.detail, response.status);
}

async function refreshStoredSession() {
  if (refreshPromise) return refreshPromise;

  const refreshToken = localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);
  if (!refreshToken) {
    throw new Error(API_ERROR_MESSAGES['Invalid refresh token']);
  }

  refreshPromise = (async () => {
    const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!response.ok) {
      localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
      localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
      authSessionHandlers.onExpire?.();
      throw new Error(await parseErrorMessage(response));
    }

    const refreshed = await response.json();
    localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, refreshed.access_token);
    localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, refreshed.refresh_token);
    authSessionHandlers.onRefresh?.({
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token,
      user: refreshed.user,
    });
    return refreshed;
  })().finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
}

function shouldRefreshAfterUnauthorized(path, optionsHeaders, skipAuthRefresh) {
  return !skipAuthRefresh
    && !isRefreshEndpoint(path)
    && getAuthorizationHeader(optionsHeaders).startsWith('Bearer ')
    && Boolean(localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY));
}

export async function authenticatedFetch(path, options = {}) {
  const { headers, skipAuthRefresh = false, ...restOptions } = options;
  let requestHeaders = headers;
  let response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: 'include',
    headers: requestHeaders,
    ...restOptions,
  });

  if (response.status === 401 && shouldRefreshAfterUnauthorized(path, requestHeaders, skipAuthRefresh)) {
    const refreshed = await refreshStoredSession();
    requestHeaders = withAccessToken(requestHeaders, refreshed.access_token);
    response = await fetch(`${API_BASE_URL}${path}`, {
      credentials: 'include',
      headers: requestHeaders,
      ...restOptions,
    });
  }

  return response;
}

export async function apiRequest(path, options = {}) {
  const { body, headers, skipAuthRefresh = false, ...restOptions } = options;
  let requestHeaders = {
    'Content-Type': 'application/json',
    ...headers,
  };
  let response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      ...requestHeaders,
    },
    credentials: 'include',
    body: body ? JSON.stringify(body) : undefined,
    ...restOptions,
  });

  if (response.status === 401 && shouldRefreshAfterUnauthorized(path, requestHeaders, skipAuthRefresh)) {
    const refreshed = await refreshStoredSession();
    requestHeaders = withAccessToken(requestHeaders, refreshed.access_token);
    response = await fetch(`${API_BASE_URL}${path}`, {
      headers: requestHeaders,
      credentials: 'include',
      body: body ? JSON.stringify(body) : undefined,
      ...restOptions,
    });
  }

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }

  return response.json();
}
