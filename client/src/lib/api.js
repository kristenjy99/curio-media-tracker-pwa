import { IS_PWA, requestBinary, requestDownload, requestJson } from './transport.js';

export { ApiError } from './apiError.js';
export { IS_PWA };

/**
 * Bề mặt API dùng chung cho toàn bộ giao diện. Phần khác nhau giữa hai nền tảng nằm trong
 * ./transport.js (Windows, fetch tới Express) và ./transport.pwa.js (PWA, gọi bảng route trong Web
 * Worker); Vite thay module lúc build nên bản Windows không chứa worker, WASM hay polyfill Buffer.
 */

/** Đường dẫn gốc khi app không nằm ở gốc domain (GitHub Pages: /<tên-repo>/). */
export const BASE_URL = import.meta.env.BASE_URL ?? '/';

export const api = {
  get: (path) => requestJson('GET', path),
  post: (path, body = {}) => requestJson('POST', path, body),
  put: (path, body) => requestJson('PUT', path, body),
  patch: (path, body) => requestJson('PATCH', path, body),
  delete: (path) => requestJson('DELETE', path),
};

/** Gửi dữ liệu nhị phân (ảnh bìa, ảnh trong note, file đính kèm) tới handler có cờ rawBody. */
export const sendBinary = (method, path, blob) => requestBinary(method, path, blob);

/** Tải về file do server tạo (hiện chỉ dùng cho POST /data/export). Trả về { blob, filename }. */
export const requestFile = (method, path, body) => requestDownload(method, path, body);

export const categoryPath = (category) => encodeURIComponent(category);

export function toQuery(params) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) value.forEach((entry) => search.append(key, entry));
    else search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

/**
 * Đường dẫn hiển thị cho file người dùng tải lên. Trong DB, ảnh được lưu dạng '/media/...' (sách)
 * hoặc '/api/media/files/...' (media) — đúng với bản Windows phục vụ ở gốc domain.
 *
 * Trên GitHub Pages app nằm ở /<tên-repo>/ nên phải thêm tiền tố, nếu không thẻ <img> sẽ gọi ra gốc
 * domain, nằm ngoài phạm vi Service Worker và trả về 404. Service Worker chặn đúng các đường dẫn đã
 * thêm tiền tố này rồi đọc byte từ IndexedDB (xem client/public/sw.js).
 *
 * Giá trị trong DB không bao giờ bị đổi: việc thêm tiền tố chỉ xảy ra lúc render.
 */
export function resolveFileUrl(value) {
  if (typeof value !== 'string' || !value.startsWith('/')) return value;
  if (BASE_URL === '/' || !(value.startsWith('/media/') || value.startsWith('/api/media/files/'))) return value;
  return `${BASE_URL.replace(/\/$/, '')}${value}`;
}
