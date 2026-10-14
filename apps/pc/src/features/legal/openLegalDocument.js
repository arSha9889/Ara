import { openUrl } from '@tauri-apps/plugin-opener';

const LEGAL_DOCUMENT_URLS = Object.freeze({
  privacy: 'https://aramsg.ru/privacy',
  terms: 'https://aramsg.ru/terms',
});

export async function openLegalDocument(documentType) {
  const url = LEGAL_DOCUMENT_URLS[documentType];
  if (!url) return;

  try {
    await openUrl(url);
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}
