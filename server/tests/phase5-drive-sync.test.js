import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ensureStorageLayout, getStoragePaths } from '../config/storage.js';
import { planMerge } from '../services/driveSync/merge.js';
import { startTestServer } from './helpers.js';

/**
 * Đồng bộ Google Drive (Phiên 5), phần dữ liệu. Drive được giả lập bằng một object trong bộ nhớ;
 * phần gọi Google thật nằm ở trình duyệt (client/src/lib/driveSync.js) và không test được ở đây.
 * Mỗi "máy" là một server riêng với thư mục lưu trữ riêng.
 */

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4b90000000049454e44ae426082', 'hex');

async function device() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-drive-'));
  const storagePaths = getStoragePaths(root);
  ensureStorageLayout(storagePaths);
  const s = await startTestServer({ storagePaths });
  return Object.assign(s, { root });
}

function createDrive() {
  return { snapshot: null, blobs: new Map(), next: 1 };
}

/** Một lượt đồng bộ, đúng thứ tự client làm: apply -> tải file thiếu -> đẩy file mới -> ghi snapshot -> commit. */
async function sync(s, drive, mode = 'merge') {
  const applied = await s.api('POST', '/drive-sync/apply', { remote: drive.snapshot, mode, device: 'test' });
  assert.equal(applied.status, 200, JSON.stringify(applied.body));
  const { snapshot, files } = applied.body;
  for (const { key, id } of files.download) {
    const response = await fetch(`${s.baseUrl}/drive-sync/file?key=${encodeURIComponent(key)}`, { method: 'PUT', body: drive.blobs.get(id) });
    assert.equal(response.status, 200);
  }
  for (const { key } of files.upload) {
    const response = await fetch(`${s.baseUrl}/drive-sync/file?key=${encodeURIComponent(key)}`);
    assert.equal(response.status, 200);
    const bytes = Buffer.from(await response.arrayBuffer());
    const id = `f${drive.next++}`;
    drive.blobs.set(id, bytes);
    snapshot.files[key] = { id, size: bytes.length };
  }
  drive.snapshot = JSON.parse(JSON.stringify(snapshot));
  const base = Object.fromEntries(Object.entries(snapshot.units).map(([key, unit]) => [key, unit.hash]));
  assert.equal((await s.api('POST', '/drive-sync/commit', { base })).status, 200);
  return applied.body;
}

const bookByTitle = (s, title) => s.db.get('SELECT * FROM items WHERE title = ?', [title]);

