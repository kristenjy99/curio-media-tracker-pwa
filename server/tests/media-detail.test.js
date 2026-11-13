import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import Database from 'better-sqlite3';
import { ensureStorageLayout, getStoragePaths } from '../config/storage.js';
import { runMigrations } from '../db/migrator.js';
import { mediaMigrations } from '../media/db/migrations.js';
import { startTestServer } from './helpers.js';

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);

test('migration 7: media có năm xem được tạo sẵn lượt #1, dữ liệu cũ giữ nguyên', () => {
  const db = new Database(':memory:');
  runMigrations(db, mediaMigrations.filter((m) => m.version <= 6));
  db.prepare("INSERT INTO media_items (sync_uid, title, category, rating, start_year, finish_year) VALUES ('a', 'Có năm', 'movie', 4, 2023, 2024)").run();
  db.prepare("INSERT INTO media_items (sync_uid, title, category) VALUES ('b', 'Không năm', 'movie')").run();
  runMigrations(db, mediaMigrations);
  const cards = db.prepare('SELECT media_id, start_year, finish_year, rating FROM media_watch_cards').all();
  assert.deepEqual(cards, [{ media_id: 1, start_year: 2023, finish_year: 2024, rating: null }]);
  assert.equal(db.prepare('SELECT rating FROM media_items WHERE id = 1').pluck().get(), 4);
});

