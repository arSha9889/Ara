import { apiRequest } from '../../../shared/api/httpClient.js';

function languageParam(language) {
  return new URLSearchParams({ language }).toString();
}

export function getPublishedProjectNews(language) {
  return apiRequest(`/api/news?${languageParam(language)}`);
}

export function getPublishedProjectNewsArticle(slug, language) {
  return apiRequest(`/api/news/${encodeURIComponent(slug)}?${languageParam(language)}`);
}
