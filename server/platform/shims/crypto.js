/**
 * Bản thay thế `node:crypto` cho bundle trình duyệt (Vite alias, xem vite.config.js).
 *
 * Chỉ cài phần mà code dùng chung gọi tới trong bản PWA:
 *  - randomUUID: sinh sync_uid cho bản ghi mới (itemModel, mediaItemService).
 *  - randomBytes: sinh salt cho mật khẩu xoá dữ liệu.
 *  - timingSafeEqual: so sánh hash mật khẩu không lộ thời gian.
 *  - pbkdf2: băm mật khẩu. WebCrypto chỉ có bản bất đồng bộ, nên chữ ký giống `node:crypto.pbkdf2`
 *    (dạng callback) chứ không có pbkdf2Sync.
 *
 * `scryptSync` và `createHash` KHÔNG có ở đây: scrypt không nằm trong WebCrypto, còn createHash chỉ
 * dùng ở nhánh đồng bộ Obsidian (Windows). Code dùng chung phải kiểm tra `typeof ... === 'function'`
 * trước khi gọi hai hàm đó (xem server/services/dataService.js).
 */

const webcrypto = globalThis.crypto;

export function randomUUID() {
  if (typeof webcrypto?.randomUUID === 'function') return webcrypto.randomUUID();
  // Trình duyệt cũ không có randomUUID (hoặc chạy ngoài ngữ cảnh an toàn): tự ghép từ byte ngẫu nhiên.
  const bytes = randomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function randomBytes(size) {
  const bytes = new Uint8Array(size);
  webcrypto.getRandomValues(bytes);
  // Buffer (polyfill trong worker) để `.toString('hex')` dùng được như trên Node.
  return Buffer.from(bytes);
}

export function timingSafeEqual(a, b) {
  if (a.length !== b.length) throw new RangeError('Hai chuỗi byte phải cùng độ dài');
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= a[index] ^ b[index];
  return diff === 0;
}

const DIGEST_NAMES = { sha256: 'SHA-256', sha512: 'SHA-512', sha1: 'SHA-1' };

export function pbkdf2(password, salt, iterations, keylen, digest, callback) {
  const hash = DIGEST_NAMES[String(digest).toLowerCase().replace('-', '')] ?? String(digest).toUpperCase();
  const encoder = new TextEncoder();
  const secret = typeof password === 'string' ? encoder.encode(password) : new Uint8Array(password);
  const saltBytes = typeof salt === 'string' ? encoder.encode(salt) : new Uint8Array(salt);
  webcrypto.subtle
    .importKey('raw', secret, 'PBKDF2', false, ['deriveBits'])
    .then((key) => webcrypto.subtle.deriveBits({ name: 'PBKDF2', salt: saltBytes, iterations, hash }, key, keylen * 8))
    .then((bits) => callback(null, Buffer.from(new Uint8Array(bits))))
    .catch((error) => callback(error));
}

/**
 * Chỉ có để bundle không vỡ: `server/services/obsidian/markdown.js` import tĩnh createHash, mà file
 * đó nằm trong đồ thị import của bảng route (phần import markdown dùng chung bộ parse với sync).
 * Hàm băm sha256 đồng bộ không có trong WebCrypto; nơi gọi nó là đồng bộ Obsidian, vốn chỉ chạy
 * trên Windows và đã bị cờ `nodeOnly` lọc khỏi dispatcher.
 */
export function createHash() {
  throw new Error('Băm sha256 đồng bộ chỉ có trên bản Windows (dùng cho đồng bộ Obsidian)');
}

export default { randomUUID, randomBytes, timingSafeEqual, pbkdf2, createHash };
