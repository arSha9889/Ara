import type { CallIceServer } from './api/callApi';

export interface RtcIceServer {
  credential?: string;
  urls: string | string[];
  username?: string;
}

export interface RtcConfiguration {
  iceServers: RtcIceServer[];
  iceTransportPolicy: 'relay';
}

function normalizeUrls(value: unknown): string | string[] | null {
  if (typeof value === 'string') {
    const url = value.trim();
    return url || null;
  }

  if (!Array.isArray(value)) {
    return null;
  }

  const urls = value
    .filter((url): url is string => typeof url === 'string' && Boolean(url.trim()))
    .map(url => url.trim());

  return urls.length > 0 ? urls : null;
}

function normalizeIceServer(server: unknown): RtcIceServer | null {
  if (!server || typeof server !== 'object' || Array.isArray(server)) {
    return null;
  }

  const value = server as Partial<CallIceServer>;
  const urls = normalizeUrls(value.urls);
  if (!urls) {
    return null;
  }

  return {
    urls,
    ...(typeof value.username === 'string' && value.username
      ? { username: value.username }
      : {}),
    ...(typeof value.credential === 'string' && value.credential
      ? { credential: value.credential }
      : {}),
  };
}

export function getRtcConfiguration(servers: unknown): RtcConfiguration {
  const iceServers = Array.isArray(servers)
    ? servers
        .map(normalizeIceServer)
        .filter((server): server is RtcIceServer => Boolean(server))
    : [];

  return {
    iceServers,
    iceTransportPolicy: 'relay',
  };
}
