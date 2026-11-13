import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { openDatabase } from '../db/connection.js';
import { migrations } from '../db/migrations/index.js';
import { runMigrations } from '../db/migrator.js';

const migrationsUpTo = (version) => migrations.filter((migration) => migration.version <= version);

test('migration tạo đủ bảng và đặt user_version', () => {
  // Tầng migration vẫn chạy đồng bộ trên handle better-sqlite3 gốc (db.raw), xem server/db/async.js.
  const { db: handle, migration } = openDatabase(':memory:');
  const db = handle.raw;
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .pluck()
    .all();
  assert.deepEqual(tables, [
    'app_settings',
    'brackets',
    'challenge_slots',
    'challenges',
    'goals',
    'items',
    'library_cards',
    'monthly_favorites',
    'obsidian_sync_config',
    'obsidian_templates',
    'reading_logs',
    'reading_notes',
    'series_positions',
    'sync_deletions',
    'sync_tombstones',
  ]);
  assert.equal(migration.to, 15);
  assert.equal(db.pragma('foreign_keys', { simple: true }), 1);
  db.close();
});

test('chạy migration lần 2 không áp dụng lại', () => {
  const { db: handle } = openDatabase(':memory:');
  const db = handle.raw;
  const second = runMigrations(db);
  assert.deepEqual(second.applied, []);
  db.close();
});

test('từ chối DB có schema mới hơn app', () => {
  const { db: handle } = openDatabase(':memory:');
  const db = handle.raw;
  db.pragma('user_version = 99');
  assert.throws(() => runMigrations(db), /mới hơn bản app/);
  db.close();
});

test('CHECK constraint chặn category, status và JSON sai', () => {
  const { db: handle } = openDatabase(':memory:');
  const db = handle.raw;
  const insert = (overrides) =>
    db
      .prepare(
        `INSERT INTO items (title, main_category, status, tags) VALUES (@title, @main_category, @status, @tags)`,
      )
      .run({ title: 'X', main_category: 'Fiction', status: 'TBR', tags: '[]', ...overrides });

  assert.throws(() => insert({ main_category: 'Poetry' }), /CHECK/);
  assert.throws(() => insert({ status: 'Paused' }), /CHECK/);
  assert.throws(() => insert({ tags: '{"a":1}' }), /CHECK/);
  assert.throws(() => insert({ tags: 'not json' }), /CHECK/);
  assert.doesNotThrow(() => insert({}));
  db.close();
});

test('xoá item cascade xuống library_cards, notes, logs', () => {
  const { db: handle } = openDatabase(':memory:');
  const db = handle.raw;
  const itemId = db.prepare("INSERT INTO items (title, main_category) VALUES ('A', 'Fiction')").run().lastInsertRowid;
  db.prepare('INSERT INTO library_cards (item_id, read_number) VALUES (?, 1)').run(itemId);
  db.prepare('INSERT INTO reading_notes (item_id) VALUES (?)').run(itemId);
  db.prepare("INSERT INTO reading_logs (item_id, date, units_read) VALUES (?, '2026-01-01', 10)").run(itemId);
  db.prepare('DELETE FROM items WHERE id = ?').run(itemId);
  for (const table of ['series_positions', 'brackets', 'challenge_slots', 'challenges', 'monthly_favorites', 'goals', 'library_cards', 'reading_notes', 'reading_logs']) {
    assert.equal(db.prepare(`SELECT COUNT(*) FROM ${table}`).pluck().get(), 0, table);
  }
  db.close();
});

test('migration 002 cấp sync_uid cho item có sẵn từ schema v1', () => {
  const { db: handle } = openDatabase(':memory:');
  const db = handle.raw;
  db.pragma('user_version = 0');
  for (const table of ['series_positions', 'brackets', 'challenge_slots', 'challenges', 'monthly_favorites', 'goals', 'app_settings', 'obsidian_templates', 'sync_tombstones', 'sync_deletions', 'reading_logs', 'reading_notes', 'library_cards', 'items', 'obsidian_sync_config']) {
    db.exec(`DROP TABLE IF EXISTS ${table}`);
  }
  db.exec('DROP TRIGGER IF EXISTS trg_items_tombstone');
  runMigrations(db, migrationsUpTo(1));
  db.prepare("INSERT INTO items (title, main_category) VALUES ('Cũ 1', 'Fiction'), ('Cũ 2', 'Fiction')").run();
  runMigrations(db);
  const uids = db.prepare('SELECT sync_uid FROM items').pluck().all();
  assert.equal(uids.length, 2);
  assert.ok(uids.every((uid) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(uid)), uids.join(','));
  assert.notEqual(uids[0], uids[1]);
  db.close();
});

