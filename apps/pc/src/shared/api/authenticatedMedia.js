import { useEffect, useState } from 'react';

import { API_BASE_URL, apiUrlFor } from './apiClient.js';

const LOCAL_UPLOAD_PATH = '/storage/uploads/';
const PRIVATE_MEDIA_PATH = /^\/api\/media\/[0-9a-f-]{36}$/i;

export function mediaUrlForDesktop(mediaUrl) {
  if (!mediaUrl) return '';
  if (mediaUrl.startsWith(LOCAL_UPLOAD_PATH)) return API_BASE_URL ? `${API_BASE_URL}${mediaUrl}` : '';

  try {
    return new URL(mediaUrl).toString();
  } catch {
    return '';
  }
}

export function useAuthenticatedMediaUrl(mediaUrl, accessToken) {
  const [state, setState] = useState({ url: '', isLoading: false, error: null });

  useEffect(() => {
    if (!PRIVATE_MEDIA_PATH.test(mediaUrl || '')) {
      setState({ url: mediaUrlForDesktop(mediaUrl), isLoading: false, error: null });
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
        const response = await fetch(apiUrlFor(mediaUrl), {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Media request failed: ${response.status}`);
        objectUrl = URL.createObjectURL(await response.blob());
        if (active) setState({ url: objectUrl, isLoading: false, error: null });
      } catch (error) {
        if (active && error.name !== 'AbortError') setState({ url: '', isLoading: false, error });
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
