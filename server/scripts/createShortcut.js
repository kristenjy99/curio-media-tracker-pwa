/**
 * Tạo hoặc sửa lối tắt Desktop (dùng bởi tao-shortcut-desktop.bat). Đọc tên app và biểu tượng từ DB ở chế độ
 * chỉ đọc (không chạy migration, an toàn khi app đang mở), rồi dùng chung logic với nút "Tạo lối tắt Desktop".
 */
import '../config/loadEnv.js';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { getStoragePaths } from '../config/storage.js';
import { syncDesktopShortcut } from '../services/desktopShortcut.js';

function readGeneral(dbFile) {
  if (!fs.existsSync(dbFile)) return {};
  let db;
  try {
    db = new Database(dbFile, { readonly: true, fileMustExist: true });
    const raw = db.prepare("SELECT value FROM app_settings WHERE key = 'general'").pluck().get();
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  } finally {
    db?.close();
  }
}

const paths = getStoragePaths();
const general = readGeneral(paths.dbFile);
const appName = general.app_name || 'Media Tracker';
let iconPng = null;
const prefix = '/media/app/';
if (typeof general.app_icon === 'string' && general.app_icon.startsWith(prefix)) {
  const file = path.join(paths.uploadsDir, 'app', ...general.app_icon.slice(prefix.length).split('/').map(decodeURIComponent));
  if (fs.existsSync(file)) iconPng = fs.readFileSync(file);
}

const result = await syncDesktopShortcut({ appName, iconPng, create: true });
const messages = {
  created: `Đã tạo lối tắt "${appName}" trên Desktop.`,
  renamed: `Đã đổi tên lối tắt thành "${appName}" và cập nhật biểu tượng.`,
  updated: 'Đã cập nhật biểu tượng của lối tắt.',
  unchanged: 'Lối tắt trên Desktop đã đúng tên và biểu tượng.',
  conflict: `Trên Desktop đã có file khác tên "${appName}". Đổi tên hoặc xoá file đó rồi chạy lại.`,
  unsupported: 'Chỉ chạy được trên Windows.',
};
console.log(messages[result.status] ?? `[LỖI] Không tạo được lối tắt: ${result.message ?? result.status}`);
if (result.path) console.log(`Lối tắt: ${result.path}`);
if (result.icon) console.log(`Biểu tượng: ${result.icon}`);
process.exitCode = result.status === 'error' || result.status === 'conflict' ? 1 : 0;
