const SERVICE_WORKER_PATH = '/service-worker.js';

function urlBase64ToUint8Array(value) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from(rawData, (character) => character.charCodeAt(0));
}

export function isPushSupported() {
  return 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
}

export async function getServiceWorkerRegistration() {
  if (!isPushSupported()) return null;
  return navigator.serviceWorker.register(SERVICE_WORKER_PATH, { scope: '/' });
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
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });
}
