import ApiWorker from '../worker/apiWorker.js?worker';

/**
 * Transport của bản PWA: thay vì `fetch('/api/...')` tới một server, gửi request vào Web Worker
 * (xem ../worker/apiWorker.js) và nhận lại { status, headers, body }.
 *
 * Mỗi request một số thứ tự; worker trả về kèm số đó nên nhiều lời gọi chồng nhau từ React Query
 * vẫn ghép đúng cặp. Bản thân worker xử lý tuần tự, phía này không cần biết.
 */

let worker = null;
let nextId = 1;
const pending = new Map();

function ensureWorker() {
  if (worker) return worker;
  worker = new ApiWorker();
  worker.addEventListener('message', (event) => {
    const { id, ok, result, error } = event.data ?? {};
    const entry = pending.get(id);
    if (!entry) return;
    pending.delete(id);
    if (ok) entry.resolve(result);
    else entry.reject(Object.assign(new Error(error?.message ?? 'Lỗi không rõ'), { stack: error?.stack ?? undefined }));
  });
  worker.addEventListener('error', (event) => {
    // Worker chết (lỗi lúc nạp WASM, OPFS bị chiếm): trả lỗi cho mọi request đang chờ thay vì treo.
    const failure = new Error(event.message || 'Worker dữ liệu gặp lỗi');
    for (const [, entry] of pending) entry.reject(failure);
    pending.clear();
  });
  return worker;
}

function send(message) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ensureWorker().postMessage({ ...message, id });
  });
}

/** Gọi một route. `path` tính từ /api (ví dụ '/items/3', '/media/items'). */
export function dispatchRequest({ method, path, query, body, headers }) {
  return send({ type: 'request', method, path, query, body, headers });
}

/** Trạng thái lưu trữ để giao diện cảnh báo khi không dùng được OPFS. */
export function workerInfo() {
  return send({ type: 'info' });
}
