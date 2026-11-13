/* eslint-env serviceworker */

/**
 * Service Worker của bản PWA. Hai việc, không hơn:
 *
 *  1. Phục vụ file người dùng tải lên. Trong DB, ảnh được lưu dạng '/media/...' (sách) và
 *     '/api/media/files/...' (media) — trên Windows do express.static trả về. Ở đây không có server,
 *     nên Service Worker chặn đúng những đường dẫn đó (đã thêm tiền tố base của app) và đọc byte từ
 *     IndexedDB. Nhờ vậy mọi thẻ <img src="..."> trong giao diện và trong note markdown chạy y như cũ.
 *  2. Giữ vỏ app để mở được khi không có mạng: index.html và các file build được cache lại.
 *
 * KHÔNG đặt DB hay dispatcher ở đây: Service Worker bị hệ thống dừng bất kỳ lúc nào, mà VFS
 * opfs-sahpool giữ khoá độc quyền trên file DB. Phần đó nằm trong Web Worker của trang
 * (client/src/worker/apiWorker.js).
 *
 * Tên IndexedDB phải khớp server/storage/browserFileStore.js. File này nằm trong client/public nên
 * Vite copy nguyên văn, không bundle, vì vậy không import được từ đó và phải lặp lại hằng số.
 */

const CACHE = 'media-tracker-shell-v1';
const FILE_DB = 'media-tracker-files';
const FILE_STORE = 'files';
const FILE_DB_VERSION = 1;
const BASE = new URL(self.registration.scope).pathname;

const MIME = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  mp4: 'video/mp4',
  epub: 'application/epub+zip',
  txt: 'text/plain; charset=utf-8',
  md: 'text/markdown; charset=utf-8',
};

// Giống server/app.js: chỉ ảnh, âm thanh, video và PDF được mở trong trang; còn lại luôn tải xuống
// để file HTML/SVG do người dùng tải lên không chạy script trên origin của app.
const INLINE = /\.(jpe?g|png|gif|webp|avif|mp3|m4a|ogg|wav|mp4|webm|pdf)$/i;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll([BASE, `${BASE}index.html`]).catch(() => undefined))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

function openFileDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(FILE_DB, FILE_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(FILE_STORE)) db.createObjectStore(FILE_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function readFile(key) {
  return openFileDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const request = db.transaction(FILE_STORE, 'readonly').objectStore(FILE_STORE).get(key);
        request.onsuccess = () => resolve(request.result ?? null);
        request.onerror = () => reject(request.error);
      }),
  );
}

/**
 * Đường dẫn request -> key trong IndexedDB.
 * `${BASE}media/items/<uid>/cover.webp`        -> `items/<uid>/cover.webp`
 * `${BASE}api/media/files/items/3/poster.webp` -> `media/items/3/poster.webp`
 * Trả null nếu không phải file tải lên (để request đi tiếp như thường).
 */
function toStoreKey(pathname) {
  const rest = pathname.startsWith(BASE) ? pathname.slice(BASE.length) : pathname.replace(/^\//, '');
  if (rest.startsWith('api/media/files/')) return decodeURI(`media/${rest.slice('api/media/files/'.length)}`);
  if (!rest.startsWith('media/')) return null;
  const tail = rest.slice('media/'.length);
  // /media, /media/stats, /media/<id> là trang giao diện (SPA), không phải file — giống server/app.js.
  if (tail === '' || /^(stats|\d+)\/?$/.test(tail)) return null;
  return decodeURI(tail);
}

function fileResponse(entry, pathname) {
  if (!entry) return new Response('Không tìm thấy file', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  const ext = pathname.includes('.') ? pathname.split('.').pop().toLowerCase() : '';
  const headers = {
    'Content-Type': MIME[ext] ?? 'application/octet-stream',
    'Cache-Control': 'no-cache',
    'X-Content-Type-Options': 'nosniff',
  };
  if (!INLINE.test(pathname)) {
    headers['Content-Disposition'] = 'attachment';
    headers['Content-Security-Policy'] = "sandbox; default-src 'none'";
  }
  return new Response(entry.bytes, { status: 200, headers });
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const key = toStoreKey(url.pathname);
  if (key) {
    event.respondWith(
      readFile(key)
        .then((entry) => fileResponse(entry, url.pathname))
        .catch(() => new Response('Không đọc được file', { status: 500 })),
    );
    return;
  }

  // Điều hướng trang (SPA): ưu tiên mạng, không có mạng thì lấy index.html trong cache.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match(`${BASE}index.html`).then((hit) => hit ?? caches.match(BASE))));
    return;
  }

  // File build (JS/CSS/font) có tên kèm hash nên cache được vô thời hạn; lấy cache trước cho nhanh.
  event.respondWith(
    caches.match(request).then((hit) => {
      if (hit) return hit;
      return fetch(request).then((response) => {
        if (response.ok && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    }),
  );
});
