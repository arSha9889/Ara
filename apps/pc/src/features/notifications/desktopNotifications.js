import { isTauri } from '@tauri-apps/api/core';
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification';

export async function notificationPermissionStatus() {
  if (!isTauri()) return 'unavailable';
  return (await isPermissionGranted()) ? 'granted' : 'default';
}

export async function requestDesktopNotificationPermission() {
  if (!isTauri()) return 'unavailable';
  if (await isPermissionGranted()) return 'granted';
  return requestPermission();
}

export async function showDesktopNotification({ title, body, soundEnabled }) {
  if (!isTauri() || !(await isPermissionGranted())) return false;

  sendNotification({
    title,
    body,
    silent: !soundEnabled,
  });
  return true;
}