test('hai chiều: sách kèm ảnh bìa, log, note, media, mục tiêu và cài đặt sang được máy kia', async () => {
  const [a, b] = [await device(), await device()];
  const drive = createDrive();
  try {
    const book = (await a.api('POST', '/items', { title: 'Dune', main_category: 'Fiction', status: 'Reading', total_units: 500 })).body;
    await fetch(`${a.baseUrl}/items/${book.id}/images/cover`, { method: 'PUT', body: PNG });
    assert.equal((await a.api('POST', '/reading-logs', { item_id: book.id, date: '2026-11-01', units_read: 40, minutes_spent: 30 })).status, 201);
    assert.equal((await a.api('PUT', `/items/${book.id}/note`, { content_markdown: '# ghi chú' })).status, 200);
    const media = (await a.api('POST', '/media/items', { title: 'Spirited Away', category: 'animation' })).body;
    await fetch(`${a.baseUrl}/media/items/${media.id}/cover`, { method: 'PUT', body: PNG });
    await a.api('PUT', '/goals', { year: 2026, metric: 'books', target: 30 });
    await a.api('PATCH', '/settings', { languages: ['Tiếng Việt', 'English'] });

    const first = await sync(a, drive);
    assert.equal(first.stats.pulled, 0);
    assert.equal(first.files.upload.length, 2, 'ảnh bìa sách và ảnh bìa media được đẩy lên');
    assert.ok(!Object.keys(drive.snapshot.units).includes('setting:drive_sync_state'), 'trạng thái đồng bộ là của riêng máy');

    const second = await sync(b, drive);
    assert.ok(second.stats.pulled >= 4);
    const copy = await bookByTitle(b, 'Dune');
    assert.equal(copy.sync_uid, book.sync_uid);
    assert.equal(await b.db.get('SELECT COUNT(*) FROM reading_logs WHERE item_id = ?', [copy.id], { pluck: true }), 1);
    assert.equal(await b.db.get('SELECT content_markdown FROM reading_notes WHERE item_id = ?', [copy.id], { pluck: true }), '# ghi chú');
    const cover = await fetch(`${b.baseUrl.replace(/\/api$/, '')}${copy.cover_image}`);
    assert.equal(cover.status, 200);
    assert.deepEqual(Buffer.from(await cover.arrayBuffer()), PNG);
    const mediaCopy = await b.runtime.context.mediaDb.get('SELECT * FROM media_items WHERE sync_uid = ?', [media.sync_uid]);
    assert.equal(mediaCopy.title, 'Spirited Away');
    assert.ok(fs.existsSync(path.join(b.root, 'media', 'uploads', mediaCopy.cover_image.replace('/api/media/files/', ''))));
    assert.equal((await b.api('GET', '/settings')).body.languages.length, 2);
    assert.equal(await b.db.get('SELECT target FROM goals WHERE year = 2026', [], { pluck: true }), 30);

    // Sửa ở B rồi đồng bộ về A.
    await b.api('PATCH', `/items/${copy.id}`, { rating: 4.5 });
    await sync(b, drive);
    const back = await sync(a, drive);
    assert.equal(back.stats.pulled, 1);
    assert.equal((await bookByTitle(a, 'Dune')).rating, 4.5);
    assert.equal((await bookByTitle(a, 'Dune')).id, book.id, 'giữ id cục bộ khi lấy bản từ Drive');

    // Không đẩy qua đẩy lại khi không ai sửa gì.
    for (const s of [a, b, a]) {
      const again = await sync(s, drive);
      assert.equal(again.stats.pulled + again.stats.pushed + again.stats.deleted_local, 0, JSON.stringify(again.stats));
    }
  } finally {
    await a.stop();
    await b.stop();
  }
});

test('đã xoá thì không sống lại; dấu xoá do chính đồng bộ sinh ra bị dọn', async () => {
  const [a, b] = [await device(), await device()];
  const drive = createDrive();
  try {
    const book = (await a.api('POST', '/items', { title: 'Sẽ bị xoá', main_category: 'Fiction' })).body;
    await sync(a, drive);
    await sync(b, drive);
    const copy = await bookByTitle(b, 'Sẽ bị xoá');
    assert.equal(await b.db.get('SELECT COUNT(*) FROM sync_deletions', [], { pluck: true }), 0, 'áp bản từ Drive không để lại dấu xoá');

    assert.equal((await b.api('DELETE', `/items/${copy.id}`)).status, 204);
    await sync(b, drive);
    const result = await sync(a, drive);
    assert.equal(result.stats.deleted_local, 1);
    assert.equal(await bookByTitle(a, 'Sẽ bị xoá'), null);
    assert.ok(drive.snapshot.deletions[`book:${book.sync_uid}`]);
    await sync(b, drive);
    await sync(a, drive);
    assert.equal(await bookByTitle(a, 'Sẽ bị xoá'), null);
    assert.equal(await bookByTitle(b, 'Sẽ bị xoá'), null);
  } finally {
    await a.stop();
    await b.stop();
  }
});

test('sửa cùng một sách ở hai nơi: bản có updated_at mới hơn thắng nguyên khối', async () => {
  const [a, b] = [await device(), await device()];
  const drive = createDrive();
  try {
    const book = (await a.api('POST', '/items', { title: 'Gốc', main_category: 'Fiction' })).body;
    await sync(a, drive);
    await sync(b, drive);
    const copy = await bookByTitle(b, 'Gốc');

    await a.api('PATCH', `/items/${book.id}`, { title: 'Sửa ở A', rating: 3 });
    await new Promise((resolve) => setTimeout(resolve, 15));
    await b.api('PATCH', `/items/${copy.id}`, { title: 'Sửa ở B' });
    await b.api('POST', '/reading-logs', { item_id: copy.id, date: '2026-11-02', units_read: 5 });

    await sync(a, drive);
    const atB = await sync(b, drive);
    assert.equal(atB.conflicts.length, 1);
    assert.equal(atB.conflicts[0].winner, 'local');
    await sync(a, drive);
    for (const s of [a, b]) {
      const row = await s.db.get('SELECT * FROM items WHERE sync_uid = ?', [book.sync_uid]);
      assert.equal(row.title, 'Sửa ở B');
      assert.equal(row.rating, null, 'thắng nguyên khối: rating sửa ở A không được giữ');
      assert.equal(await s.db.get('SELECT COUNT(*) FROM reading_logs WHERE item_id = ?', [row.id], { pluck: true }), 1);
    }
  } finally {
    await a.stop();
    await b.stop();
  }
});

