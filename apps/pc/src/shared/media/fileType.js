const MIME_ALIASES = new Map([
  ['audio/mp3', 'audio/mpeg'],
  ['audio/x-mp3', 'audio/mpeg'],
  ['audio/x-mpeg', 'audio/mpeg'],
  ['audio/x-wav', 'audio/wav'],
  ['audio/wave', 'audio/wav'],
  ['audio/vnd.wave', 'audio/wav'],
  ['audio/x-m4a', 'audio/mp4'],
  ['audio/x-aac', 'audio/aac'],
  ['audio/x-ogg', 'audio/ogg'],
  ['image/jpg', 'image/jpeg'],
  ['image/pjpeg', 'image/jpeg'],
  ['image/x-png', 'image/png'],
  ['video/x-m4v', 'video/mp4'],
]);

const MIME_TYPES_BY_EXTENSION = new Map([
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.jpe', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.gif', 'image/gif'],
  ['.webp', 'image/webp'],
  ['.heic', 'image/heic'],
  ['.heif', 'image/heif'],
  ['.avif', 'image/avif'],
  ['.mp4', 'video/mp4'],
  ['.m4v', 'video/mp4'],
  ['.webm', 'video/webm'],
  ['.mov', 'video/quicktime'],
  ['.aac', 'audio/aac'],
  ['.m4a', 'audio/mp4'],
  ['.mp3', 'audio/mpeg'],
  ['.ogg', 'audio/ogg'],
  ['.oga', 'audio/ogg'],
  ['.wav', 'audio/wav'],
  ['.txt', 'text/plain'],
  ['.pdf', 'application/pdf'],
]);

export const ACCEPTED_FILE_TYPES = [
  ...MIME_TYPES_BY_EXTENSION.keys(),
  ...new Set(MIME_TYPES_BY_EXTENSION.values()),
].join(',');

export function mimeTypeForFile(file) {
  const declaredMimeType = normalizeMimeType(file?.type);
  const canonicalMimeType = MIME_ALIASES.get(declaredMimeType) || declaredMimeType;
  const extension = extensionForFileName(file?.name);
  if (canonicalMimeType && canonicalMimeType !== 'application/octet-stream') return canonicalMimeType;
  return MIME_TYPES_BY_EXTENSION.get(extension) || canonicalMimeType || 'application/octet-stream';
}

export function normalizeMimeType(value) {
  const normalized = typeof value === 'string' ? value.split(';', 1)[0].trim().toLowerCase() : '';
  return MIME_ALIASES.get(normalized) || normalized;
}

function extensionForFileName(name) {
  if (typeof name !== 'string') return '';
  const lastDot = name.lastIndexOf('.');
  return lastDot === -1 ? '' : name.slice(lastDot).toLowerCase();
}
