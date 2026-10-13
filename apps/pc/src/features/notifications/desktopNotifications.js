import { isTauri } from '@tauri-apps/api/core';
import {
  isPermissionGranted,
  onAction,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification';
import { notificationId, notificationTarget } from './notificationTarget.js';

const actionSubscribers = new Set();
const pendingActions = [];
let actionListenerPromise = null;

function actionPayload(event) {
  if (event?.actionId !== 'tap') return null;
  const payload = event.notification?.extra?.arachat_notification;
  if (!payload || typeof payload !== 'object') return null;
  if (!notificationId(payload) || !notificationTarget(payload.target)) return null;
  return payload;
}

function dispatchAction(payload) {
  if (!actionSubscribers.size) {
    pendingActions.push(payload);
    if (pendingActions.length > 10) pendingActions.shift();
    return;
  }
  actionSubscribers.forEach((subscriber) => subscriber(payload));
}

async function ensureActionListener() {
  if (actionListenerPromise) return actionListenerPromise;
  actionListenerPromise = onAction((event) => {
    const payload = actionPayload(event);
    if (payload) dispatchAction(payload);
  }).catch((error) => {
    actionListenerPromise = null;
    throw error;
  });
  return actionListenerPromise;
}

export async function notificationPermissionStatus() {
  if (!isTauri()) return 'unavailable';
  return (await isPermissionGranted()) ? 'granted' : 'default';
}

export async function requestDesktopNotificationPermission() {
  if (!isTauri()) return 'unavailable';
  if (await isPermissionGranted()) return 'granted';
  return requestPermission();
}

export async function subscribeDesktopNotificationActions(subscriber) {
  if (!isTauri() || typeof subscriber !== 'function') return () => undefined;
  actionSubscribers.add(subscriber);
  try {
    await ensureActionListener();
    pendingActions.splice(0).forEach((payload) => subscriber(payload));
  } catch (error) {
    actionSubscribers.delete(subscriber);
    throw error;
  }
  return () => actionSubscribers.delete(subscriber);
}

export async function showDesktopNotification({ accountId, body, notification, soundEnabled, title }) {
  if (!isTauri() || !(await isPermissionGranted())) return false;
  const id = notificationId(notification);
  const target = notificationTarget(notification);
  if (!id || !target) return false;

  await sendNotification({
    title,
    body,
    silent: !soundEnabled,
    extra: {
      arachat_notification: {
        id,
        account_id: typeof accountId === 'string' ? accountId : '',
        target,
      },
    },
  });
  return true;
}
