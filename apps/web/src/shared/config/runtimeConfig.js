export function getRuntimeConfigValue(key) {
  if (typeof window === 'undefined') return '';
  return window.__NEXUS_RUNTIME_CONFIG__?.[key] || '';
}

export function safeHttpsUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return '';

  try {
    const url = new URL(value.trim());
    if (
      url.protocol !== 'https:'
      || !url.hostname
      || url.username
      || url.password
      || url.search
      || url.hash
    ) {
      return '';
    }
    return url.toString();
  } catch {
    return '';
  }
}

export function getRuntimeHttpsUrl(key) {
  return safeHttpsUrl(getRuntimeConfigValue(key));
}
