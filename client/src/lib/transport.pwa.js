import { ApiError, filenameFrom, splitPath } from './apiError.js';
import { dispatchRequest, onSuperseded, workerInfo } from './workerTransport.js';

export { onSuperseded };

/**
 * Lớp vận chuyển của bản PWA: không có server, request đi thẳng vào bảng route trong Web Worker
 * (xem ./workerTransport.js và ../worker/apiWorker.js). Cùng bộ export với ./transport.js của bản
 * Windows; Vite chọn file nào lúc build (xem alias trong vite.config.js).
 */

export const IS_PWA = true;

function unwrap(response) {
  if (response.status === 204) return null;
  if (response.status >= 400) throw new ApiError(response.status, response.body);
  return response.body ?? null;
}

export async function requestJson(method, path, body) {
  const { path: clean, query } = splitPath(path);
  return unwrap(await dispatchRequest({ method, path: clean, query, body }));
}

export async function requestBinary(method, path, blob) {
  const { path: clean, query } = splitPath(path);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const response = await dispatchRequest({
    method,
    path: clean,
    query,
    body: bytes,
    headers: { 'content-type': blob.type || 'application/octet-stream' },
  });
  return unwrap(response);
}

export async function requestDownload(method, path, body) {
  const { path: clean, query } = splitPath(path);
  const response = await dispatchRequest({ method, path: clean, query, body });
  if (response.status >= 400) throw new ApiError(response.status, response.body);
  const bytes = response.body instanceof Uint8Array ? response.body : new Uint8Array(response.body ?? []);
  return {
    blob: new Blob([bytes], { type: 'application/octet-stream' }),
    filename: filenameFrom(response.headers?.['Content-Disposition']),
  };
}

export async function storageInfo() {
  try {
    const info = await workerInfo();
    return { persistent: Boolean(info.persistent), storageReason: info.storageReason ?? null };
  } catch (error) {
    return { persistent: false, storageReason: String(error?.message ?? error) };
  }
}
