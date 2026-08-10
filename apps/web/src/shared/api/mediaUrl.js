import { API_BASE_URL } from './httpClient.js';

const LOCAL_STORAGE_PATH = '/storage/uploads/';

function isLocalHost(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

export function mediaUrlForBrowser(mediaUrl) {
  if (!mediaUrl) return '';
  if (mediaUrl.startsWith(LOCAL_STORAGE_PATH)) return `${API_BASE_URL}${mediaUrl}`;

  try {
    const url = new URL(mediaUrl);
    const isLegacyLocalUrl = url.pathname.startsWith(LOCAL_STORAGE_PATH);
    const isMixedContent = typeof window !== 'undefined'
      && window.location.protocol === 'https:'
      && url.protocol === 'http:';
    const isCurrentHost = typeof window !== 'undefined' && url.hostname === window.location.hostname;

    if (isLegacyLocalUrl && isMixedContent && (API_BASE_URL || isCurrentHost || isLocalHost(url.hostname))) {
      return `${API_BASE_URL}${url.pathname}${url.search}${url.hash}`;
    }
  } catch {
    return '';
  }

  return mediaUrl;
}
