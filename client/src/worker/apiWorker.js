import './bufferGlobal.js';
import { createBrowserContext } from '../../../server/platform/browserContext.js';

/**
 * "Server" của bản PWA, chạy trong một Web Worker do trang sở hữu.
 *
 * Vì sao Web Worker mà không phải Service Worker: Service Worker bị hệ thống dừng bất kỳ lúc nào,
 * trong khi VFS opfs-sahpool giữ khoá độc quyền trên file DB và một transaction đang mở sẽ chết theo.
 * Web Worker sống suốt phiên làm việc của trang.
 *
 * XẾP HÀNG TUẦN TỰ là điều kiện bắt buộc, không phải tối ưu: lõi Db dùng scope dạng biến đơn trên
 * trình duyệt (xem server/db/scope.browser.js), chỉ đúng khi mỗi thời điểm có đúng một request đang
 * được xử lý. Nếu ở đây nhận song song, câu ghi của request sau sẽ rơi vào transaction của request
 * trước. Vì vậy message được đẩy vào hàng đợi và chỉ xử lý xong cái này mới tới cái kế tiếp.
 *
 * Giao thức: nhận { id, path, method, query, body, headers } và trả { id, ok, result | error }.
 * `result` là { status, headers, body } — đúng dạng server/http/dispatch.js trả về, nên phía client
 * xử lý giống như một response HTTP.
 */

let runtimePromise = null;
const queue = [];
let working = false;

function runtime() {
  runtimePromise ??= createBrowserContext();
  return runtimePromise;
}

/** Body nhị phân (ảnh tải lên) phải thành Buffer vì controller kiểm tra bằng Buffer.isBuffer. */
function normalizeBody(body) {
  if (body instanceof ArrayBuffer) return Buffer.from(body);
  if (body instanceof Uint8Array) return Buffer.from(body.buffer, body.byteOffset, body.byteLength);
  return body;
}

async function handle(message) {
  const { api, mediaApi } = await runtime();
  const path = String(message.path ?? '/');
  // Express gắn media router ở /api/media; ở đây tách tiền tố đó ra để dùng đúng bảng route.
  const isMedia = path === '/media' || path.startsWith('/media/') || path.startsWith('/media?');
  const dispatch = isMedia ? mediaApi : api;
  const target = isMedia ? path.slice('/media'.length) || '/' : path;
  return dispatch({
    method: message.method,
    path: target,
    query: message.query ?? {},
    body: normalizeBody(message.body),
    headers: message.headers ?? {},
  });
}

async function drain() {
  if (working) return;
  working = true;
  try {
    while (queue.length) {
      const message = queue.shift();
      try {
        const result = await handle(message);
        self.postMessage({ id: message.id, ok: true, result });
      } catch (error) {
        self.postMessage({ id: message.id, ok: false, error: { message: String(error?.message ?? error), stack: error?.stack ?? null } });
      }
    }
  } finally {
    working = false;
  }
}

self.addEventListener('message', (event) => {
  const message = event.data;
  if (!message || typeof message.id !== 'number') return;
  if (message.type === 'info') {
    runtime()
      .then(({ persistent, storageReason, schema }) => self.postMessage({ id: message.id, ok: true, result: { persistent, storageReason, schema } }))
      .catch((error) => self.postMessage({ id: message.id, ok: false, error: { message: String(error?.message ?? error) } }));
    return;
  }
  queue.push(message);
  drain();
});
