import { migrations } from './migrations/index.js';

/**
 * Dùng PRAGMA user_version làm con trỏ phiên bản schema.
 * Mỗi migration chạy trong một transaction riêng; lỗi ở migration nào thì rollback migration đó.
 */
export function runMigrations(db, list = migrations) {
  const sorted = [...list].sort((a, b) => a.version - b.version);
  const versions = new Set();
  for (const migration of sorted) {
    if (!Number.isInteger(migration.version) || migration.version < 1) {
      throw new Error(`Migration "${migration.name}" có version không hợp lệ`);
    }
    if (versions.has(migration.version)) {
      throw new Error(`Trùng migration version ${migration.version}`);
    }
    versions.add(migration.version);
  }

  const current = db.pragma('user_version', { simple: true });
  const latest = sorted.at(-1)?.version ?? 0;
  if (current > latest) {
    throw new Error(
      `Database đang ở schema v${current}, mới hơn bản app hiện tại (v${latest}). Hãy cập nhật app trước khi mở DB này.`,
    );
  }

  const applied = [];
  for (const migration of sorted) {
    if (migration.version <= current) continue;
    db.transaction(() => {
      if (typeof migration.up === 'function') migration.up(db);
      else db.exec(migration.up);
      db.pragma(`user_version = ${migration.version}`);
    })();
    applied.push(`${migration.version}_${migration.name}`);
  }

  return { from: current, to: db.pragma('user_version', { simple: true }), applied };
}
