import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { getStoragePaths } from '../config/storage.js';
import { openMediaDatabase } from '../media/db/connection.js';

test('media: đường dẫn lưu trữ nằm trong thư mục riêng, tách khỏi sách', () => {
  const paths = getStoragePaths('/tmp/x');
  assert.equal(paths.mediaDbFile, path.join('/tmp/x', 'media', 'db', 'media-tracker.sqlite'));
  assert.notEqual(paths.mediaDbFile, paths.dbFile);
  assert.notEqual(paths.mediaUploadsDir, paths.uploadsDir);
});

test('media: DB riêng chạy migration tới bản mới nhất và không có bảng của sách', () => {
  // Migration chạy đồng bộ trên handle better-sqlite3 gốc (db.raw), xem server/db/async.js.
  const { db, migration } = openMediaDatabase(':memory:');
  assert.equal(migration.to, 8);
  const tables = db.raw.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name);
  assert.ok(tables.includes('media_items') && !tables.includes('items'));
  db.close();
});

import os from 'node:os';
import { ensureStorageLayout } from '../config/storage.js';
import { startTestServer } from './helpers.js';

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);

test('media API: CRUD, lọc, kiểm tra dữ liệu và không lẫn với sách', async () => {
  const s = await startTestServer();
  try {
    const created = await s.api('POST', '/media/items', { title: 'Breaking Bad', category: 'tv_series', progress_total: 62 });
    assert.equal(created.status, 201);
    assert.equal(created.body.status, 'TBW');
    const id = created.body.id;
    await s.api('POST', '/media/items', { title: 'Spirited Away', category: 'animation' });

    assert.equal((await s.api('GET', '/media/items?category=tv_series')).body.items.length, 1);
    assert.equal((await s.api('GET', '/media/items?q=spirit')).body.items[0].title, 'Spirited Away');
    assert.equal((await s.api('POST', '/media/items', { title: '  ', category: 'movie' })).status, 400);
    assert.equal((await s.api('POST', '/media/items', { title: 'X', category: 'book' })).status, 400);
    assert.equal((await s.api('PATCH', `/media/items/${id}`, { progress_current: 63 })).status, 400);

    const updated = await s.api('PATCH', `/media/items/${id}`, { status: 'Watching', progress_current: 10, rating: 4.5 });
    assert.deepEqual([updated.body.status, updated.body.progress_current, updated.body.rating], ['Watching', 10, 4.5]);

    const s9 = await s.api('POST', '/media/items', { title: '9-1-1 (season 10)', category: 'tv_series', series_name: ' 9-1-1 ', season_current: 10, season_total: 10 });
    assert.deepEqual([s9.body.series_name, s9.body.season_current, s9.body.season_total], ['9-1-1', 10, 10]);
    assert.equal((await s.api('PATCH', `/media/items/${s9.body.id}`, { season_current: 11 })).status, 400);
    assert.equal((await s.api('PATCH', `/media/items/${s9.body.id}`, { series_name: '   ' })).body.series_name, null);
    await s.api('PATCH', `/media/items/${s9.body.id}`, { series_name: '9-1-1', season_current: 9 });
    const tagged = await s.api('PATCH', `/media/items/${s9.body.id}`, { genres: ['Drama', 'drama', 'Action'], countries: ['Mỹ'], is_favorite: true });
    assert.deepEqual([tagged.body.genres, tagged.body.countries, tagged.body.is_favorite], [['Drama', 'Action'], ['Mỹ'], true]);
    assert.equal((await s.api('GET', '/media/items?favorite=1')).body.items.length, 1);
    assert.equal((await s.api('PATCH', `/media/items/${s9.body.id}`, { is_favorite: 'yes' })).status, 400);
    assert.deepEqual((await s.api('GET', '/media/items/series')).body.series, ['9-1-1']);
    assert.deepEqual((await s.api('GET', '/media/items/countries')).body.countries, ['Mỹ']);
    assert.equal((await s.api('GET', '/media/items?q=9-1')).body.items.length, 1);
    const g = await s.api('PATCH', `/media/items/${s9.body.id}`, { genres: ['Drama', ' crime ', 'drama', 'Action'] });
    assert.deepEqual(g.body.genres, ['Drama', 'crime', 'Action']);
    assert.deepEqual((await s.api('GET', '/media/items/genres')).body.genres, ['Action', 'crime', 'Drama']);
    assert.equal((await s.api('GET', '/media/items?genre=CRIME')).body.items.length, 1);
    assert.equal((await s.api('GET', '/media/items?genre=Horror')).body.items.length, 0);
    assert.deepEqual(created.body.genres, []);
    assert.equal((await s.api('DELETE', `/media/items/${id}`)).status, 204);
    assert.equal((await s.api('GET', `/media/items/${id}`)).status, 404);
    assert.equal((await s.api('GET', '/items')).body.total ?? 0, 0); // bảng sách không bị ảnh hưởng
  } finally {
    await s.stop();
  }
});

