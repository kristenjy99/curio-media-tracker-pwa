/**
 * Chuẩn bị cho đồng bộ Google Drive (Phiên 5): mỗi bản ghi người dùng cần ba thứ để gộp được
 * giữa hai thiết bị.
 *
 *  1. `sync_uid` — định danh không phụ thuộc id tự tăng. Cùng một bản ghi trên máy tính và trên
 *     điện thoại có id khác nhau, nên id không dùng để nhận ra nhau được.
 *  2. `updated_at` — mốc sửa lần cuối, để biết bên nào mới hơn khi cùng một bản ghi bị sửa hai nơi.
 *  3. Dấu đã xoá (`sync_deletions`) — nếu không ghi lại việc xoá, lần gộp sau sẽ thấy bên kia còn
 *     bản ghi đó và coi như bản ghi mới, làm thứ đã xoá sống lại.
 *
 * Migration này CHỈ dựng sẵn ba thứ đó, chưa quyết định cách gộp. Quy tắc gộp (gộp cả quyển sách
 * như một đơn vị, hay gộp từng dòng) được chốt ở Phiên 5 và không cần đổi schema thêm lần nữa.
 *
 * Cách làm trong SQLite:
 *  - `ALTER TABLE ... ADD COLUMN` không nhận giá trị mặc định động, nên cột mới được thêm ở dạng
 *    cho phép NULL, rồi điền dữ liệu cho các dòng đã có bằng UPDATE.
 *  - Bản ghi tạo mới sau này được trigger AFTER INSERT điền `sync_uid`, nên tầng model không phải
 *    sửa gì. Tương tự, `updated_at` của các bảng mà code chưa tự ghi được trigger AFTER UPDATE lo.
 *    SQLite mặc định tắt recursive_triggers nên UPDATE trong trigger không tự gọi lại chính nó.
 *
 * Không đồng bộ: `obsidian_sync_config` (đường dẫn vault là của riêng từng máy), `sync_tombstones`
 * (của riêng sync Obsidian) và chính `sync_deletions`.
 */

const UUID = `lower(
  substr(hex(randomblob(4)), 1) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' ||
  substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6))
)`;

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";

// Bảng dữ liệu người dùng cần sync_uid. items đã có từ migration 002.
const UID_TABLES = [
  'library_cards',
  'reading_logs',
  'reading_notes',
  'goals',
  'challenges',
  'challenge_slots',
  'brackets',
  'monthly_favorites',
  'series_positions',
  'obsidian_templates',
];

// Bảng chưa có updated_at. Code hiện tại không tự ghi mốc này nên cần trigger bơm hộ.
const TOUCH_TABLES = ['challenges', 'challenge_slots', 'brackets', 'monthly_favorites', 'series_positions', 'app_settings'];

// Bảng cần ghi dấu khi bị xoá. app_settings dùng `key` làm định danh nên ghi key thay cho sync_uid.
const DELETE_TABLES = ['items', ...UID_TABLES];

export default {
  version: 15,
  name: 'sync_identity',
  up(db) {
    db.exec(`
      -- Dấu đã xoá dùng cho đồng bộ Google Drive. Tách khỏi sync_tombstones vì sync Obsidian
      -- đọc rồi xoá sạch bảng đó sau mỗi lượt, còn dấu cho Drive phải sống tới khi mọi thiết bị đã nhận.
      CREATE TABLE sync_deletions (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        table_name TEXT NOT NULL,
        sync_uid   TEXT NOT NULL,
        deleted_at TEXT NOT NULL DEFAULT (${NOW})
      );
      CREATE INDEX idx_sync_deletions_table ON sync_deletions(table_name, sync_uid);
    `);

    for (const table of UID_TABLES) {
      db.exec(`
        ALTER TABLE ${table} ADD COLUMN sync_uid TEXT;
        UPDATE ${table} SET sync_uid = ${UUID} WHERE sync_uid IS NULL;
        CREATE UNIQUE INDEX idx_${table}_sync_uid ON ${table}(sync_uid);
        CREATE TRIGGER trg_${table}_sync_uid AFTER INSERT ON ${table}
        WHEN NEW.sync_uid IS NULL
        BEGIN
          UPDATE ${table} SET sync_uid = ${UUID} WHERE rowid = NEW.rowid;
        END;
      `);
    }

    for (const table of TOUCH_TABLES) {
      db.exec(`
        ALTER TABLE ${table} ADD COLUMN updated_at TEXT;
        UPDATE ${table} SET updated_at = ${NOW} WHERE updated_at IS NULL;
        CREATE TRIGGER trg_${table}_touch AFTER UPDATE ON ${table}
        BEGIN
          UPDATE ${table} SET updated_at = ${NOW} WHERE rowid = NEW.rowid;
        END;
      `);
    }

    for (const table of DELETE_TABLES) {
      db.exec(`
        CREATE TRIGGER trg_${table}_deleted AFTER DELETE ON ${table}
        WHEN OLD.sync_uid IS NOT NULL
        BEGIN
          INSERT INTO sync_deletions (table_name, sync_uid) VALUES ('${table}', OLD.sync_uid);
        END;
      `);
    }

    db.exec(`
      CREATE TRIGGER trg_app_settings_deleted AFTER DELETE ON app_settings
      BEGIN
        INSERT INTO sync_deletions (table_name, sync_uid) VALUES ('app_settings', OLD.key);
      END;
    `);
  },
};