test('tham chiếu id được đổi qua sync_uid: challenge, bracket, yêu thích tháng', async () => {
  const [a, b] = [await device(), await device()];
  const drive = createDrive();
  try {
    // B có sẵn một sách để id của hai máy lệch nhau.
    await b.api('POST', '/items', { title: 'Chỉ có ở B', main_category: 'Fiction' });
    const ids = [];
    for (const title of ['S1', 'S2', 'S3', 'S4']) ids.push((await a.api('POST', '/items', { title, main_category: 'Fiction' })).body.id);
    await a.db.run("INSERT INTO challenges (name, type, year) VALUES ('Thử thách', 'prompt', 2026)");
    const challengeId = await a.db.get('SELECT id FROM challenges', [], { pluck: true });
    await a.db.run("INSERT INTO challenge_slots (challenge_id, position, label, item_id) VALUES (?, 1, 'p1', ?)", [challengeId, ids[1]]);
    await a.db.run("INSERT INTO brackets (name, year, size, entries, picks) VALUES ('B', 2026, 4, ?, ?)", [JSON.stringify(ids), JSON.stringify({ '1-1': ids[2] })]);
    await a.db.run('INSERT INTO monthly_favorites (year, month, item_id, position) VALUES (2026, 11, ?, 0)', [ids[3]]);

    await sync(a, drive);
    await sync(b, drive);
    const idOn = async (title) => (await bookByTitle(b, title)).id;
    assert.equal(await b.db.get('SELECT item_id FROM challenge_slots', [], { pluck: true }), await idOn('S2'));
    const bracket = await b.db.get('SELECT * FROM brackets');
    assert.deepEqual(JSON.parse(bracket.entries), [await idOn('S1'), await idOn('S2'), await idOn('S3'), await idOn('S4')]);
    assert.equal(JSON.parse(bracket.picks)['1-1'], await idOn('S3'));
    assert.equal(await b.db.get('SELECT item_id FROM monthly_favorites', [], { pluck: true }), await idOn('S4'));
    const again = await sync(b, drive);
    assert.equal(again.stats.pulled, 0);
  } finally {
    await a.stop();
    await b.stop();
  }
});

test('bản chụp trước đồng bộ, khôi phục và ghi đè Drive', async () => {
  const [a, b] = [await device(), await device()];
  const drive = createDrive();
  try {
    await b.api('POST', '/items', { title: 'Của B trước khi đồng bộ', main_category: 'Fiction' });
    await sync(b, drive);
    await a.api('POST', '/items', { title: 'Của A', main_category: 'Fiction' });
    await a.api('PATCH', '/settings', { general: { app_name: 'Tên ở A' } });
    await a.db.run(
      "UPDATE app_settings SET value = json_set(value, '$.app_icon_ico', '/media/app/a.ico') WHERE key = 'general'",
    );
    const pulled = await sync(a, drive);
    assert.ok(pulled.backup?.id, 'có bản chụp vì có thay đổi lấy về');
    assert.ok(fs.readdirSync(path.join(a.root, 'backups')).some((name) => name.startsWith('truoc-khi-dong-bo-')), 'bản Windows có thêm bản sao SQLite');
    assert.ok(await bookByTitle(a, 'Của B trước khi đồng bộ'));

    const status = (await a.api('GET', '/drive-sync/status')).body;
    assert.equal(status.backups[0].id, pulled.backup.id);
    const restored = await a.api('POST', '/drive-sync/restore', { id: pulled.backup.id });
    assert.equal(restored.status, 200, JSON.stringify(restored.body));
    assert.equal(await bookByTitle(a, 'Của B trước khi đồng bộ'), null);
    assert.equal(await a.db.get('SELECT COUNT(*) FROM sync_deletions', [], { pluck: true }), 0, 'khôi phục không biến thành lệnh xoá trên máy kia');

    // Ghi đè Drive bằng dữ liệu máy A: sách chỉ có trên Drive bị đánh dấu xoá, B nhận theo.
    const pushed = await sync(a, drive, 'push');
    assert.equal(pushed.stats.deleted_remote, 1);
    await sync(b, drive);
    assert.equal(await bookByTitle(b, 'Của B trước khi đồng bộ'), null);
    assert.ok(await bookByTitle(b, 'Của A'));
    const general = JSON.parse(await b.db.get("SELECT value FROM app_settings WHERE key = 'general'", [], { pluck: true }));
    assert.equal(general.app_name, 'Tên ở A');
    assert.equal(general.app_icon_ico ?? null, null, 'file .ico là của riêng máy A');
  } finally {
    await a.stop();
    await b.stop();
  }
});

