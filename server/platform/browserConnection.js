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

let runtime = null;

async function loadRuntime() {
  if (runtime) return runtime;
  const sqlite3 = await sqlite3InitModule({ print: () => {}, printErr: (message) => console.warn('[sqlite]', message) });
  let pool = null;
  let reason = null;
  if (typeof sqlite3.installOpfsSAHPoolVfs === 'function') {
    try {
      // Pool giữ sẵn một số file: hai DB cộng journal và file tạm của SQLite, nên để dư.
      pool = await sqlite3.installOpfsSAHPoolVfs({ name: POOL_NAME, initialCapacity: 16 });
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
