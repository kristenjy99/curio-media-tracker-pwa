import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { ensureStorageLayout, getStoragePaths } from '../config/storage.js';
import { startTestServer } from './helpers.js';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

describe('cài đặt chung', () => {
  let ctx;
  let storage;
  before(async () => {
    storage = ensureStorageLayout(getStoragePaths(fs.mkdtempSync(path.join(os.tmpdir(), 'rt-settings-'))));
    ctx = await startTestServer({ storagePaths: storage });
  });
  after(async () => {
    await ctx.stop();
    fs.rmSync(storage.root, { recursive: true, force: true });
  });

  test('mặc định có danh sách ngôn ngữ và giao diện', async () => {
    const res = await ctx.api('GET', '/settings');
    assert.equal(res.status, 200);
    assert.ok(res.body.languages.includes('Tiếng Việt'));
    assert.equal(res.body.appearance.preset, 'moss');
    assert.equal(res.body.appearance.font_size, 15);
  });

  test('đổi tên app; tên trống bị chặn', async () => {
    assert.equal((await ctx.api('GET', '/settings')).body.general.app_name, 'Media Tracker');
    assert.equal((await ctx.api('PATCH', '/settings', { general: { app_name: 'Thư viện của Vy' } })).body.general.app_name, 'Thư viện của Vy');
    assert.equal((await ctx.api('PATCH', '/settings', { general: { app_name: '   ' } })).status, 400);
  });

  test('sửa danh sách ngôn ngữ; trùng tên bị chặn', async () => {
    const ok = await ctx.api('PATCH', '/settings', { languages: ['Tiếng Việt', 'English', 'Tiếng Pháp'] });
    assert.deepEqual(ok.body.languages, ['Tiếng Việt', 'English', 'Tiếng Pháp']);
    const dup = await ctx.api('PATCH', '/settings', { languages: ['English', 'english'] });
    assert.equal(dup.status, 400);
  });

  test('sửa giao diện từng phần; giá trị sai bị chặn', async () => {
    const res = await ctx.api('PATCH', '/settings', { appearance: { preset: 'ocean', accent: '#aa3366', font_size: 17, display_font: 'lora' } });
    assert.equal(res.body.appearance.preset, 'ocean');
    assert.equal(res.body.appearance.body_font, 'be-vietnam-pro', 'trường không gửi giữ nguyên');
    assert.equal((await ctx.api('PATCH', '/settings', { appearance: { font_size: 40 } })).status, 400);
    assert.equal((await ctx.api('PATCH', '/settings', { appearance: { accent: 'red' } })).status, 400);
    assert.equal((await ctx.api('PATCH', '/settings', { appearance: { background_image: '/etc/passwd' } })).body.appearance.background_image, null);
  });

  test('ảnh nền: tải lên, phục vụ qua /media, thay thì xoá file cũ, khôi phục mặc định xoá ảnh', async () => {
    const put = () => fetch(`${ctx.baseUrl}/settings/background`, { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: PNG }).then((r) => r.json());
    const first = await put();
    assert.match(first.appearance.background_image, /^\/media\/app\/background-\d+\.png$/);
    assert.equal((await fetch(ctx.baseUrl.replace('/api', '') + first.appearance.background_image)).status, 200);
    await new Promise((resolve) => setTimeout(resolve, 5));
    await put();
    assert.equal(fs.readdirSync(path.join(storage.uploadsDir, 'app')).length, 1);
    const reset = await ctx.api('POST', '/settings/appearance/reset');
    assert.equal(reset.body.appearance.background_image, null);
    assert.equal(reset.body.appearance.preset, 'moss');
    assert.equal(fs.readdirSync(path.join(storage.uploadsDir, 'app')).length, 0);
    const bad = await fetch(`${ctx.baseUrl}/settings/background`, { method: 'PUT', body: 'không phải ảnh' });
    assert.equal(bad.status, 400);
  });

  test('ngày review là trường chính, sắp xếp được', async () => {
    const a = await ctx.api('POST', '/items', { title: 'A', main_category: 'Fanfiction', review_date: '2026-02-26' });
    assert.equal(a.body.review_date, '2026-02-26');
    assert.equal((await ctx.api('POST', '/items', { title: 'B', main_category: 'Fiction', review_date: '26/02/2026' })).status, 400);
    assert.equal((await ctx.api('GET', '/items?sort=review_date')).status, 200);
  });
});