test('Drive do bản app mới hơn ghi thì từ chối, không đụng dữ liệu', async () => {
  const a = await device();
  try {
    const response = await a.api('POST', '/drive-sync/apply', { remote: { format_version: 1, schema: { books: 999, media: 1 }, units: {} } });
    assert.equal(response.status, 409);
    assert.equal(response.body.error.code, 'SYNC_SCHEMA_NEWER');
    assert.equal((await a.api('GET', '/drive-sync/file?key=books/../x')).status, 400);
  } finally {
    await a.stop();
  }
});

test('planMerge: xoá ở một nơi, sửa ở nơi kia sau đó thì bản sửa thắng', () => {
  const unit = (hash, updated_at) => ({ hash, updated_at, children: [] });
  const local = new Map([['book:x', { key: 'book:x', ...unit('h2', '2026-11-02T00:00:00Z') }]]);
  const empty = { units: new Map(), children: new Map() };
  const later = planMerge({ local, remote: { units: {}, deletions: { 'book:x': '2026-11-01T00:00:00Z' } }, base: { 'book:x': 'h1' }, localDeletions: empty });
  assert.deepEqual(later.deletes, []);
  assert.equal(later.conflicts[0].winner, 'local');
  const unchanged = planMerge({ local, remote: { units: {}, deletions: { 'book:x': '2026-11-01T00:00:00Z' } }, base: { 'book:x': 'h2' }, localDeletions: empty });
  assert.deepEqual(unchanged.deletes, ['book:x']);
  // Xoá một dòng con ở máy này cũng tính là sửa khi so mốc thời gian.
  const childDeleted = { units: new Map(), children: new Map([['log-1', '2026-11-05T00:00:00Z']]) };
  const remote = { units: { 'book:x': { ...unit('h3', '2026-11-03T00:00:00Z'), children: ['log-1'] } } };
  const plan = planMerge({ local, remote, base: { 'book:x': 'h1' }, localDeletions: childDeleted });
  assert.equal(plan.conflicts[0].winner, 'local');
});

test('driveApi (client): truy vấn, upload multipart và đổi lỗi HTTP thành câu dễ hiểu', async () => {
  const { createDriveClient } = await import('../../client/src/lib/driveApi.js');
  const calls = [];
  const reply = (status, body) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const queue = [
    reply(200, { files: [{ id: 'folder-1', name: 'Media Tracker Sync' }] }),
    reply(200, { id: 'new-1', size: '4' }),
    reply(401, { error: { message: 'Invalid Credentials' } }),
    reply(403, { error: { errors: [{ reason: 'accessNotConfigured' }], message: 'Drive API has not been used' } }),
  ];
  const fakeFetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return queue.shift();
  };
  const drive = createDriveClient('tok', fakeFetch);

  const folder = await drive.findFolder("Media Tracker Sync");
  assert.equal(folder.id, 'folder-1');
  const query = new URL(calls[0].url).searchParams.get('q');
  assert.match(query, /name = 'Media Tracker Sync' and mimeType = 'application\/vnd.google-apps.folder' and trashed = false/);
  assert.equal(calls[0].init.headers.Authorization, 'Bearer tok');

  await drive.createFile("books/items/u'1/cover-1.png", 'folder-1', new Blob([PNG], { type: 'image/png' }), { key: 'k' });
  const body = await calls[1].init.body.text();
  assert.match(calls[1].init.headers['Content-Type'], /^multipart\/related; boundary=/);
  assert.ok(body.includes('"name":"books/items/u\'1/cover-1.png"') && body.includes('"parents":["folder-1"]') && body.includes('Content-Type: image/png'));

  await assert.rejects(drive.getMeta('x'), (error) => error.code === 'token_expired' && /hết hạn/.test(error.message));
  await assert.rejects(drive.getMeta('x'), (error) => error.code === 'api_disabled');
  await assert.rejects(createDriveClient('tok', async () => { throw new TypeError('fetch failed'); }).getMeta('x'), (error) => error.code === 'network');
});

