import { ApiError, filenameFrom } from './apiError.js';

/**
 * Lớp vận chuyển của bản Windows: gọi server Express qua fetch('/api/...').
 *
 * Bản PWA có file song song ./transport.pwa.js với đúng những export này; Vite thay module lúc build
 * (xem alias trong vite.config.js). Hoán đổi bằng alias thay vì `import()` động có điều kiện vì
 * cách sau vẫn để lại worker, WASM và polyfill Buffer trong bản Windows.
 */

export const IS_PWA = false;

export async function requestJson(method, path, body) {
  const response = await fetch(`/api${path}`, {
    method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.status === 204) return null;
  const type = response.headers.get('content-type') ?? '';
  const payload = type.includes('application/json') ? await response.json() : await response.text();
  if (!response.ok) throw new ApiError(response.status, typeof payload === 'string' ? null : payload);
  return payload;
}

export async function requestBinary(method, path, blob) {
  const response = await fetch(`/api${path}`, {
    method,
    headers: { 'Content-Type': blob.type || 'application/octet-stream' },
    body: blob,
  });
  if (response.status === 204) return null;
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(response.status, payload);
  return payload;
}

export async function requestDownload(method, path, body) {
  const response = await fetch(`/api${path}`, {
    method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new ApiError(response.status, await response.json().catch(() => null));
  return { blob: await response.blob(), filename: filenameFrom(response.headers.get('content-disposition')) };
}

/** Trên Windows dữ liệu luôn nằm trên đĩa nên không có gì phải cảnh báo. */
export async function storageInfo() {
  return { persistent: true, storageReason: null };
}

/** Bản Windows chỉ có một server giữ database, không có chuyện cửa sổ khác giành quyền. */
export function onSuperseded() {
  return () => {};
}
