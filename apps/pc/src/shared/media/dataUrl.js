const BASE64_CHUNK_SIZE = 0x8000;

export async function dataUrlForBlob(blob) {
  if (!blob || typeof blob.arrayBuffer !== 'function') {
    throw new TypeError('A Blob-like value is required');
  }

  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let start = 0; start < bytes.length; start += BASE64_CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(start, start + BASE64_CHUNK_SIZE));
  }

  return `data:${blob.type || 'application/octet-stream'};base64,${btoa(binary)}`;
}
