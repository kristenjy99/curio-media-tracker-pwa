import assert from 'node:assert/strict';
import test from 'node:test';
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { createAsyncDb } from '../db/async.js';
import { createSerialScope } from '../db/scope.browser.js';
import { migrations } from '../db/migrations/index.js';
import { runMigrations } from '../db/migrator.js';
import { mediaMigrations } from '../media/db/migrations.js';
import { createWasmHandle } from '../platform/sqliteWasm.js';

/**
 * Lớp DB của bản PWA: SQLite WASM + handle giống better-sqlite3 + lõi Db async + scope tuần tự.
 *
 * Test chạy dưới Node với VFS memory của sqlite-wasm, không cần trình duyệt. Thứ được kiểm ở đây là
 * phần có thể sai mà không ai thấy cho tới khi mở app trên điện thoại: migration chạy được trên
 * WASM, tham số đặt tên (@name) bind đúng, pluck, transaction và SAVEPOINT lồng nhau, và việc xuất
 * file DB. Phần OPFS/Service Worker phải kiểm trên thiết bị thật ở Phiên 4.
 */

const sqlite3 = await sqlite3InitModule({ print: () => {}, printErr: () => {} });

function openWasm({ list = migrations } = {}) {
  const raw = createWasmHandle(new sqlite3.oo1.DB(':memory:'), sqlite3);
  raw.pragma('foreign_keys = ON');
  const migration = runMigrations(raw, list);
  const db = createAsyncDb(raw, { scope: createSerialScope(), exportBytes: (handle) => handle.exportBytes() });
  return { db, raw, migration };
}

test('migration của DB sách chạy trên SQLite WASM, schema lên v16', () => {
  const { raw, migration } = openWasm();
  assert.equal(migration.from, 0);
  assert.equal(migration.to, 16);
  assert.equal(raw.pragma('user_version', { simple: true }), 16);
  const tables = raw.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((row) => row.name);
  for (const table of ['items', 'library_cards', 'reading_logs', 'reading_notes', 'app_settings', 'sync_deletions', 'quotes']) {
    assert.ok(tables.includes(table), `thiếu bảng ${table}`);
  }
  raw.close();
});

test('migration của DB media chạy trên SQLite WASM, schema lên v8', () => {
  const { raw, migration } = openWasm({ list: mediaMigrations });
  assert.equal(migration.to, 8);
  const tables = raw.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((row) => row.name);
  for (const table of ['media_items', 'media_watch_cards', 'media_notes', 'media_sync_deletions']) {
    assert.ok(tables.includes(table), `thiếu bảng ${table}`);
  }
  raw.close();
});

test('trigger sync_uid của v15 vẫn chạy trên WASM, tham số @name bind đúng', async () => {
  const { db, raw } = openWasm();
  // items tự điền sync_uid ở tầng model (randomUUID), các bảng còn lại do trigger AFTER INSERT điền.
  await db.run('INSERT INTO items (title, main_category, status, sync_uid) VALUES (@title, @main_category, @status, @sync_uid)', {
    title: 'Sách thử',
    main_category: 'Fiction',
    status: 'TBR',
    sync_uid: '11111111-1111-4111-8111-111111111111',
  });
  const item = await db.get('SELECT id, sync_uid FROM items WHERE title = @title', { title: 'Sách thử' });
  assert.equal(item.sync_uid, '11111111-1111-4111-8111-111111111111');

  await db.run('INSERT INTO library_cards (item_id, read_number) VALUES (@item_id, 1)', { item_id: item.id });
  const card = await db.get('SELECT sync_uid FROM library_cards WHERE item_id = @item_id', { item_id: item.id });
  assert.match(card.sync_uid, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  raw.close();
});

test('interface Db async trên WASM: all/get/run/pluck và tham số thứ tự', async () => {
  const { db, raw } = openWasm();
  const created = await db.run('INSERT INTO items (title, main_category, status) VALUES (?, ?, ?)', ['A', 'Fiction', 'TBR']);
  assert.equal(created.changes, 1);
  assert.ok(created.lastInsertRowid > 0);
  await db.run('INSERT INTO items (title, main_category, status) VALUES (?, ?, ?)', ['B', 'Fiction', 'TBR']);

  const titles = await db.all('SELECT title FROM items ORDER BY title', undefined, { pluck: true });
  assert.deepEqual(titles, ['A', 'B']);
  const total = await db.get('SELECT COUNT(*) FROM items', undefined, { pluck: true });
  assert.equal(total, 2);
  assert.equal(await db.get('SELECT * FROM items WHERE id = ?', [9999]), null);
  raw.close();
});

test('transaction trên WASM: rollback khi lỗi, SAVEPOINT cho lớp lồng trong', async () => {
  const { db, raw } = openWasm();
  await assert.rejects(
    db.transaction(async () => {
      await db.run("INSERT INTO items (title, main_category, status) VALUES ('Mất', 'Fiction', 'TBR')");
      throw new Error('hỏng');
    })(),
    /hỏng/,
  );
  assert.equal(await db.get('SELECT COUNT(*) FROM items', undefined, { pluck: true }), 0);

  await db.transaction(async () => {
    await db.run("INSERT INTO items (title, main_category, status) VALUES ('Ngoài', 'Fiction', 'TBR')");
    // Lớp trong lỗi nhưng chỉ huỷ phần của nó, lớp ngoài vẫn commit.
    await assert.rejects(
      db.transaction(async () => {
        await db.run("INSERT INTO items (title, main_category, status) VALUES ('Trong', 'Fiction', 'TBR')");
        throw new Error('lớp trong hỏng');
      })(),
      /lớp trong hỏng/,
    );
  })();
  const titles = await db.all('SELECT title FROM items', undefined, { pluck: true });
  assert.deepEqual(titles, ['Ngoài']);
  raw.close();
});

test('xuất file DB từ WASM đọc lại được như một DB SQLite', async () => {
  const { db, raw } = openWasm();
  await db.run("INSERT INTO items (title, main_category, status) VALUES ('Xuất', 'Fiction', 'TBR')");
  const bytes = await db.exportBytes();
  assert.ok(bytes.byteLength > 0);
  assert.equal(Buffer.from(bytes.subarray(0, 15)).toString('latin1'), 'SQLite format 3');

  // Nạp lại mảng byte vào một DB mới: dữ liệu và schema version phải còn nguyên.
  const restored = new sqlite3.oo1.DB(':memory:');
  const pointer = sqlite3.wasm.allocFromTypedArray(bytes);
  const code = sqlite3.capi.sqlite3_deserialize(
    restored,
    'main',
    pointer,
    bytes.byteLength,
    bytes.byteLength,
    sqlite3.capi.SQLITE_DESERIALIZE_RESIZEABLE | sqlite3.capi.SQLITE_DESERIALIZE_FREEONCLOSE,
  );
  assert.equal(code, 0);
  const handle = createWasmHandle(restored, sqlite3);
  assert.equal(handle.pragma('user_version', { simple: true }), 16);
  assert.equal(handle.prepare('SELECT title FROM items').pluck().get(), 'Xuất');
  handle.close();
  raw.close();
});
