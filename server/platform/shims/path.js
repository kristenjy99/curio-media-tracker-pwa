/**
 * Bản thay thế `node:path` cho bundle trình duyệt (Vite alias, xem vite.config.js).
 *
 * Chỉ cài những hàm mà code dùng chung thật sự gọi: resolve, relative, isAbsolute, join, basename,
 * extname, dirname, normalize, cộng `sep` và `posix`. Luôn làm việc theo kiểu POSIX (dấu "/"),
 * không có ổ đĩa Windows — đúng với cách FileStore quy ước đường dẫn (xem server/storage/fileStore.js).
 *
 * Trong bản PWA, những chỗ gọi path đều chỉ tính toán chuỗi đường dẫn tương đối trong store, không
 * chạm vào đĩa thật, nên bản POSIX này cho cùng kết quả như trên Node.
 */

const CWD = '/';

function split(value) {
  return String(value ?? '').split('/');
}

export function normalize(value) {
  const input = String(value ?? '');
  const absolute = input.startsWith('/');
  const parts = [];
  for (const segment of split(input)) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      if (parts.length && parts.at(-1) !== '..') parts.pop();
      else if (!absolute) parts.push('..');
      continue;
    }
    parts.push(segment);
  }
  const joined = parts.join('/');
  if (absolute) return `/${joined}`;
  return joined || '.';
}

export function join(...segments) {
  const parts = segments.filter((segment) => segment !== undefined && segment !== null && segment !== '');
  if (!parts.length) return '.';
  return normalize(parts.join('/'));
}

export function isAbsolute(value) {
  return String(value ?? '').startsWith('/');
}

export function resolve(...segments) {
  let result = '';
  for (const segment of segments) {
    const value = String(segment ?? '');
    if (!value) continue;
    result = isAbsolute(value) ? value : result ? `${result}/${value}` : value;
  }
  if (!isAbsolute(result)) result = `${CWD}${result}`;
  return normalize(result);
}

export function relative(from, to) {
  const fromParts = normalize(resolve(from)).split('/').filter(Boolean);
  const toParts = normalize(resolve(to)).split('/').filter(Boolean);
  let shared = 0;
  while (shared < fromParts.length && shared < toParts.length && fromParts[shared] === toParts[shared]) shared += 1;
  const up = Array.from({ length: fromParts.length - shared }, () => '..');
  return [...up, ...toParts.slice(shared)].join('/');
}

export function dirname(value) {
  const normalized = normalize(value);
  const index = normalized.lastIndexOf('/');
  if (index < 0) return '.';
  if (index === 0) return '/';
  return normalized.slice(0, index);
}

export function basename(value, ext) {
  const name = split(String(value ?? '')).filter(Boolean).at(-1) ?? '';
  if (ext && name !== ext && name.endsWith(ext)) return name.slice(0, -ext.length);
  return name;
}

export function extname(value) {
  const name = basename(value);
  const index = name.lastIndexOf('.');
  return index > 0 ? name.slice(index) : '';
}

export const sep = '/';
export const delimiter = ':';

const api = { normalize, join, isAbsolute, resolve, relative, dirname, basename, extname, sep, delimiter };
export const posix = api;
export const win32 = api;
export default { ...api, posix: api, win32: api };
