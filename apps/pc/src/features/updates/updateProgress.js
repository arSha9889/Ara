export function downloadProgressPercent(downloadedBytes, contentLength) {
  if (!Number.isFinite(downloadedBytes) || !Number.isFinite(contentLength) || contentLength <= 0) return null;
  return Math.min(100, Math.max(0, Math.round((downloadedBytes / contentLength) * 100)));
}
