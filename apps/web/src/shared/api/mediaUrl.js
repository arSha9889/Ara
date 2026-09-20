import { useEffect, useState } from 'react';

import { API_BASE_URL, authenticatedFetch } from './httpClient.js';

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


function privateMediaPath(mediaUrl) {
  if (!/^\/api\/media\/[0-9a-f-]{36}$/i.test(mediaUrl || '')) return null;
  return mediaUrl;
}


export function useAuthenticatedMediaUrl(mediaUrl, accessToken) {
  const [state, setState] = useState({ url: '', isLoading: false, error: null });

  useEffect(() => {
    const requestPath = privateMediaPath(mediaUrl);
    if (!requestPath) {
      setState({ url: mediaUrlForBrowser(mediaUrl), isLoading: false, error: null });
      return undefined;
    }
    if (!accessToken) {
      setState({ url: '', isLoading: false, error: new Error('Authentication is required') });
      return undefined;
    }

    const controller = new AbortController();
    let objectUrl = '';
    let active = true;
    setState({ url: '', isLoading: true, error: null });

    async function loadMedia() {
      try {
        const response = await authenticatedFetch(requestPath, {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Media request failed: ${response.status}`);
        objectUrl = URL.createObjectURL(await response.blob());
        if (active) setState({ url: objectUrl, isLoading: false, error: null });
      } catch (error) {
        if (active && error.name !== 'AbortError') {
          setState({ url: '', isLoading: false, error });
        }
      }
    }

    void loadMedia();
    return () => {
      active = false;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [accessToken, mediaUrl]);

  return state;
}
