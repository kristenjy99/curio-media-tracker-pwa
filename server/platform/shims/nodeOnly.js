/**
 * Chốt chặn cho các module Node không có trên trình duyệt: `node:fs`, `node:fs/promises`,
 * `node:os`, `node:child_process` (Vite alias, xem vite.config.js).
 *
 * Mọi hàm ở đây ném lỗi khi BỊ GỌI, không ném lúc import. Lý do: bảng route là một file duy nhất
 * (xem server/routes/routeTable.js) nên bản PWA vẫn import tĩnh cả controller của những tính năng
 * chỉ chạy trên Windows — chọn thư mục lưu trữ, đồng bộ Obsidian, lối tắt Desktop. Những dòng route
 * đó được gắn cờ `nodeOnly` và bị lọc khỏi dispatcher của trình duyệt, nên trong thực tế không có
 * đường nào gọi tới các hàm dưới đây; nếu có thì lỗi này chỉ rõ chuyện gì đã xảy ra thay vì để
 * bundle vỡ ngay lúc tải.
 */

const MESSAGE = 'Tính năng này chỉ chạy trên bản Windows, không có trên bản điện thoại';

function fail() {
  throw new Error(MESSAGE);
}

/** Bẫy mọi thuộc tính: fs.readFileSync, fs.promises.readFile, os.homedir... đều thành hàm ném lỗi. */
function createTrap(name) {
  const target = function nodeOnlyModule() {
    fail();
  };
  return new Proxy(target, {
    get(_target, key) {
      if (key === Symbol.toStringTag) return name;
      if (key === 'then') return undefined; // để `await import(...)` không coi module là thenable
      if (key === 'default') return proxy;
      return createTrap(`${name}.${String(key)}`);
    },
    apply: fail,
    construct: fail,
  });
}

const proxy = createTrap('node');

export default proxy;
export const promises = proxy;
export const constants = proxy;
export { proxy as fs, proxy as os, proxy as execFile, proxy as execFileSync, proxy as spawn, proxy as spawnSync };
