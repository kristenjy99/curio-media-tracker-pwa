import Database from 'better-sqlite3';
import { env } from '../config/env.js';
import { createAsyncDb } from './async.js';
import { backupBeforeMigrate, exportDatabaseBytes } from './backup.js';
import { createNodeScope } from './scope.node.js';
import { migrations } from './migrations/index.js';
import { runMigrations } from './migrator.js';

/**
 * Mở kết nối SQLite và chạy migration.
 * - filename = ':memory:' dùng cho test.
 * - journal_mode mặc định DELETE: không sinh file -wal/-shm, tránh tình trạng dịch vụ sync
 *   (Google Drive, OneDrive, Obsidian Sync) upload DB ở trạng thái thiếu dữ liệu chưa checkpoint.
 *
 * Migration chạy trên handle better-sqlite3 gốc (đồng bộ) ngay lúc mở, trước khi app nhận DB;
 * phần còn lại của app chỉ thấy interface async do createAsyncDb cung cấp.
 *
 * Trước khi nâng schema, DB cũ được sao lưu tự động (xem ./backup.js). Truyền backup: false để tắt,
 * dùng cho test hoặc khi gọi lại trên cùng một file đã sao lưu.
 */
export function openDatabase(filename, { journalMode = env.journalMode, verbose, backup = true } = {}) {
  const backupPath = backup ? backupBeforeMigrate(filename, migrations) : null;

  const raw = new Database(filename, verbose ? { verbose } : {});

  raw.pragma('foreign_keys = ON');
  raw.pragma('busy_timeout = 5000');
  if (filename !== ':memory:') {
    raw.pragma(`journal_mode = ${journalMode}`);
    raw.pragma(`synchronous = ${journalMode === 'WAL' ? 'NORMAL' : 'FULL'}`);
  }

  const migration = runMigrations(raw);
  const db = createAsyncDb(raw, { scope: createNodeScope(), exportBytes: exportDatabaseBytes });
  return { db, migration: { ...migration, backup_path: backupPath } };
}

export function closeDatabase(db) {
  if (db?.open) db.close();
}
