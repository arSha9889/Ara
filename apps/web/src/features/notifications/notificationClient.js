const SERVICE_WORKER_PATH = '/service-worker.js';

function isLocalhost() {
  return ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
}

export function isStandaloneApp() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function isIOSLike() {
  const platform = navigator.userAgentData?.platform || navigator.platform || '';
  const userAgent = navigator.userAgent || '';
  return /iPhone|iPad|iPod/i.test(platform)
    || /iPhone|iPad|iPod/i.test(userAgent)
    || (platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function getPushSupportState() {
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { supported: false, reason: isIOSLike() && !isStandaloneApp() ? 'ios_install_required' : 'unsupported' };
  }
  if (isIOSLike() && !isStandaloneApp()) {
    return { supported: false, reason: 'ios_install_required' };
  }
  if (!window.isSecureContext && !isLocalhost()) {
    return { supported: false, reason: 'insecure_context' };
  }
  return { supported: true, reason: null };
}

function urlBase64ToUint8Array(value) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from(rawData, (character) => character.charCodeAt(0));
}

function applicationServerKeyFromBase64(value) {
  const bytes = urlBase64ToUint8Array(value);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function isSameApplicationServerKey(subscription, publicKey) {
  const currentKey = subscription.options?.applicationServerKey;
  if (!currentKey) return false;

  const expected = new Uint8Array(applicationServerKeyFromBase64(publicKey));
  const current = new Uint8Array(currentKey);
  if (expected.byteLength !== current.byteLength) return false;
  return expected.every((byte, index) => byte === current[index]);
}

export function isPushSupported() {
  return getPushSupportState().supported;
}

export async function getServiceWorkerRegistration() {
  if (!isPushSupported()) return null;
  const existing = await navigator.serviceWorker.getRegistration('/');
  if (existing) {
    await existing.update().catch(() => undefined);
    return navigator.serviceWorker.ready;
  }
  await navigator.serviceWorker.register(SERVICE_WORKER_PATH, { scope: '/' });
  return navigator.serviceWorker.ready;
}

export async function getPushSubscription() {
  const registration = await getServiceWorkerRegistration();
  return registration?.pushManager.getSubscription() ?? null;
}

export async function clearDisplayedNotifications() {
  if (!('serviceWorker' in navigator)) return;

  const registration = await navigator.serviceWorker.getRegistration('/');
  if (!registration) return;

  registration.active?.postMessage({ event: 'notifications.clear' });
  const notifications = await registration.getNotifications({ includeTriggered: true });
  notifications.forEach((notification) => notification.close());
}

export async function subscribeToPush(publicKey, { force = true } = {}) {
  const registration = await getServiceWorkerRegistration();
  if (!registration) throw new Error('Push notifications are not supported');
  const existingSubscription = await registration.pushManager.getSubscription();
  if (existingSubscription && !force && isSameApplicationServerKey(existingSubscription, publicKey)) {
    return existingSubscription;
  }
  if (existingSubscription) {
    await existingSubscription.unsubscribe();
  }
  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: applicationServerKeyFromBase64(publicKey),
  });
}

export function ensurePushSubscription(publicKey) {
  return subscribeToPush(publicKey, { force: false });
}
