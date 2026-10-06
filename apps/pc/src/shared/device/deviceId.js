const DEVICE_ID_KEY = 'arachat-desktop-device-id';

export function getDeviceId() {
  const existingDeviceId = window.localStorage.getItem(DEVICE_ID_KEY);
  if (existingDeviceId) return existingDeviceId;

  const deviceId = crypto.randomUUID();
  window.localStorage.setItem(DEVICE_ID_KEY, deviceId);
  return deviceId;
}
