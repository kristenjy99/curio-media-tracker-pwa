import Database from 'better-sqlite3';
import { env } from '../../config/env.js';
import { createAsyncDb } from '../../db/async.js';
import { backupBeforeMigrate, exportDatabaseBytes } from '../../db/backup.js';
import { createNodeScope } from '../../db/scope.node.js';
import { runMigrations } from '../../db/migrator.js';
import { mediaMigrations } from './migrations.js';

/**
 * Mở DB Media riêng (`<storage>/media/db/media-tracker.sqlite`), schema và user_version độc lập với DB sách.
 * Giống DB sách: migration chạy đồng bộ trên handle gốc ngay lúc mở, app chỉ thấy interface async.
 */
export function openMediaDatabase(filename, { journalMode = env.journalMode, backup = true } = {}) {
  const backupPath = backup ? backupBeforeMigrate(filename, mediaMigrations) : null;

  const raw = new Database(filename);
  raw.pragma('foreign_keys = ON');
  raw.pragma('busy_timeout = 5000');
  if (filename !== ':memory:') {
    raw.pragma(`journal_mode = ${journalMode}`);
    raw.pragma(`synchronous = ${journalMode === 'WAL' ? 'NORMAL' : 'FULL'}`);
  }
  const migration = runMigrations(raw, mediaMigrations);
  const db = createAsyncDb(raw, { scope: createNodeScope(), exportBytes: exportDatabaseBytes });
  return { db, migration: { ...migration, backup_path: backupPath } };
}
