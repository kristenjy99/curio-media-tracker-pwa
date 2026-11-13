import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { ensureStorageLayout, getStoragePaths } from '../config/storage.js';
import { startTestServer } from './helpers.js';

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
const SVG = Buffer.from('<?xml version="1.0"?>\n<!-- cây -->\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle r="4" cx="5" cy="5"/></svg>');

test('đồ trang trí kệ: tải PNG/SVG, sửa hiển thị, xoá file, SVG bị cô lập khi mở trực tiếp', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-orn-'));
  const storagePaths = getStoragePaths(root);
  ensureStorageLayout(storagePaths);
  const s = await startTestServer({ storagePaths });
  const upload = (body, name) => fetch(`${s.baseUrl}/settings/ornaments?name=${encodeURIComponent(name)}`, { method: 'POST', body });
  try {
    assert.equal((await s.api('GET', '/settings')).body.ornaments.items.length, 0);
    assert.equal((await upload(PNG, 'chau-cay.png')).status, 201);
    const res = await upload(SVG, 'den.svg');
    const items = (await res.json()).ornaments.items;
    assert.deepEqual(items.map((entry) => entry.name), ['chau-cay', 'den']);
    assert.ok(items[1].src.endsWith('.svg'));
    assert.equal((await upload(Buffer.from('<html><script>alert(1)</script></html>'), 'x.svg')).status, 400);

    const served = await fetch(s.baseUrl.replace('/api', '') + items[1].src);
    assert.equal(served.status, 200);
    assert.match(served.headers.get('content-security-policy') ?? '', /sandbox/);

    const patched = (await s.api('PATCH', '/settings', { ornaments: { per_shelf: 3, items: [{ id: items[1].id, name: 'Đèn', enabled: false, size: 'lg' }] } })).body.ornaments;
    assert.equal(patched.per_shelf, 3);
    assert.deepEqual(patched.items.map((entry) => [entry.name, entry.enabled, entry.size]), [['Đèn', false, 'lg'], ['chau-cay', true, 'md']]);
    assert.equal(patched.items[0].src, items[1].src);
    assert.equal((await s.api('PATCH', '/settings', { ornaments: { items: [{ id: items[0].id, name: 'x', enabled: true, size: 'md', src: '/etc/passwd' }] } })).status, 400);

    const file = path.join(storagePaths.uploadsDir, 'app', 'ornaments', path.basename(items[0].src));
    assert.ok(fs.existsSync(file));
    assert.equal((await s.api('DELETE', `/settings/ornaments/${items[0].id}`)).body.ornaments.items.length, 1);
    assert.ok(!fs.existsSync(file));
    assert.equal((await s.api('DELETE', '/settings/ornaments/khong-co')).status, 404);
  } finally {
    await s.stop();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('theme tự tạo: lưu, dùng, xoá theme đang dùng thì về bảng mặc định', async () => {
  const s = await startTestServer();
  const palette = { paper: '#f5efe6', surface: '#fffaf3', ink: '#3b2f2f', moss: '#8a5a44', sage: '#d9b8a3', honey: '#e0a84f', walnut: '#6b4a2f' };
  const theme = { id: 'custom-abcd1', name: 'Cà phê sữa', light: palette, dark: { ...palette, paper: '#1d1714' } };
  try {
    assert.deepEqual((await s.api('GET', '/settings')).body.themes, []);
    assert.equal((await s.api('PATCH', '/settings', { appearance: { preset: 'custom-abcd1' } })).status, 400);
    assert.equal((await s.api('PATCH', '/settings', { themes: [{ ...theme, light: { ...palette, ink: 'red' } }] })).status, 400);
    const saved = (await s.api('PATCH', '/settings', { themes: [theme], appearance: { preset: 'custom-abcd1' } })).body;
    assert.equal(saved.appearance.preset, 'custom-abcd1');
    assert.equal(saved.themes[0].name, 'Cà phê sữa');
    const removed = (await s.api('PATCH', '/settings', { themes: [] })).body;
    assert.equal(removed.appearance.preset, 'moss');
  } finally {
    await s.stop();
  }
});
