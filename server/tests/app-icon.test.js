import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { ensureStorageLayout, getStoragePaths } from '../config/storage.js';
import { CUSTOM_ICON_COPY, pngToIco } from '../services/desktopShortcut.js';
import { startTestServer } from './helpers.js';

// PNG tối thiểu: chữ ký + phần IHDR 256×256.
const ihdr = Buffer.alloc(25);
ihdr.writeUInt32BE(13, 0);
ihdr.write('IHDR', 4);
ihdr.writeUInt32BE(256, 8);
ihdr.writeUInt32BE(256, 12);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), ihdr, Buffer.alloc(16)]);

test('pngToIco bọc PNG thành ICO một ảnh 256×256', () => {
  const ico = pngToIco(PNG);
  assert.equal(ico.readUInt16LE(2), 1);
  assert.equal(ico.readUInt16LE(4), 1);
  assert.equal(ico.readUInt8(6), 0);
  assert.equal(ico.readUInt32LE(6 + 8), PNG.length);
  assert.equal(ico.readUInt32LE(6 + 12), 22);
  assert.ok(ico.subarray(22).equals(PNG));
});

test('biểu tượng app: chỉ nhận PNG, lưu PNG + ICO, xoá file cũ, trả về mặc định', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-icon-'));
  const storagePaths = getStoragePaths(root);
  ensureStorageLayout(storagePaths);
  const s = await startTestServer({ storagePaths });
  const upload = (body) => fetch(`${s.baseUrl}/settings/app-icon`, { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body });
  const hadCopy = fs.existsSync(CUSTOM_ICON_COPY);
  try {
    assert.equal((await s.api('GET', '/settings')).body.general.app_icon, null);
    assert.equal((await upload(Buffer.from('GIF89a......'))).status, 400);

    const first = await (await upload(PNG)).json();
    assert.match(first.general.app_icon, /^\/media\/app\/app-icon-.+\.png$/);
    assert.match(first.general.app_icon_ico, /\.ico$/);
    assert.ok(first.shortcut.status);
    const appDir = path.join(storagePaths.uploadsDir, 'app');
    const firstPng = path.join(appDir, path.basename(first.general.app_icon));
    assert.ok(fs.existsSync(firstPng));
    assert.ok(fs.existsSync(CUSTOM_ICON_COPY));

    // đổi tên app không làm mất biểu tượng
    await s.api('PATCH', '/settings', { general: { app_name: 'Kệ' } });
    assert.equal((await s.api('GET', '/settings')).body.general.app_icon, first.general.app_icon);

    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await (await upload(PNG)).json();
    assert.notEqual(second.general.app_icon, first.general.app_icon);
    assert.ok(!fs.existsSync(firstPng));

    const reset = (await s.api('DELETE', '/settings/app-icon')).body;
    assert.equal(reset.general.app_icon, null);
    assert.ok(!fs.existsSync(path.join(appDir, path.basename(second.general.app_icon))));
    assert.ok(!fs.existsSync(CUSTOM_ICON_COPY));

    const shortcut = (await s.api('POST', '/system/desktop-shortcut')).body.shortcut;
    assert.equal(shortcut.status, process.platform === 'win32' ? shortcut.status : 'unsupported');
  } finally {
    await s.stop();
    fs.rmSync(root, { recursive: true, force: true });
    if (!hadCopy) fs.rmSync(CUSTOM_ICON_COPY, { force: true });
  }
});
