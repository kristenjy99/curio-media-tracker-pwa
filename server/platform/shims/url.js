/**
 * Bản thay thế `node:url` cho bundle trình duyệt (Vite alias, xem vite.config.js).
 *
 * Chỉ có fileURLToPath/pathToFileURL, và chúng trả về chuỗi vô hại chứ không ném lỗi: vài module
 * tính hằng số đường dẫn ngay lúc import (ví dụ APP_ROOT trong desktopShortcut.js), nếu ném lỗi thì
 * bundle vỡ ngay lúc tải thay vì lúc gọi tính năng. Giá trị trả về không có ý nghĩa trên trình duyệt
 * và chỉ được dùng bởi các tính năng Windows đã bị lọc khỏi bảng route.
 */

export function fileURLToPath(value) {
  const text = String(value ?? '');
  return text.startsWith('file://') ? text.slice('file://'.length) : text;
}

export function pathToFileURL(value) {
  return new URL(`file://${String(value ?? '')}`);
}

export default { fileURLToPath, pathToFileURL, URL, URLSearchParams };
