import { joinStorePath } from './fileStore.js';

/**
 * FileStore bản trình duyệt: cùng interface với nodeFileStore (write/read/exists/remove/removeDir/resolve),
 * nên tầng service không biết mình đang chạy ở đâu.
 *
 * Dữ liệu nằm trong IndexedDB chứ không nằm trên OPFS, dù DB SQLite lại nằm trên OPFS. Lý do:
 * Service Worker cần ĐỌC được các file này để trả về cho thẻ <img> (xem client/public/sw.js), và
 * IndexedDB thì Service Worker mở được dễ dàng mà không tranh khoá với worker đang ghi; OPFS thì
 * phải lo chuyện handle độc quyền giữa worker và Service Worker trên cùng một file.
 *
 * Key là đường dẫn tương đối kiểu URL, giống hệt key mà nodeFileStore nhận ("items/<uid>/cover-1.webp"),
 * nên dữ liệu ghi ở hai nền tảng có cùng tên và đồng bộ được ở Phiên 5 mà không phải đổi tên.
 *
 * `resolve()` luôn trả về null: trình duyệt không có đường dẫn đĩa. Đây là điều đã chốt ở Phiên 1.
 */

export const DB_NAME = 'media-tracker-files';
export const STORE_NAME = 'files';
export const DB_VERSION = 1;

/** Mở IndexedDB dùng chung cho FileStore; dùng được cả trong worker và Service Worker. */
export function openFileDatabase(indexedDB = globalThis.indexedDB) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Backend IndexedDB: 4 thao tác khoá/giá trị mà store cần. */
export function createIndexedDbBackend({ indexedDB } = {}) {
  let handle = null;
  const database = async () => {
    handle ??= await openFileDatabase(indexedDB);
    return handle;
  };

  async function withStore(mode, work) {
    const db = await database();
    const transaction = db.transaction(STORE_NAME, mode);
    const result = work(transaction.objectStore(STORE_NAME));
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    }).then(() => result);
  }

  return {
    async get(key) {
      const db = await database();
      return requestToPromise(db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(key));
    },
    async put(key, value) {
      await withStore('readwrite', (store) => store.put(value, key));
    },
    async delete(key) {
      await withStore('readwrite', (store) => store.delete(key));
    },
    async keys() {
      const db = await database();
      return requestToPromise(db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAllKeys());
    },
  };
}

/** Backend trong bộ nhớ: dùng cho test và cho trường hợp IndexedDB bị khoá (chế độ ẩn danh). */
export function createMemoryBackend() {
  const map = new Map();
  return {
    get: async (key) => map.get(key),
    put: async (key, value) => void map.set(key, value),
    delete: async (key) => void map.delete(key),
    keys: async () => [...map.keys()],
  };
}

/**
 * `backend` là lớp khoá/giá trị (IndexedDB thật hoặc bộ nhớ). Giá trị lưu là
 * `{ bytes: Uint8Array, size: number, updated_at: string }`; phần mime do lớp phục vụ file tự suy
 * từ phần mở rộng, không lưu thêm để không lệch với dữ liệu ghi từ Windows.
 */
export function createBrowserFileStore({ backend = createIndexedDbBackend(), prefix = '' } = {}) {
  // `prefix` tách hai store dùng chung một IndexedDB: sách không tiền tố, media là "media/".
  // Nhờ vậy key trong IndexedDB phản ánh đúng cây thư mục của bản Windows (<storage>/ và <storage>/media/).
  const clean = (relPath) => {
    const value = joinStorePath(relPath);
    return value ? joinStorePath(prefix, value) : '';
  };

  return {
    root: null,

    resolve() {
      return Promise.resolve(null);
    },

    async write(relPath, buffer) {
      const key = clean(relPath);
      if (!key) throw new Error(`Đường dẫn không hợp lệ: ${relPath}`);
      const bytes = toBytes(buffer);
      await backend.put(key, { bytes, size: bytes.byteLength, updated_at: new Date().toISOString() });
      return relPath;
    },

    async read(relPath) {
      const key = clean(relPath);
      if (!key) return null;
      const entry = await backend.get(key);
      if (!entry) return null;
      // Trả về Buffer để tầng service dùng được như trên Node (detectImageType, .length...).
      return Buffer.from(entry.bytes);
    },

    async exists(relPath) {
      const key = clean(relPath);
      if (!key) return false;
      return Boolean(await backend.get(key));
    },

    async remove(relPath) {
      const key = clean(relPath);
      if (key) await backend.delete(key);
    },

    /** Không có thư mục thật: xoá mọi key nằm dưới tiền tố này. */
    async removeDir(relPath) {
      const key = clean(relPath);
      if (!key) return;
      const prefix = `${key}/`;
      for (const existing of await backend.keys()) {
        if (existing === key || String(existing).startsWith(prefix)) await backend.delete(existing);
      }
    },

    /** Dùng cho Phiên 5 (đồng bộ Drive): liệt kê file đang có, đường dẫn tính theo gốc của store. */
    async list(under = '') {
      const base = clean('');
      const key = clean(under);
      const keys = (await backend.keys()).map(String);
      const inScope = key ? keys.filter((existing) => existing === key || existing.startsWith(`${key}/`)) : keys.filter((existing) => !base || existing.startsWith(`${base}/`));
      return base ? inScope.map((existing) => existing.slice(base.length + 1)) : inScope;
    },
  };
}

function toBytes(buffer) {
  if (buffer instanceof Uint8Array) return new Uint8Array(buffer);
  if (buffer instanceof ArrayBuffer) return new Uint8Array(buffer);
  if (buffer?.buffer instanceof ArrayBuffer) return new Uint8Array(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
  throw new Error('FileStore chỉ ghi được dữ liệu nhị phân');
}
