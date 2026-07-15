import { authenticatedFetch, translateApiError } from '../../../shared/api/httpClient.js';

export async function uploadMedia(accessToken, file) {
  const formData = new FormData();
  formData.append('file', file);

  const response = await authenticatedFetch('/api/uploads', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    credentials: 'include',
    body: formData,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new Error(translateApiError(errorBody?.detail, response.status));
  }

  return response.json();
}


export async function uploadAvatar(accessToken, file) {
  const formData = new FormData();
  formData.append('file', file);

  const response = await authenticatedFetch('/api/uploads/avatar', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    credentials: 'include',
    body: formData,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new Error(translateApiError(errorBody?.detail, response.status));
  }

  return response.json();
}
