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

/*
 * Một thiết bị chỉ một cửa sổ được giữ database (VFS opfs-sahpool khoá file độc quyền). Cửa sổ mở sau
 * (app cài trên màn hình chính, tab Chrome mới, trang vừa tải lại) phát yêu cầu "nhường" qua
 * BroadcastChannel; cửa sổ đang giữ dừng worker để nhả file và hiện màn hình "đang mở ở cửa sổ khác".
 * Dừng worker giữa chừng một lần ghi thì SQLite tự rollback lần ghi đó khi mở lại (journal DELETE),
 * dữ liệu đã lưu trước đó không ảnh hưởng.
 */
const CHANNEL = 'media-tracker-db-owner';
const instanceId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(CHANNEL) : null;
let superseded = false;
const supersededListeners = new Set();

channel?.addEventListener('message', (event) => {
  const { type, from } = event.data ?? {};
  if (type !== 'takeover' || from === instanceId || superseded) return;
  superseded = true;
  if (worker) {
    worker.terminate();
    worker = null;
  }
  const failure = new Error('App đang được mở ở cửa sổ khác');
  for (const [, entry] of pending) entry.reject(failure);
  pending.clear();
  for (const listener of supersededListeners) listener();
});

/** Đăng ký nhận báo khi cửa sổ khác lấy quyền giữ database; trả hàm huỷ đăng ký. */
export function onSuperseded(listener) {
  supersededListeners.add(listener);
  if (superseded) listener();
  return () => supersededListeners.delete(listener);
}

function ensureWorker() {
  if (superseded) throw new Error('App đang được mở ở cửa sổ khác');
  if (worker) return worker;
  channel?.postMessage({ type: 'takeover', from: instanceId });
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
    let target;
    try {
      target = ensureWorker();
    } catch (error) {
      reject(error);
      return;
    }
    pending.set(id, { resolve, reject });
    target.postMessage({ ...message, id });
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
