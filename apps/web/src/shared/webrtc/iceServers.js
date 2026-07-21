import { getRuntimeConfigValue } from '../config/runtimeConfig.js';

const DEFAULT_ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

function normalizeUrls(urls) {
  if (typeof urls === 'string' && urls.trim()) return urls.trim();
  if (Array.isArray(urls)) {
    return urls.filter((url) => typeof url === 'string' && url.trim()).map((url) => url.trim());
  }
  return null;
}

function normalizeIceServer(server) {
  if (!server || typeof server !== 'object') return null;
  const urls = normalizeUrls(server.urls);
  if (!urls || (Array.isArray(urls) && urls.length === 0)) return null;

  return {
    urls,
    ...(typeof server.username === 'string' && server.username ? { username: server.username } : {}),
    ...(typeof server.credential === 'string' && server.credential ? { credential: server.credential } : {}),
  };
}

export function getRtcIceServers() {
  const rawConfig = getRuntimeConfigValue('VITE_RTC_ICE_SERVERS') || import.meta.env.VITE_RTC_ICE_SERVERS || '';
  if (!rawConfig.trim()) return DEFAULT_ICE_SERVERS;

  try {
    const parsed = JSON.parse(rawConfig);
    if (!Array.isArray(parsed)) return DEFAULT_ICE_SERVERS;
    const servers = parsed.map(normalizeIceServer).filter(Boolean);
    return servers.length ? servers : DEFAULT_ICE_SERVERS;
  } catch {
    return DEFAULT_ICE_SERVERS;
  }
}

export function getRtcConfiguration() {
  return {
    iceServers: getRtcIceServers(),
  };
}
