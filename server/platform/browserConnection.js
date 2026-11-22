import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { createAsyncDb } from '../db/async.js';
import { migrations } from '../db/migrations/index.js';
import { createSerialScope } from '../db/scope.browser.js';
import { runMigrations } from '../db/migrator.js';
import { mediaMigrations } from '../media/db/migrations.js';
import { createWasmHandle } from './sqliteWasm.js';

/**
 * Mở DB của bản PWA: SQLite WASM lưu trên OPFS, tương đương server/db/connection.js của Windows.
 *
 * VFS là `opfs-sahpool` chứ không phải `opfs`: VFS `opfs` đòi header COOP/COEP, mà GitHub Pages
 * không cho đặt header, nên hướng đó không dùng được. `opfs-sahpool` không cần SharedArrayBuffer,
 * bù lại chỉ một tab được giữ VFS tại một thời điểm; tab thứ hai nhận lỗi rõ ràng ở đây.
 *
 * Cả hai DB (sách và media) dùng chung một pool, mỗi DB một file, user_version độc lập như trên Node.
 * Migration chạy ĐỒNG BỘ trên handle WASM ngay lúc mở, trước khi app nhận DB — giống Windows.
 *
 * Không có OPFS (chế độ ẩn danh, trình duyệt cũ): mở DB trong bộ nhớ và trả `persistent: false` để
 * giao diện cảnh báo rằng dữ liệu mất khi đóng tab, thay vì im lặng làm mất dữ liệu người dùng.
 */

const BOOK_DB_FILE = '/reading-tracker.sqlite';
const MEDIA_DB_FILE = '/media-tracker.sqlite';
const POOL_NAME = 'media-tracker';

// Lỗi do cửa sổ/tab khác đang giữ file DB (opfs-sahpool chỉ cho một nơi giữ).
const LOCKED = /access handle|NoModificationAllowed|modification is not allowed/i;
const LOCK_RETRY_DELAYS = [150, 250, 400, 600, 800, 1000, 1200, 1500, 1500, 2000];

let runtime = null;

/**
 * Cài VFS opfs-sahpool, thử lại khi file DB đang bị chiếm: cửa sổ cũ cần chút thời gian để nhả file sau
 * khi nhận yêu cầu nhường (xem client/src/lib/workerTransport.js), và khi tải lại trang worker cũ cũng
 * chưa kịp đóng. Tổng thời gian chờ khoảng 9 giây.
 *
 * preserveOnInitFailure: mặc định thư viện gọi removeVfs() khi cài lỗi, tức là XOÁ ĐỆ QUY thư mục pool
 * (chứa chính file DB). Thường việc xoá thất bại vì file đang bị khoá, nhưng nếu cửa sổ kia nhả file đúng
 * lúc đó thì dữ liệu bị xoá. Luôn giữ nguyên thư mục khi lỗi.
 */
async function installPool(sqlite3) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await sqlite3.installOpfsSAHPoolVfs({ name: POOL_NAME, initialCapacity: 16, preserveOnInitFailure: true, forceReinitIfPreviouslyFailed: true });
    } catch (error) {
      if (!LOCKED.test(`${error?.name ?? ''} ${error?.message ?? error}`) || attempt >= LOCK_RETRY_DELAYS.length) throw error;
      await new Promise((resolve) => setTimeout(resolve, LOCK_RETRY_DELAYS[attempt]));
    }
  }
}

async function loadRuntime() {
  if (runtime) return runtime;
  const sqlite3 = await sqlite3InitModule({ print: () => {}, printErr: (message) => console.warn('[sqlite]', message) });
  let pool = null;
  let reason = null;
  if (typeof sqlite3.installOpfsSAHPoolVfs === 'function') {
    try {
      // Pool giữ sẵn một số file: hai DB cộng journal và file tạm của SQLite, nên để dư.
      pool = await installPool(sqlite3);
    } catch (error) {
      reason = error;
    }
  } else {
    reason = new Error('Trình duyệt không hỗ trợ OPFS');
  }
  runtime = { sqlite3, pool, reason };
  return runtime;
}

/** Thông tin để giao diện báo trạng thái lưu trữ mà không phải mở DB. */
export async function describeStorage() {
  const { pool, reason } = await loadRuntime();
  return { persistent: Boolean(pool), reason: reason ? String(reason.message ?? reason) : null };
}

function open({ sqlite3, pool }, file, list) {
  const wasm = pool ? new pool.OpfsSAHPoolDb(file) : new sqlite3.oo1.DB(':memory:');
  const raw = createWasmHandle(wasm, sqlite3);
  raw.pragma('foreign_keys = ON');
  raw.pragma('busy_timeout = 5000');
  if (pool) {
    raw.pragma('journal_mode = DELETE');
    raw.pragma('synchronous = FULL');
  }
  const migration = runMigrations(raw, list);
  const db = createAsyncDb(raw, { scope: createSerialScope(), exportBytes: (handle) => handle.exportBytes() });
  return { db, raw, migration: { ...migration, backup_path: null } };
}

/**
 * Mở cả hai DB. Trả về cùng dạng mà app cần: { books: {db, migration}, media: {db, migration}, persistent }.
 * Không có bước sao lưu trước khi migrate như trên Node (không có thư mục backups trên điện thoại);
 * thay vào đó người dùng tự xuất file DB bằng POST /data/export trước khi cập nhật app.
 */
export async function openBrowserDatabases() {
  const current = await loadRuntime();
  const books = open(current, BOOK_DB_FILE, migrations);
  const media = open(current, MEDIA_DB_FILE, mediaMigrations);
  return { books, media, persistent: Boolean(current.pool), storageReason: current.reason ? String(current.reason.message ?? current.reason) : null };
}