test('xoá item đã sync tạo tombstone', () => {
  const { db: handle } = openDatabase(':memory:');
  const db = handle.raw;
  db.prepare("INSERT INTO items (title, main_category, obsidian_path, sync_uid) VALUES ('A', 'Fiction', 'A.md', 'u1')").run();
  db.prepare("INSERT INTO items (title, main_category) VALUES ('B', 'Fiction')").run();
  db.prepare('DELETE FROM items').run();
  assert.deepEqual(db.prepare('SELECT obsidian_path, sync_uid FROM sync_tombstones').all(), [{ obsidian_path: 'A.md', sync_uid: 'u1' }]);
  db.close();
});

test('migration 005 chuyển custom_fields.review_date sang cột review_date và sửa template đã lưu', () => {
  const { db: handle } = openDatabase(':memory:');
  const db = handle.raw;
  db.pragma('user_version = 0');
  for (const table of ['series_positions', 'brackets', 'challenge_slots', 'challenges', 'monthly_favorites', 'goals', 'app_settings', 'obsidian_templates', 'sync_tombstones', 'sync_deletions', 'reading_logs', 'reading_notes', 'library_cards', 'items', 'obsidian_sync_config']) {
    db.exec(`DROP TABLE IF EXISTS ${table}`);
  }
  db.exec('DROP TRIGGER IF EXISTS trg_items_tombstone');
  runMigrations(db, migrationsUpTo(4));
  db.prepare(`INSERT INTO items (title, main_category, custom_fields) VALUES ('A', 'Fiction', '{"review_date":"2025-09-15","series":["X"]}'), ('B', 'Fiction', '{"review_date":"không phải ngày"}')`).run();
  db.prepare(`INSERT INTO obsidian_templates (category, properties) VALUES ('Fiction', '[{"key":"Review date","field":"custom:review_date","format":"date"}]')`).run();
  runMigrations(db);
  const rows = db.prepare('SELECT title, review_date, custom_fields FROM items ORDER BY title').all();
  assert.deepEqual(rows, [
    { title: 'A', review_date: '2025-09-15', custom_fields: '{"series":["X"]}' },
    { title: 'B', review_date: null, custom_fields: '{"review_date":"không phải ngày"}' },
  ]);
  assert.match(db.prepare('SELECT properties FROM obsidian_templates').pluck().get(), /"field":"review_date"/);
  db.close();
});

test('mở lại DB cũ đã ở schema mới nhất: không migrate thêm, đọc được qua interface async', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-v14-'));
  const dbFile = path.join(dir, 'reading-tracker.sqlite');
  try {
    // Lần mở thứ nhất: tạo file DB và migrate lên schema mới nhất (v14).
    const first = openDatabase(dbFile);
    assert.equal(first.migration.to, 15);
    await first.db.run("INSERT INTO items (title, main_category, status) VALUES ('Sách cũ', 'Fiction', 'Finished')");
    first.db.close();

    // Lần mở thứ hai: DB đã ở v14 nên không có migration nào được áp dụng.
    const second = openDatabase(dbFile);
    assert.deepEqual(second.migration, { from: 15, to: 15, applied: [], backup_path: null });
    assert.equal(await second.db.pragma('user_version', { simple: true }), 15);
    const titles = await second.db.all('SELECT title FROM items ORDER BY id', undefined, { pluck: true });
    assert.deepEqual(titles, ['Sách cũ']);
    const row = await second.db.get('SELECT title, status FROM items WHERE id = ?', [1]);
    assert.deepEqual(row, { title: 'Sách cũ', status: 'Finished' });
    second.db.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
