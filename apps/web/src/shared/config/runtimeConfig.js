export function getRuntimeConfigValue(key) {
  if (typeof window === 'undefined') return '';
  return window.__NEXUS_RUNTIME_CONFIG__?.[key] || '';
}
