import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import {
  APP_CONFIG_FILE,
  DB_FILE_NAME,
  ensureStorageLayout,
  getStoragePaths,
  resolveStorageSource,
  writeAppConfig,
} from '../config/storage.js';
import { migrations } from '../db/migrations/index.js';
import { ConflictError, ValidationError } from '../utils/errors.js';

const LATEST_SCHEMA = Math.max(...migrations.map((migration) => migration.version));
const CLOUD_HINTS = [
  { pattern: /google\s?drive|my drive|googledrive/i, provider: 'Google Drive' },
  { pattern: /onedrive/i, provider: 'OneDrive' },
  { pattern: /dropbox/i, provider: 'Dropbox' },
  { pattern: /icloud|mobile documents/i, provider: 'iCloud Drive' },
];

function isInside(child, parent) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function canWrite(dir) {
  try {
    fs.accessSync(dir, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

/** Đọc schema version của một DB có sẵn mà không chạy migration và không ghi gì vào file. */
function readSchemaVersion(dbFile) {
  const db = new Database(dbFile, { readonly: true, fileMustExist: true });
  try {
    return db.pragma('user_version', { simple: true });
  } finally {
    db.close();
  }
}

/**
 * Đổi thư mục lưu trữ (DB + notes + uploads):
 *   - mode "copy": sao chép dữ liệu hiện tại sang thư mục mới (thư mục mới chưa có DB). Dữ liệu cũ giữ nguyên.
 *   - mode "open": dùng DB đã có sẵn trong thư mục mới (ví dụ thư mục Google Drive đã sync từ trước).
 * Sau khi đổi, app chuyển sang DB mới ngay mà không cần khởi động lại.
 */
export function createStorageService({ getDb, storagePaths, switchStorage, writeConfig = writeAppConfig, isEnvLocked }) {
  const envLocked = () => (isEnvLocked ? isEnvLocked() : resolveStorageSource() === 'env');

  function inspect(targetPath) {
    const root = path.resolve(targetPath);
    const paths = getStoragePaths(root);
    const exists = fs.existsSync(root);
    if (exists && !fs.statSync(root).isDirectory()) {
      throw new ValidationError('Đường dẫn không phải thư mục', [{ path: ['path'], message: root }]);
    }

    let parentToCreate = root;
    while (!fs.existsSync(parentToCreate)) parentToCreate = path.dirname(parentToCreate);
    const writable = canWrite(parentToCreate);

    const hasDatabase = fs.existsSync(paths.dbFile);
    let schemaVersion = null;
    let databaseError = null;
    if (hasDatabase) {
      try {
        schemaVersion = readSchemaVersion(paths.dbFile);
      } catch (error) {
        databaseError = error.message;
      }
    }

    const cloud = CLOUD_HINTS.find((hint) => hint.pattern.test(root))?.provider ?? null;
    const warnings = [];
    if (cloud) {
      warnings.push(
        `Thư mục nằm trong ${cloud}. Chỉ mở app trên một máy tại một thời điểm và chờ ${cloud} sync xong trước khi mở trên máy khác.`,
      );
    }
    if (schemaVersion !== null && schemaVersion > LATEST_SCHEMA) {
      warnings.push(`DB ở thư mục này có schema v${schemaVersion}, mới hơn app (v${LATEST_SCHEMA}). Cần cập nhật app trước.`);
    }

    return {
      path: root,
      exists,
      writable,
      is_current: storagePaths ? path.resolve(storagePaths.root) === root : false,
      has_database: hasDatabase,
      database_file: hasDatabase ? paths.dbFile : null,
      database_schema_version: schemaVersion,
      database_error: databaseError,
      cloud_provider: cloud,
      warnings,
    };
  }

  return {
    info() {
      return {
        current: storagePaths,
        source: resolveStorageSource(),
        locked_by_env: envLocked(),
        app_config_file: APP_CONFIG_FILE,
        database_file_name: DB_FILE_NAME,
      };
    },

    inspect,

    async change({ path: targetPath, mode }) {
      if (envLocked()) {
        throw new ConflictError('Thư mục lưu trữ đang bị cố định bởi biến môi trường READING_TRACKER_STORAGE. Xoá biến đó để đổi trong app.');
      }
      if (!switchStorage) throw new ConflictError('Server hiện tại không hỗ trợ đổi thư mục lưu trữ khi đang chạy');

      const report = inspect(targetPath);
      if (report.is_current) throw new ValidationError('Đây đã là thư mục lưu trữ hiện tại', [{ path: ['path'], message: report.path }]);
      if (!report.writable) throw new ValidationError('Không có quyền ghi vào thư mục này', [{ path: ['path'], message: report.path }]);
      if (storagePaths && isInside(report.path, storagePaths.root)) {
        throw new ValidationError('Thư mục mới không được nằm bên trong thư mục lưu trữ hiện tại', [
          { path: ['path'], message: report.path },
        ]);
      }

      const nextPaths = getStoragePaths(report.path);
      if (mode === 'copy') {
        if (report.has_database) {
          throw new ConflictError('Thư mục đích đã có database. Dùng mode "open" để mở DB đó, hoặc chọn thư mục trống.');
        }
        ensureStorageLayout(nextPaths);
        // backup() của SQLite tạo bản sao nhất quán kể cả khi DB đang mở, an toàn hơn copy file thô.
        await getDb().backup(nextPaths.dbFile);
        if (storagePaths) {
          for (const dir of ['uploadsDir', 'notesDir']) {
            if (fs.existsSync(storagePaths[dir])) {
              fs.cpSync(storagePaths[dir], nextPaths[dir], { recursive: true, force: false, errorOnExist: false });
            }
          }
        }
      } else {
        if (!report.has_database) {
          throw new ValidationError('Thư mục này chưa có database để mở. Dùng mode "copy" để chuyển dữ liệu hiện tại sang.', [
            { path: ['path'], message: report.path },
          ]);
        }
        if (report.database_error) {
          throw new ValidationError(`Không mở được database: ${report.database_error}`, [{ path: ['path'], message: report.path }]);
        }
        if (report.database_schema_version > LATEST_SCHEMA) {
          throw new ConflictError(report.warnings.at(-1));
        }
        ensureStorageLayout(nextPaths);
      }

      // Mở DB mới trước, chỉ ghi config khi mở thành công để không để app ở trạng thái trỏ vào thư mục hỏng.
      const migration = switchStorage(nextPaths);
      writeConfig({ storage_path: nextPaths.root });
      return { storage: nextPaths, mode, migration, previous: storagePaths, warnings: report.warnings };
    },
  };
}
