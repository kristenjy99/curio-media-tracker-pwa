import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, test } from 'node:test';
import { backupBeforeMigrate, readSchemaVersion } from '../db/backup.js';
import { openDatabase } from '../db/connection.js';
import { migrations } from '../db/migrations/index.js';
import { createDispatcher, parseRequestUrl } from '../http/dispatch.js';
import { createApiRouteTable } from '../routes/routeTable.js';
import { startTestServer } from './helpers.js';

const LATEST = Math.max(...migrations.map((migration) => migration.version));

describe('bảng route khai báo chạy được không cần Express', () => {
  test('tạo, đọc, sửa, xoá sách qua dispatcher; cùng dữ liệu với đường HTTP', async () => {
    const s = await startTestServer();
    try {
      const dispatch = createDispatcher(createApiRouteTable(s.runtime.context));

      const created = await dispatch({ method: 'POST', path: '/items', body: { title: 'Sách PWA', main_category: 'Fiction' } });
      assert.equal(created.status, 201);
      assert.equal(created.body.title, 'Sách PWA');
      assert.equal(created.headers.Location, `/api/items/${created.body.id}`);

      const read = await dispatch({ method: 'GET', path: `/items/${created.body.id}` });
      assert.equal(read.status, 200);
      assert.equal(read.body.title, 'Sách PWA');

      // Cùng một handler nên dữ liệu tạo qua dispatcher thấy được qua HTTP và ngược lại.
      assert.equal((await s.api('GET', `/items/${created.body.id}`)).body.title, 'Sách PWA');
      const viaHttp = await s.api('POST', '/items', { title: 'Sách HTTP', main_category: 'Nonfiction' });
      assert.equal((await dispatch({ method: 'GET', path: `/items/${viaHttp.body.id}` })).body.title, 'Sách HTTP');

      const patched = await dispatch({ method: 'PATCH', path: `/items/${created.body.id}`, body: { rating: 4 } });
      assert.equal(patched.body.rating, 4);

      const removed = await dispatch({ method: 'DELETE', path: `/items/${created.body.id}` });
      assert.equal(removed.status, 204);
      assert.equal((await dispatch({ method: 'GET', path: `/items/${created.body.id}` })).status, 404);
    } finally {
      await s.stop();
    }
  });

  test('query, tham số có ký tự encode, route lạ và method sai', async () => {
    const s = await startTestServer();
    try {
      const dispatch = createDispatcher(createApiRouteTable(s.runtime.context));

      // Tham số đường dẫn được decode giống Express: "Visual%2FComics" -> "Visual/Comics".
      const template = await dispatch({ method: 'GET', path: '/templates/Visual%2FComics' });
      assert.equal(template.status, 200);
      assert.equal(template.body.category, 'Visual/Comics');

      const listed = await dispatch({ method: 'GET', path: '/items', query: { limit: '5' } });
      assert.equal(listed.body.limit, 5);

      assert.equal((await dispatch({ method: 'GET', path: '/khong-co-route' })).status, 404);
      assert.equal((await dispatch({ method: 'GET', path: '/khong-co-route' })).body.error.code, 'ROUTE_NOT_FOUND');
      const wrongMethod = await dispatch({ method: 'DELETE', path: '/health' });
      assert.equal(wrongMethod.status, 405);
      assert.equal(wrongMethod.body.error.code, 'METHOD_NOT_ALLOWED');

      // Lỗi của handler được đổi thành response lỗi, không ném ra ngoài.
      const invalid = await dispatch({ method: 'POST', path: '/items', body: { main_category: 'Fiction' } });
      assert.equal(invalid.status, 400);
      assert.equal(invalid.body.error.code, 'VALIDATION_ERROR');
    } finally {
      await s.stop();
    }
  });

  test('parseRequestUrl đọc query giống Express chế độ simple', () => {
    assert.deepEqual(parseRequestUrl('/items?q=a&tag=x&tag=y'), { path: '/items', query: { q: 'a', tag: ['x', 'y'] } });
    assert.deepEqual(parseRequestUrl('/items'), { path: '/items', query: {} });
  });
});

