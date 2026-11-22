import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildMultiSizeIco, DEFAULT_ICON, ICON_SIZES, shortcutFileName, syncDesktopShortcut, writeLocalIcon } from '../services/desktopShortcut.js';
import { createSettingsService } from '../services/settingsService.js';
import { decodePng, encodePng, resizeSquare } from '../utils/pngImage.js';
import { startTestServer } from './helpers.js';

/** Patch 6.2: biểu tượng lối tắt Desktop nhiều cỡ, nằm trên ổ máy; lối tắt đổi tên theo tên app. */

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures-png');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function readIcoEntries(ico) {
  const count = ico.readUInt16LE(4);
  return Array.from({ length: count }, (_, index) => {
    const at = 6 + index * 16;
    const size = ico.readUInt32LE(at + 8);
    const offset = ico.readUInt32LE(at + 12);
    return { width: ico[at] || 256, height: ico[at + 1] || 256, png: ico.subarray(offset, offset + size) };
  });
}

test('decodePng đọc đúng điểm ảnh các loại PNG (đối chiếu với Pillow)', () => {
  for (const name of ['rgba', 'rgb', 'gray', 'gray-alpha', 'palette', 'gray16', 'gray1']) {
    const image = decodePng(fs.readFileSync(path.join(FIXTURES, `${name}.png`)));
    assert.ok(image, name);
    assert.deepEqual([image.width, image.height], [21, 13], name);
    assert.ok(Buffer.from(image.data).equals(fs.readFileSync(path.join(FIXTURES, `${name}.rgba`))), `điểm ảnh khớp: ${name}`);
  }
  assert.equal(decodePng(Buffer.from('not a png')), null);
});

test('encodePng + resizeSquare: giữ tỉ lệ, nền trong suốt, giải mã lại được', () => {
  const image = decodePng(fs.readFileSync(path.join(FIXTURES, 'rgb.png')));
  const square = resizeSquare(image, 32);
  const again = decodePng(encodePng(square));
  assert.deepEqual([again.width, again.height], [32, 32]);
  assert.ok(Buffer.from(again.data).equals(Buffer.from(square.data)));
  assert.equal(again.data[3], 0, 'góc trên trái là phần đệm trong suốt (ảnh 21×13 không vuông)');
  assert.equal(again.data[(16 * 32 + 16) * 4 + 3], 255, 'giữa ảnh đục');
});

test('buildMultiSizeIco: ICO 7 cỡ 16…256, mỗi mục là PNG đúng cỡ; PNG lạ thì bọc nguyên ảnh', () => {
  const ico = buildMultiSizeIco(fs.readFileSync(path.join(ROOT, 'assets', 'ke-sach.png')));
  const entries = readIcoEntries(ico);
  assert.deepEqual(entries.map((entry) => entry.width), ICON_SIZES);
  for (const entry of entries) {
    const image = decodePng(entry.png);
    assert.deepEqual([image.width, image.height], [entry.width, entry.width]);
  }
  const broken = Buffer.concat([fs.readFileSync(path.join(FIXTURES, 'rgba.png')).subarray(0, 33), Buffer.alloc(8)]);
  assert.equal(readIcoEntries(buildMultiSizeIco(broken)).length, 1);
});

test('shortcutFileName: tên app thành tên file hợp lệ trên Windows', () => {
  assert.equal(shortcutFileName('Kệ sách của Vy'), 'Kệ sách của Vy.lnk');
  assert.equal(shortcutFileName('  Sách: "đọc"/xem?  '), 'Sách đọc xem.lnk');
  assert.equal(shortcutFileName('Tủ sách...'), 'Tủ sách.lnk');
  assert.equal(shortcutFileName('CON'), 'CON app.lnk');
  assert.equal(shortcutFileName('***'), 'Media Tracker.lnk');
  assert.equal(shortcutFileName(''), 'Media Tracker.lnk');
});

test('writeLocalIcon: tên file theo nội dung, xoá icon cũ của app, không đụng file khác', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-icons-'));
  fs.writeFileSync(path.join(dir, 'khac.ico'), 'x');
  const first = writeLocalIcon(Buffer.from('icon-1'), dir);
  assert.equal(writeLocalIcon(Buffer.from('icon-1'), dir), first);
  const second = writeLocalIcon(Buffer.from('icon-2'), dir);
  assert.notEqual(second, first);
  assert.deepEqual(fs.readdirSync(dir).sort(), [path.basename(second), 'khac.ico'].sort());
});

test('syncDesktopShortcut: truyền tên lối tắt theo tên app, icon nhiều cỡ ở thư mục máy; đọc kết quả PowerShell', async () => {
  const iconDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-icons-'));
  const calls = [];
  const run = async (script, env) => {
    calls.push(env);
    return { ok: true, output: `renamed|C:\\Users\\Vy\\Desktop\\${env.RT_NAME}` };
  };
  const png = fs.readFileSync(path.join(ROOT, 'assets', 'ke-sach.png'));
  const result = await syncDesktopShortcut({ appName: 'Tủ sách: Vy', iconPng: png }, { platform: 'win32', iconDir, run });
  assert.equal(result.status, 'renamed');
  assert.equal(result.path, 'C:\\Users\\Vy\\Desktop\\Tủ sách Vy.lnk');
  assert.equal(calls[0].RT_NAME, 'Tủ sách Vy.lnk');
  assert.equal(calls[0].RT_CREATE, '0');
  assert.equal(path.dirname(calls[0].RT_ICON), iconDir);
  assert.equal(readIcoEntries(fs.readFileSync(calls[0].RT_ICON)).length, ICON_SIZES.length);
  assert.ok(calls[0].RT_TARGET.endsWith('mo-app.bat'));

  // Không có ảnh riêng: dùng ICO mặc định, cũng chép sang thư mục máy.
  await syncDesktopShortcut({ appName: 'Media Tracker', create: true }, { platform: 'win32', iconDir, run });
  assert.ok(fs.readFileSync(calls[1].RT_ICON).equals(fs.readFileSync(DEFAULT_ICON)));
  assert.equal(calls[1].RT_CREATE, '1');

  const failed = await syncDesktopShortcut({ appName: 'X' }, { platform: 'win32', iconDir, run: async () => ({ ok: false, message: 'Access denied' }) });
  assert.deepEqual(failed, { status: 'error', message: 'Access denied' });
  assert.deepEqual(await syncDesktopShortcut({ appName: 'X' }, { platform: 'linux', iconDir, run }), { status: 'unsupported' });
});

test('settings: đổi tên app thì đồng bộ lối tắt (không tạo mới); tên không đổi thì không gọi', async () => {
  const s = await startTestServer();
  try {
    const calls = [];
    const desktop = { syncShortcut: async (input) => (calls.push(input), { status: 'renamed' }), saveIconCopy: async () => {}, pngToIco: buildMultiSizeIco };
    const settings = createSettingsService({ db: s.db, fileStore: null, desktop });
    const updated = await settings.update({ general: { app_name: 'Tủ sách của Vy' } });
    assert.equal(updated.general.app_name, 'Tủ sách của Vy');
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.deepEqual(calls, [{ appName: 'Tủ sách của Vy', iconPng: null, create: false }]);

    await settings.update({ general: { app_name: 'Tủ sách của Vy' } });
    await settings.update({ appearance: { preset: 'paper' } }).catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(calls.length, 1);

    assert.deepEqual(await settings.desktopShortcut(), { shortcut: { status: 'renamed' } });
    assert.equal(calls[1].create, true);
    await settings.syncDesktopShortcut();
    assert.equal(calls[2].create, false);
  } finally {
    await s.stop();
  }
});
