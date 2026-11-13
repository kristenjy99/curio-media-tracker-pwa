import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from './env.js';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// READING_TRACKER_CONFIG_DIR cho phép test/nhiều profile dùng file cấu hình riêng thay vì ~/.reading-tracker.
export const APP_CONFIG_DIR = process.env.READING_TRACKER_CONFIG_DIR?.trim() || path.join(os.homedir(), '.reading-tracker');
export const APP_CONFIG_FILE = path.join(APP_CONFIG_DIR, 'config.json');
export const DEFAULT_STORAGE_DIR = path.join(PROJECT_ROOT, 'data');
export const DB_FILE_NAME = 'reading-tracker.sqlite';
export const MEDIA_DB_FILE_NAME = 'media-tracker.sqlite';

/**
 * Cấu hình bootstrap nằm ngoài thư mục storage vì server cần biết storage ở đâu
 * trước khi mở được DB. Phase 2 sẽ ghi vào file này khi người dùng đổi thư mục.
 */
export function readAppConfig() {
  try {
    const raw = fs.readFileSync(APP_CONFIG_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw new Error(`Không đọc được ${APP_CONFIG_FILE}: ${error.message}`);
  }
}

export function writeAppConfig(patch) {
  const next = { ...readAppConfig(), ...patch };
  fs.mkdirSync(APP_CONFIG_DIR, { recursive: true });
  const tmpFile = `${APP_CONFIG_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(next, null, 2), 'utf8');
  fs.renameSync(tmpFile, APP_CONFIG_FILE);
  return next;
}

/** Thứ tự ưu tiên: biến môi trường > ~/.reading-tracker/config.json > ./data */
export function resolveStorageRoot() {
  const configured = env.storageOverride ?? readAppConfig().storage_path ?? DEFAULT_STORAGE_DIR;
  return path.resolve(configured);
}

export function resolveStorageSource() {
  if (env.storageOverride) return 'env';
  if (readAppConfig().storage_path) return 'config';
  return 'default';
}

export function getStoragePaths(storageRoot = resolveStorageRoot()) {
  return Object.freeze({
    root: storageRoot,
    dbDir: path.join(storageRoot, 'db'),
    dbFile: path.join(storageRoot, 'db', DB_FILE_NAME),
    notesDir: path.join(storageRoot, 'notes'),
    uploadsDir: path.join(storageRoot, 'uploads'),
    // Dữ liệu Media nằm trong thư mục riêng, tách hẳn DB và uploads của sách.
    mediaDir: path.join(storageRoot, 'media'),
    mediaDbDir: path.join(storageRoot, 'media', 'db'),
    mediaDbFile: path.join(storageRoot, 'media', 'db', MEDIA_DB_FILE_NAME),
    mediaUploadsDir: path.join(storageRoot, 'media', 'uploads'),
  });
}

export function ensureStorageLayout(paths) {
  for (const dir of [paths.root, paths.dbDir, paths.notesDir, paths.uploadsDir, paths.mediaDbDir, paths.mediaUploadsDir]) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.accessSync(paths.root, fs.constants.R_OK | fs.constants.W_OK);
  return paths;
}
