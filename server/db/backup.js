import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Sao lưu tự động trước khi nâng schema.
 *
 * Gọi ngay trước khi mở DB để migrate. Nếu file DB đã tồn tại và schema của nó thấp hơn bản mới
 * nhất mà app biết, hàm này tạo một bản sao đầy đủ rồi mới để migration chạy. Lý do: migration
 * sửa cấu trúc dữ liệu thật, nếu có sai sót thì không còn đường lùi; và vì file DB có thể nằm
 * trong thư mục Google Drive nên không thể trông vào bản sao của dịch vụ sync.
 *
 * Dùng `VACUUM INTO` thay vì copy file thô: câu này tạo bản sao nhất quán ở mức SQLite, gộp cả
 * phần chưa checkpoint, và chạy đồng bộ nên đặt được vào luồng mở DB (khác với `db.backup()` là async).
 *
 * Bản sao nằm ở `<thư mục cha của thư mục db>/backups/truoc-khi-migrate-v<từ>-v<đến>-<thời điểm>.sqlite`,
 * ví dụ `<storage>/backups/...` cho DB sách và `<storage>/media/backups/...` cho DB media.
 * App không bao giờ tự xoá thư mục này; người dùng tự dọn khi chắc chắn.
 */

const pad = (value) => String(value).padStart(2, '0');

/** Thời điểm theo giờ địa phương, dạng 20261111-224500. */
export function backupStamp(now = new Date()) {
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

/** Schema version hiện có trong file DB, không chạy migration và không ghi gì vào file. */
export function readSchemaVersion(dbFile) {
  const db = new Database(dbFile, { readonly: true, fileMustExist: true });
  try {
    return db.pragma('user_version', { simple: true });
  } finally {
    db.close();
  }
}

/**
 * Trả về đường dẫn bản sao lưu đã tạo, hoặc null khi không cần sao lưu
 * (DB in-memory, file chưa tồn tại, hoặc schema đã ở bản mới nhất).
 * Lỗi khi sao lưu được ném ra để chặn migration: thà không mở được DB còn hơn migrate mà không có bản lùi.
 */
export function backupBeforeMigrate(filename, migrations, { now = new Date() } = {}) {
  if (!filename || filename === ':memory:' || !fs.existsSync(filename)) return null;

  const latest = migrations.reduce((max, migration) => Math.max(max, migration.version), 0);
  let current;
  try {
    current = readSchemaVersion(filename);
  } catch {
    // File hỏng hoặc không đọc được: để phần mở DB bên dưới báo lỗi đúng nguyên nhân.
    return null;
  }
  if (current >= latest) return null;

  const backupDir = path.join(path.dirname(path.dirname(path.resolve(filename))), 'backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const base = path.basename(filename, path.extname(filename));
  const target = path.join(backupDir, `truoc-khi-migrate-v${current}-v${latest}-${backupStamp(now)}-${base}.sqlite`);

  const source = new Database(filename, { readonly: true, fileMustExist: true });
  try {
    // VACUUM INTO từ chối ghi vào file đã tồn tại, nên tên có cả giây là đủ để không đụng nhau.
    source.exec(`VACUUM INTO ${quote(target)}`);
  } finally {
    source.close();
  }
  return target;
}

/**
 * Xuất toàn bộ DB ra mảng byte để người dùng lưu lại (route POST /data/export).
 *
 * Dùng VACUUM INTO ra một file tạm rồi đọc lên, không copy file đang mở: bản sao nhất quán ở mức
 * SQLite, gộp cả phần chưa checkpoint. DB in-memory cũng xuất được vì VACUUM INTO đọc từ connection
 * đang mở chứ không đọc file nguồn.
 */
export function exportDatabaseBytes(raw) {
  const target = path.join(os.tmpdir(), `rt-export-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}.sqlite`);
  try {
    raw.exec(`VACUUM INTO ${quote(target)}`);
    return fs.readFileSync(target);
  } finally {
    fs.rmSync(target, { force: true });
  }
}

/** Chuỗi literal cho SQL (VACUUM INTO không nhận tham số ràng buộc). */
function quote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}