test('media API: tải ảnh bìa vào media/uploads và xóa cùng item', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'media-'));
  const storagePaths = getStoragePaths(root);
  ensureStorageLayout(storagePaths);
  const s = await startTestServer({ storagePaths });
  try {
    const { body: item } = await s.api('POST', '/media/items', { title: 'Inception', category: 'movie' });
    const put = await fetch(`${s.baseUrl}/media/items/${item.id}/cover`, { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: PNG });
    const withCover = await put.json();
    assert.match(withCover.cover_image, /^\/api\/media\/files\/items\/.+\/cover-\d+\.png$/);
    assert.equal((await fetch(`${s.baseUrl}${withCover.cover_image.slice('/api'.length)}`)).status, 200);
    assert.equal((await fetch(`${s.baseUrl}/media/items/${item.id}/cover`, { method: 'PUT', body: Buffer.from('not an image at all') })).status, 400);
    const dir = path.join(storagePaths.mediaUploadsDir, 'items', item.sync_uid);
    assert.ok(fs.existsSync(dir));
    // Đổi sang link ảnh ngoài: file đã tải lên bị gỡ; link không phải http bị chặn.
    const localFile = path.join(dir, path.basename(withCover.cover_image));
    const linked = await s.api('PATCH', `/media/items/${item.id}`, { cover_image: 'https://example.com/poster.jpg' });
    assert.equal(linked.body.cover_image, 'https://example.com/poster.jpg');
    assert.ok(!fs.existsSync(localFile));
    assert.equal((await s.api('PATCH', `/media/items/${item.id}`, { cover_image: 'javascript:alert(1)' })).status, 400);
    const created = await s.api('POST', '/media/items', { title: 'Có link', category: 'movie', cover_image: 'https://example.com/a.png' });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.cover_image, 'https://example.com/a.png');
    await s.api('DELETE', `/media/items/${item.id}`);
    assert.ok(!fs.existsSync(dir));
  } finally {
    await s.stop();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('media stats: tính theo năm xem xong, Watching tách riêng, so với năm trước, thiếu năm đếm riêng', async () => {
  const s = await startTestServer();
  try {
    const make = (data) => s.api('POST', '/media/items', data);
    await make({ title: 'A', category: 'tv_series', status: 'Finished', rating: 4, genres: ['Drama', 'Crime'], countries: ['Hàn Quốc'], start_year: 2025, finish_year: 2026 });
    await make({ title: 'B', category: 'movie', status: 'Finished', rating: 5, genres: ['Drama'], countries: ['Mỹ'], finish_year: 2026 });
    await make({ title: 'C', category: 'movie', status: 'DNF', genres: ['Drama'], finish_year: 2026 });
    await make({ title: 'D', category: 'animation', status: 'Finished', rating: 3, finish_year: 2025 });
    await make({ title: 'E', category: 'tv_series', status: 'Watching', start_year: 2025 });
    await make({ title: 'F', category: 'youtube', status: 'Finished' });
    await make({ title: 'G', category: 'youtube', status: 'Watching' });
    await make({ title: 'H', category: 'movie', status: 'TBW' });

    assert.equal((await make({ title: 'X', category: 'movie', start_year: 2026, finish_year: 2025 })).status, 400);
    assert.equal((await make({ title: 'X', category: 'movie', finish_year: 1800 })).status, 400);

    const r = await s.api('GET', '/media/stats?year=2026&today=2026-11-05');
    assert.equal(r.status, 200);
    const b = r.body;
    assert.deepEqual([b.totals.finished, b.totals.dnf, b.totals.watching, b.totals.rated, b.totals.average_rating], [2, 1, 2, 2, 4.5]);
    assert.deepEqual(b.undated, { done: 1, watching: 1 });
    assert.deepEqual(b.years, [2026, 2025]);
    assert.deepEqual(b.by_category.find((row) => row.category === 'movie'), { category: 'movie', finished: 1, dnf: 1, watching: 0, total: 2 });
    assert.deepEqual(b.by_category.find((row) => row.category === 'tv_series'), { category: 'tv_series', finished: 1, dnf: 0, watching: 1, total: 2 });
    assert.deepEqual(b.stats.genres.slice(0, 2).map((row) => [row.name, row.count]), [['Drama', 3], ['Crime', 1]]);
    assert.equal(b.stats.genres[0].average, null, 'dưới 5 media đã chấm thì không có điểm trung bình');
    assert.deepEqual(b.items.map((row) => row.title), ['E', 'G', 'A', 'B', 'C']);
    const finished = b.comparison.rows.find((row) => row.label === 'Đã xem xong');
    assert.deepEqual([finished.current, finished.previous, finished.diff, finished.pct], [2, 1, 1, 100]);

    const prev = (await s.api('GET', '/media/stats?year=2025&today=2026-11-05')).body;
    assert.deepEqual([prev.totals.finished, prev.totals.watching], [1, 1], 'Watching có start_year 2025 tính vào 2025, mục chưa có năm bắt đầu thì không');
    assert.equal((await s.api('GET', '/media/stats?year=abc')).status, 400);
  } finally {
    await s.stop();
  }
});
