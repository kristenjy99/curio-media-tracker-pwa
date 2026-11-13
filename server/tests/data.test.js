import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { ensureStorageLayout, getStoragePaths } from '../config/storage.js';
import { startTestServer } from './helpers.js';

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);

test('làm sạch dữ liệu: cần mật khẩu, sao lưu trước, giữ cài đặt', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-wipe-'));
  const storagePaths = getStoragePaths(root);
  ensureStorageLayout(storagePaths);
  const s = await startTestServer({ storagePaths });
  try {
    const book = (await s.api('POST', '/items', { title: 'A', main_category: 'Fiction', status: 'Finished' })).body;
    await fetch(`${s.baseUrl}/items/${book.id}/images/cover`, { method: 'PUT', body: PNG });
    await s.api('POST', '/media/items', { title: 'M', category: 'movie' });
    await s.api('PATCH', '/settings', { general: { app_name: 'Kệ của tôi' } });

    assert.equal((await s.api('POST', '/data/wipe', { password: 'abcd' })).status, 409);
    assert.equal((await s.api('PUT', '/data/password', { new_password: '12' })).status, 400);
    assert.equal((await s.api('PUT', '/data/password', { new_password: 'abcd' })).body.has_password, true);
    assert.equal((await s.api('PUT', '/data/password', { current_password: 'sai', new_password: 'efgh' })).status, 400);
    assert.equal((await s.api('PUT', '/data/password', { current_password: 'abcd', new_password: 'efgh' })).status, 200);
    assert.ok(!JSON.stringify((await s.api('GET', '/settings')).body).includes('hash'));

    const wrong = await s.api('POST', '/data/wipe', { password: 'abcd' });
    assert.equal(wrong.status, 400);
    assert.equal(wrong.body.error.details[0].path[0], 'password');
    assert.equal((await s.api('GET', '/data/status')).body.books, 1);

    const done = await s.api('POST', '/data/wipe', { password: 'efgh' });
    assert.equal(done.status, 200);
    assert.deepEqual(done.body.deleted, { books: 1, media: 1 });
    assert.equal(done.body.books, 0);
    assert.equal(done.body.media, 0);
    assert.equal(await s.db.get('SELECT COUNT(*) FROM sync_tombstones', undefined, { pluck: true }), 0);
    assert.ok(fs.existsSync(path.join(done.body.backup_dir, path.basename(storagePaths.dbFile))));
    assert.ok(fs.readdirSync(path.join(done.body.backup_dir, 'uploads-items')).length > 0);
    assert.equal((await s.api('GET', '/settings')).body.general.app_name, 'Kệ của tôi');
    assert.equal((await s.api('GET', '/data/status')).body.has_password, true);
  } finally {
    await s.stop();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('tags theo thể loại chính', async () => {
  const s = await startTestServer();
  try {
    await s.api('POST', '/items', { title: 'A', main_category: 'Fiction', tags: ['Fantasy', 'Romance'] });
    await s.api('POST', '/items', { title: 'B', main_category: 'Fanfiction', tags: ['Angst', 'Romance'] });
    assert.deepEqual((await s.api('GET', '/items/tags?category=Fanfiction')).body.data.map((row) => row.tag).sort(), ['Angst', 'Romance']);
    assert.equal((await s.api('GET', '/items/tags')).body.data.length, 3);
  } finally {
    await s.stop();
  }
});
