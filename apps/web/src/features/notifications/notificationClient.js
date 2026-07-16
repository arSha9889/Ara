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

export function isPushSupported() {
  return getPushSupportState().supported;
}

export async function getServiceWorkerRegistration() {
  if (!isPushSupported()) return null;
  const existing = await navigator.serviceWorker.getRegistration('/');
  if (existing) return existing;
  await navigator.serviceWorker.register(SERVICE_WORKER_PATH, { scope: '/' });
  return navigator.serviceWorker.ready;
}

export async function getPushSubscription() {
  const registration = await getServiceWorkerRegistration();
  return registration?.pushManager.getSubscription() ?? null;
}

export async function subscribeToPush(publicKey) {
  const registration = await getServiceWorkerRegistration();
  if (!registration) throw new Error('Push notifications are not supported');
  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: applicationServerKeyFromBase64(publicKey),
  });
}