test('media chi tiết: trường mới, lượt xem theo season, note và file', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-media-detail-'));
  const storagePaths = getStoragePaths(root);
  ensureStorageLayout(storagePaths);
  const s = await startTestServer({ storagePaths });
  try {
    const created = await s.api('POST', '/media/items', {
      title: 'Dark',
      category: 'tv_series',
      cast_members: ['Louis Hofmann', 'louis hofmann', 'Lisa Vicari'],
      platforms: ['Netflix'],
      episodes_per_season: [10, 8, null],
      language: 'Deutsch',
      trailer_url: 'https://youtu.be/x',
      warnings: ['Death'],
      youtube_channel: null,
    });
    assert.equal(created.status, 201);
    const item = created.body;
    assert.deepEqual(item.cast_members, ['Louis Hofmann', 'Lisa Vicari']);
    assert.deepEqual(item.episodes_per_season, [10, 8, null]);
    assert.equal((await s.api('PATCH', `/media/items/${item.id}`, { trailer_url: 'javascript:alert(1)' })).status, 400);

    const c1 = await s.api('POST', `/media/items/${item.id}/watch-cards`, { season: 1, start_year: 2021, start_month: 3, finish_year: 2021, finish_month: 4, rating: 4.5 });
    assert.equal(c1.status, 201);
    await s.api('POST', `/media/items/${item.id}/watch-cards`, { season: 2, finish_year: 2022 });
    const c3 = await s.api('POST', `/media/items/${item.id}/watch-cards`, { season: 1, start_year: 2024, start_month: 1, rating: 5 });
    assert.equal(c3.body.season_watch_number, 2);
    assert.equal(c3.body.watch_number, 3);
    assert.equal(c3.body.finished, false);
    assert.equal((await s.api('POST', `/media/items/${item.id}/watch-cards`, { start_year: 2024, start_month: 5, finish_year: 2024, finish_month: 2 })).status, 400);
    assert.equal((await s.api('POST', `/media/items/${item.id}/watch-cards`, { rating: 3 })).status, 400);

    let detail = (await s.api('GET', `/media/items/${item.id}`)).body;
    assert.equal(detail.watch_cards.length, 3);
    assert.equal(detail.start_year, 2021);
    assert.equal(detail.finish_year, 2022);
    await s.api('DELETE', `/media/watch-cards/${c1.body.id}`);
    detail = (await s.api('GET', `/media/items/${item.id}`)).body;
    assert.equal(detail.watch_cards[0].season_watch_number, 1);

    const upload = await fetch(`${s.baseUrl}/media/items/${item.id}/files?kind=moodboard`, { method: 'POST', body: PNG });
    assert.equal(upload.status, 201);
    const file = await upload.json();
    assert.ok(file.src.startsWith('/api/media/files/items/'));
    let note = (await s.api('PUT', `/media/items/${item.id}/note`, { content_markdown: '# Hay', moodboard_images: [{ src: file.src }], playlist_links: [{ url: 'https://open.spotify.com/x' }] })).body;
    assert.equal(note.playlist_links[0].platform, 'spotify');
    const local = path.join(storagePaths.mediaUploadsDir, ...file.src.slice('/api/media/files/'.length).split('/'));
    assert.ok(fs.existsSync(local));
    note = (await s.api('PUT', `/media/items/${item.id}/note`, { moodboard_images: [] })).body;
    assert.equal(note.content_markdown, '# Hay');
    assert.ok(!fs.existsSync(local));
    assert.equal((await s.api('PUT', `/media/items/${item.id}/note`, { moodboard_images: [{ src: '/etc/passwd' }] })).status, 400);

    const values = (await s.api('GET', '/media/items/values')).body;
    assert.deepEqual(values.platforms, ['Netflix']);
    assert.deepEqual(values.language, ['Deutsch']);
  } finally {
    await s.stop();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('sync media sang Obsidian: một chiều, theo category, ảnh vào _attachments, xoá thì vào .trash', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-media-sync-'));
  const storagePaths = getStoragePaths(path.join(root, 'storage'));
  ensureStorageLayout(storagePaths);
  const vault = path.join(root, 'vault');
  fs.mkdirSync(vault);
  const s = await startTestServer({ storagePaths });
  try {
    await s.api('PATCH', '/sync-config', { vault_path: vault, sync_enabled: true, vault_subfolder: '' });
    await s.api('POST', '/items', { title: 'Sách A', main_category: 'Fiction' });
    const show = (await s.api('POST', '/media/items', { title: 'Dark', category: 'tv_series', rating: 4.5, cast_members: ['Louis'], platforms: ['Netflix'], series_name: 'Dark' })).body;
    const clip = (await s.api('POST', '/media/items', { title: 'Clip', category: 'youtube', youtube_channel: 'Kurzgesagt', topics: ['Science'] })).body;
    await s.api('POST', `/media/items/${show.id}/watch-cards`, { season: 1, start_year: 2021, start_month: 3, finish_year: 2021, finish_month: 4, rating: 5, note: 'Hay' });
    const upload = await (await fetch(`${s.baseUrl}/media/items/${show.id}/files?kind=moodboard`, { method: 'POST', body: PNG })).json();
    await s.api('PUT', `/media/items/${show.id}/note`, { content_markdown: 'Review ![x](' + upload.src + ')', moodboard_images: [{ src: upload.src }] });

    const dry = (await s.api('POST', '/sync/run?dry_run=true')).body;
    assert.ok(dry.actions.some((action) => action.scope === 'media' && action.action === 'create_file' && action.path === 'TV Series/Dark.md'));
    assert.ok(!fs.existsSync(path.join(vault, 'Media Tracker')));

    const run = (await s.api('POST', '/sync/run')).body;
    assert.equal(run.counts.failed, undefined, JSON.stringify(run.actions.filter((a) => a.error)));
    const darkPath = path.join(vault, 'Media Tracker', 'TV Series', 'Dark.md');
    const text = fs.readFileSync(darkPath, 'utf8');
    assert.match(text, new RegExp(`^---\\nrt_id: ${show.sync_uid}`));
    assert.match(text, /Category: TV Series/);
    assert.match(text, /- "\[\[Netflix\]\]"/);
    assert.match(text, /#1 · S1 · 2021-03 → 2021-04 · ⭐⭐⭐⭐⭐ · Hay/);
    assert.match(text, /!\[\[Media Tracker\/_attachments\/Dark\/moodboard-/);
    assert.ok(fs.readdirSync(path.join(vault, 'Media Tracker', '_attachments', 'Dark')).length === 1);
    const clipText = fs.readFileSync(path.join(vault, 'Media Tracker', 'YouTube', 'Clip.md'), 'utf8');
    assert.match(clipText, /Topics:\n  - "\[\[Science\]\]"/);
    assert.doesNotMatch(text, /Topics:/);
    // Sách không bị lẫn file media (sách sync vào gốc vault, media là thư mục con).
    assert.ok(fs.existsSync(path.join(vault, 'Fiction', 'Sách A.md')));
    assert.ok(!run.actions.some((action) => !action.scope && action.path.startsWith('Media Tracker')));

    const again = (await s.api('POST', '/sync/run')).body;
    assert.equal(again.actions.filter((action) => action.scope === 'media' && action.action !== 'ignored').length, 0, JSON.stringify(again.actions));

    // Sửa trong Obsidian -> bị ghi đè, bản sửa giữ thành .conflict; đổi category -> chuyển thư mục.
    fs.writeFileSync(darkPath, `${text}\nsửa tay\n`);
    await s.api('PATCH', `/media/items/${show.id}`, { category: 'movie' });
    const moved = (await s.api('POST', '/sync/run')).body;
    const move = moved.actions.find((action) => action.scope === 'media' && action.action === 'move_file');
    assert.equal(move.path, 'Movies/Dark.md');
    assert.ok(move.conflict_path);
    assert.ok(fs.existsSync(path.join(vault, 'Media Tracker', 'Movies', 'Dark.md')));

    await s.api('DELETE', `/media/items/${show.id}`);
    const removed = (await s.api('POST', '/sync/run')).body;
    assert.ok(removed.actions.some((action) => action.scope === 'media' && action.action === 'trash_file'));
    assert.ok(!fs.existsSync(path.join(vault, 'Media Tracker', 'Movies', 'Dark.md')));
    assert.ok(!fs.existsSync(path.join(vault, 'Media Tracker', '_attachments', 'Dark')));
    assert.equal((await s.api('GET', '/sync/status')).body.pending_deletions, 0);

    await s.api('PATCH', '/sync-config', { media_subfolder: '' });
    const off = (await s.api('POST', '/sync/run?dry_run=true')).body;
    assert.ok(!off.actions.some((action) => action.scope === 'media'));
  } finally {
    await s.stop();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
