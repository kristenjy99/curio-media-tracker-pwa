import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { startTestServer } from './helpers.js';

describe('custom storage directory', () => {
  let ctx;
  let sandbox;
  const writes = [];

  before(async () => {
    ctx = await startTestServer({ writeConfig: (patch) => writes.push(patch) });
    sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-storage-'));
  });

  after(async () => {
    await ctx.stop();
    fs.rmSync(sandbox, { recursive: true, force: true });
  });

  test('inspect thư mục chưa tồn tại: ghi được, chưa có DB; nhận diện Google Drive', async () => {
    const target = path.join(sandbox, 'Google Drive', 'Reading');
    const res = await ctx.api('POST', '/storage/inspect', { path: target });
    assert.equal(res.status, 200);
    assert.equal(res.body.exists, false);
    assert.equal(res.body.writable, true);
    assert.equal(res.body.has_database, false);
    assert.equal(res.body.cloud_provider, 'Google Drive');
    assert.equal(res.body.warnings.length, 1);
  });

  test('đường dẫn tương đối bị chặn', async () => {
    assert.equal((await ctx.api('POST', '/storage/inspect', { path: 'relative' })).status, 400);
  });

  test('copy sang thư mục mới: dữ liệu đi theo, app chuyển DB ngay, ghi config', async () => {
    await ctx.api('POST', '/items', { title: 'Đi theo storage', main_category: 'Fiction' });
    const target = path.join(sandbox, 'A');
    const res = await ctx.api('PUT', '/storage', { path: target, mode: 'copy' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.storage.root, target);
    assert.ok(fs.existsSync(path.join(target, 'db', 'reading-tracker.sqlite')));
    assert.deepEqual(writes.at(-1), { storage_path: target });

    const info = await ctx.api('GET', '/system/info');
    assert.equal(info.body.storage.root, target);
    assert.equal(info.body.schema_version, 16);
    const items = await ctx.api('GET', '/items');
    assert.equal(items.body.total, 1);
    assert.equal(items.body.data[0].title, 'Đi theo storage');
  });

  test('ghi sau khi đổi storage nằm trong DB mới', async () => {
    await ctx.api('POST', '/items', { title: 'Chỉ ở A', main_category: 'Fiction' });
    assert.equal((await ctx.api('GET', '/items')).body.total, 2);
  });

  test('copy vào thư mục đã có DB bị chặn; open thư mục trống bị chặn; thư mục hiện tại bị chặn', async () => {
    const target = path.join(sandbox, 'B');
    assert.equal((await ctx.api('PUT', '/storage', { path: target, mode: 'open' })).status, 400);
    assert.equal((await ctx.api('PUT', '/storage', { path: target, mode: 'copy' })).status, 200);
    assert.equal((await ctx.api('PUT', '/storage', { path: path.join(sandbox, 'A'), mode: 'copy' })).status, 409);
    assert.equal((await ctx.api('PUT', '/storage', { path: target, mode: 'copy' })).status, 400);
    assert.equal((await ctx.api('PUT', '/storage', { path: path.join(target, 'con'), mode: 'copy' })).status, 400);
  });

  test('open DB có sẵn: quay lại thư mục A', async () => {
    const inspect = await ctx.api('POST', '/storage/inspect', { path: path.join(sandbox, 'A') });
    assert.equal(inspect.body.has_database, true);
    assert.equal(inspect.body.database_schema_version, 16);
    const res = await ctx.api('PUT', '/storage', { path: path.join(sandbox, 'A'), mode: 'open' });
    assert.equal(res.status, 200);
    assert.equal((await ctx.api('GET', '/system/info')).body.storage.root, path.join(sandbox, 'A'));
  });

  test('duyệt thư mục cho folder picker', async () => {
    const roots = await ctx.api('GET', '/fs/dirs');
    assert.ok(roots.body.dirs.length >= 1);
    fs.mkdirSync(path.join(sandbox, '.an'));
    const listing = await ctx.api('GET', `/fs/dirs?path=${encodeURIComponent(sandbox)}`);
    assert.deepEqual(listing.body.dirs.map((dir) => dir.name), ['A', 'B']);
    assert.equal(listing.body.parent, path.dirname(sandbox));
    const hidden = await ctx.api('GET', `/fs/dirs?path=${encodeURIComponent(sandbox)}&show_hidden=true`);
    assert.ok(hidden.body.dirs.some((dir) => dir.name === '.an'));
    assert.equal((await ctx.api('GET', `/fs/dirs?path=${encodeURIComponent(path.join(sandbox, 'khong'))}`)).status, 400);
  });

  test('host lạ (DNS rebinding) bị chặn 403', async () => {
    const url = new URL(`${ctx.baseUrl}/health`);
    const status = await new Promise((resolve, reject) => {
      const req = http.request(
        { hostname: url.hostname, port: url.port, path: url.pathname, headers: { Host: `evil.example:${url.port}` } },
        (res) => {
          res.resume();
          resolve(res.statusCode);
        },
      );
      req.on('error', reject);
      req.end();
    });
    assert.equal(status, 403);
  });
});

describe('storage bị khoá bởi biến môi trường', () => {
  test('đổi storage trả 409', async () => {
    const ctx = await startTestServer({ isEnvLocked: () => true });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-locked-'));
    try {
      const res = await ctx.api('PUT', '/storage', { path: path.join(dir, 'x'), mode: 'copy' });
      assert.equal(res.status, 409);
      assert.match(res.body.error.message, /READING_TRACKER_STORAGE/);
    } finally {
      await ctx.stop();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
