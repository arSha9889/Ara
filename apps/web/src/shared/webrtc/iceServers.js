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

export function getRtcIceServers(servers) {
  if (!Array.isArray(servers)) return [];
  return servers.map(normalizeIceServer).filter(Boolean);
}

export function getRtcConfiguration(iceServers) {
  return {
    iceServers: getRtcIceServers(iceServers),
    iceTransportPolicy: 'relay',
  };
}
