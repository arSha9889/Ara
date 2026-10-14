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

export function useAuthenticatedMediaBlob(mediaUrl, accessToken) {
  const [state, setState] = useState({ blob: null, isLoading: false, error: null });

  useEffect(() => {
    if (!PRIVATE_MEDIA_PATH.test(mediaUrl || '')) {
      setState({ blob: null, isLoading: false, error: null });
      return undefined;
    }
    if (!accessToken) {
      setState({ blob: null, isLoading: false, error: new Error('Authentication is required') });
      return undefined;
    }

    const controller = new AbortController();
    let active = true;
    setState({ blob: null, isLoading: true, error: null });

    async function loadMedia() {
      try {
        const response = await fetch(apiUrlFor(mediaUrl), {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Media request failed: ${response.status}`);
        const blob = await response.blob();
        if (active) setState({ blob, isLoading: false, error: null });
      } catch (error) {
        if (active && error.name !== 'AbortError') setState({ blob: null, isLoading: false, error });
      }
    }

    void loadMedia();
    return () => {
      active = false;
      controller.abort();
    };
  }, [accessToken, mediaUrl]);

  return state;
}

export function useAuthenticatedMediaUrl(mediaUrl, accessToken) {
  const { blob, isLoading, error } = useAuthenticatedMediaBlob(mediaUrl, accessToken);
  const [url, setUrl] = useState('');

  useEffect(() => {
    if (!PRIVATE_MEDIA_PATH.test(mediaUrl || '')) {
      setUrl(mediaUrlForDesktop(mediaUrl));
      return undefined;
    }
    if (!blob) {
      setUrl('');
      return undefined;
    }

    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob, mediaUrl]);

  return { url, isLoading, error };
}