describe('sao lưu tự động trước khi migrate', () => {
  test('DB cũ hơn bản mới nhất được sao lưu; bản sao mở được và giữ nguyên dữ liệu', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-backup-'));
    const dbFile = path.join(dir, 'db', 'reading-tracker.sqlite');
    try {
      fs.mkdirSync(path.dirname(dbFile), { recursive: true });
      const old = new Database(dbFile);
      old.exec("CREATE TABLE cu (id INTEGER PRIMARY KEY, ten TEXT); INSERT INTO cu (ten) VALUES ('dữ liệu cũ');");
      old.pragma('user_version = 3');
      old.close();

      const target = backupBeforeMigrate(dbFile, migrations);
      assert.ok(target, 'phải tạo bản sao lưu');
      assert.equal(path.dirname(target), path.join(dir, 'backups'));
      assert.match(path.basename(target), /^truoc-khi-migrate-v3-v\d+-\d{8}-\d{6}-reading-tracker\.sqlite$/);

      const copy = new Database(target, { readonly: true, fileMustExist: true });
      assert.equal(copy.pragma('user_version', { simple: true }), 3);
      assert.equal(copy.prepare('SELECT ten FROM cu').pluck().get(), 'dữ liệu cũ');
      copy.close();
      // File gốc không bị đụng tới.
      assert.equal(readSchemaVersion(dbFile), 3);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('không sao lưu khi DB in-memory, file chưa có, hoặc đã ở bản mới nhất', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-backup-'));
    const dbFile = path.join(dir, 'db', 'reading-tracker.sqlite');
    try {
      assert.equal(backupBeforeMigrate(':memory:', migrations), null);
      assert.equal(backupBeforeMigrate(dbFile, migrations), null, 'file chưa tồn tại');

      fs.mkdirSync(path.dirname(dbFile), { recursive: true });
      const first = openDatabase(dbFile);
      assert.equal(first.migration.to, LATEST);
      assert.equal(first.migration.backup_path, null, 'DB mới tạo thì không có gì để lùi');
      first.db.close();

      const second = openDatabase(dbFile);
      assert.equal(second.migration.backup_path, null, 'đã ở bản mới nhất thì không sao lưu');
      second.db.close();
      assert.equal(fs.existsSync(path.join(dir, 'backups')), false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('schema v15: định danh và dấu đã xoá cho đồng bộ', () => {
  test('bản ghi mới tự có sync_uid, không trùng nhau', async () => {
    const s = await startTestServer();
    try {
      const item = (await s.api('POST', '/items', { title: 'A', main_category: 'Fiction', status: 'Finished' })).body;
      await s.api('POST', `/items/${item.id}/library-cards`, { start_date: '2026-01-01', finish_date: '2026-01-05' });
      await s.api('POST', '/reading-logs', { item_id: item.id, date: '2026-01-02', units_read: 10, minutes_spent: 20 });
      await s.api('PUT', `/items/${item.id}/note`, { content_markdown: 'ghi chú' });
      await s.api('PUT', '/goals', { year: 2026, metric: 'books', target: 10 });

      for (const table of ['items', 'library_cards', 'reading_logs', 'reading_notes', 'goals']) {
        const rows = await s.db.all(`SELECT sync_uid FROM ${table}`, undefined, { pluck: true });
        assert.ok(rows.length > 0, `${table} chưa có dòng nào`);
        assert.ok(
          rows.every((uid) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(uid)),
          `${table}: ${rows.join(',')}`,
        );
        assert.equal(new Set(rows).size, rows.length, `${table} có sync_uid trùng`);
      }
    } finally {
      await s.stop();
    }
  });

  test('xoá bản ghi ghi lại dấu trong sync_deletions', async () => {
    const s = await startTestServer();
    try {
      const item = (await s.api('POST', '/items', { title: 'Sẽ xoá', main_category: 'Fiction', status: 'Finished' })).body;
      const cards = (await s.api('GET', `/items/${item.id}/library-cards`)).body.data;
      const itemUid = await s.db.get('SELECT sync_uid FROM items WHERE id = ?', [item.id], { pluck: true });
      const cardUid = await s.db.get('SELECT sync_uid FROM library_cards WHERE id = ?', [cards[0].id], { pluck: true });

      assert.equal(await s.db.get('SELECT COUNT(*) FROM sync_deletions', undefined, { pluck: true }), 0);
      assert.equal((await s.api('DELETE', `/items/${item.id}`)).status, 204);

      const marks = await s.db.all('SELECT table_name, sync_uid FROM sync_deletions ORDER BY table_name');
      // Xoá sách kéo theo lượt đọc (ON DELETE CASCADE), nên có dấu cho cả hai bảng.
      assert.deepEqual(
        marks,
        [
          { table_name: 'items', sync_uid: itemUid },
          { table_name: 'library_cards', sync_uid: cardUid },
        ],
      );
    } finally {
      await s.stop();
    }
  });

  test('bảng chưa tự ghi updated_at được trigger bơm hộ khi sửa', async () => {
    const s = await startTestServer();
    try {
      const challenge = (await s.api('POST', '/challenges', { name: 'Thử thách', type: 'prompt', prompts: ['Đề 1'] })).body;
      const before = await s.db.get('SELECT updated_at FROM challenges WHERE id = ?', [challenge.id], { pluck: true });
      assert.ok(before, 'dòng mới phải có updated_at');

      await new Promise((resolve) => setTimeout(resolve, 5));
      await s.api('PATCH', `/challenges/${challenge.id}`, { name: 'Đổi tên' });
      const after = await s.db.get('SELECT updated_at FROM challenges WHERE id = ?', [challenge.id], { pluck: true });
      assert.ok(after > before, `updated_at phải mới hơn: ${before} -> ${after}`);
    } finally {
      await s.stop();
    }
  });

  test('cấu hình vault không mang định danh đồng bộ (là thiết lập riêng của từng máy)', async () => {
    const s = await startTestServer();
    try {
      const columns = await s.db.all("SELECT name FROM pragma_table_info('obsidian_sync_config')", undefined, { pluck: true });
      assert.ok(!columns.includes('sync_uid'), 'obsidian_sync_config không được đồng bộ giữa các máy');
    } finally {
      await s.stop();
    }
  });
});