test('bản PWA (SQLite WASM + FileStore trình duyệt) nhận được dữ liệu và hash khớp với bản Windows', async () => {
  const { default: sqlite3InitModule } = await import('@sqlite.org/sqlite-wasm');
  const { createAsyncDb } = await import('../db/async.js');
  const { createSerialScope } = await import('../db/scope.browser.js');
  const { migrations } = await import('../db/migrations/index.js');
  const { runMigrations } = await import('../db/migrator.js');
  const { mediaMigrations } = await import('../media/db/migrations.js');
  const { createWasmHandle } = await import('../platform/sqliteWasm.js');
  const { createBrowserFileStore, createMemoryBackend } = await import('../storage/browserFileStore.js');
  const { createDriveSyncService } = await import('../services/driveSync/index.js');

  const sqlite3 = await sqlite3InitModule({ print: () => {}, printErr: () => {} });
  const open = (list) => {
    const raw = createWasmHandle(new sqlite3.oo1.DB(':memory:'), sqlite3);
    raw.pragma('foreign_keys = ON');
    runMigrations(raw, list);
    return createAsyncDb(raw, { scope: createSerialScope(), exportBytes: (handle) => handle.exportBytes() });
  };
  const backend = createMemoryBackend();
  const phone = {
    db: open(migrations),
    mediaDb: open(mediaMigrations),
    fileStore: createBrowserFileStore({ backend }),
    mediaFileStore: createBrowserFileStore({ backend, prefix: 'media' }),
    syncBackupStore: createBrowserFileStore({ backend, prefix: 'sync-backups' }),
    storagePaths: null,
    platform: 'pwa',
  };
  const service = createDriveSyncService(phone);

  const a = await device();
  const drive = createDrive();
  try {
    const book = (await a.api('POST', '/items', { title: 'Trên điện thoại', main_category: 'Fiction', rating: 4.5, tags: ['a', 'b'] })).body;
    await fetch(`${a.baseUrl}/items/${book.id}/images/cover`, { method: 'PUT', body: PNG });
    await a.api('POST', '/reading-logs', { item_id: book.id, date: '2026-11-03', units_read: 12 });
    await a.api('POST', '/media/items', { title: 'Phim', category: 'movie' });
    await sync(a, drive);

    const applied = await service.apply({ remote: drive.snapshot, device: 'android' });
    assert.equal(applied.stats.pulled, 2, "một sách, một media");
    assert.ok(applied.backup.id, 'bản PWA có bản chụp JSON trong IndexedDB');
    for (const { key, id } of applied.files.download) await service.writeFile(key, drive.blobs.get(id));
    const row = await phone.db.get('SELECT * FROM items WHERE sync_uid = ?', [book.sync_uid]);
    assert.equal(row.rating, 4.5);
    assert.deepEqual(Buffer.from(await phone.fileStore.read(row.cover_image.replace('/media/', ''))), PNG);
    for (const [key, unit] of Object.entries(applied.snapshot.units)) {
      if (drive.snapshot.units[key]) assert.equal(unit.hash, drive.snapshot.units[key].hash, `hash lệch giữa Node và WASM: ${key}`);
    }
    await service.commit({ base: Object.fromEntries(Object.entries(applied.snapshot.units).map(([key, unit]) => [key, unit.hash])) });
    const again = await service.apply({ remote: applied.snapshot });
    assert.equal(again.stats.pulled + again.stats.pushed, 0, JSON.stringify(again.stats));
  } finally {
    await a.stop();
  }
});
