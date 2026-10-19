import { invoke, isTauri } from '@tauri-apps/api/core';

const SECURE_STORAGE_MESSAGES = {
  en: {
    clear_refresh_token: 'The system secure storage is unavailable. The saved session could not be removed from this device.',
    load_refresh_token: 'The system secure storage is unavailable. The saved session could not be restored.',
    save_refresh_token: 'The system secure storage is unavailable. Your session could not be saved on this device.',
  },
  ru: {
    clear_refresh_token: 'Системное защищённое хранилище недоступно. Не удалось удалить сохранённую сессию с этого устройства.',
    load_refresh_token: 'Системное защищённое хранилище недоступно. Не удалось восстановить сохранённую сессию.',
    save_refresh_token: 'Системное защищённое хранилище недоступно. Сессия не была сохранена на этом устройстве.',
  },
  kk: {
    clear_refresh_token: 'Жүйелік қорғалған қойма қолжетімсіз. Сақталған сессияны осы құрылғыдан жою мүмкін болмады.',
    load_refresh_token: 'Жүйелік қорғалған қойма қолжетімсіз. Сақталған сессияны қалпына келтіру мүмкін болмады.',
    save_refresh_token: 'Жүйелік қорғалған қойма қолжетімсіз. Сессия осы құрылғыда сақталмады.',
  },
};

function secureStorageError(command) {
  const language = ['en', 'kk'].includes(document.documentElement.lang) ? document.documentElement.lang : 'ru';
  return new Error(SECURE_STORAGE_MESSAGES[language][command]);
}

async function invokeSecureStorage(command, args) {
  try {
    return await invoke(command, args);
  } catch {
    throw secureStorageError(command);
  }
}

export async function saveStoredRefreshToken(refreshToken) {
  if (!isTauri()) return;
  await invokeSecureStorage('save_refresh_token', { refreshToken });
}

export async function loadStoredRefreshToken() {
  if (!isTauri()) return null;
  return invokeSecureStorage('load_refresh_token');
}

export async function clearStoredRefreshToken() {
  if (!isTauri()) return;
  await invokeSecureStorage('clear_refresh_token');
}
