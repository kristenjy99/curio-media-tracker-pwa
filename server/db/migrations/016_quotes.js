/**
 * Quotes & highlights của sách (patch 6).
 *
 * Mỗi dòng là một trích đoạn gắn với một quyển sách: `kind` = 'quote' (câu trích dẫn) hoặc
 * 'highlight' (đoạn đánh dấu khi đọc). `location` là chữ tự do (trang, chương, % ...) vì đơn vị đọc
 * của từng sách khác nhau. Xoá sách thì xoá luôn quotes của sách đó (ON DELETE CASCADE).
 *
 * Đồng bộ Google Drive: quotes là dòng con của đơn vị sách (giống reading_logs), nên cần `sync_uid`
 * (trigger AFTER INSERT điền hộ) và trigger AFTER DELETE ghi dấu vào `sync_deletions` như migration 015.
 * `updated_at` do model tự ghi khi sửa.
 */

const UUID = `lower(
  substr(hex(randomblob(4)), 1) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' ||
  substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6))
)`;

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";

export default {
  version: 16,
  name: 'quotes',
  up(db) {
    db.exec(`
      CREATE TABLE quotes (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        item_id     INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
        kind        TEXT    NOT NULL DEFAULT 'quote' CHECK (kind IN ('quote', 'highlight')),
        content     TEXT    NOT NULL CHECK (length(trim(content)) > 0),
        note        TEXT,
        location    TEXT,
        sync_uid    TEXT,
        created_at  TEXT    NOT NULL DEFAULT (${NOW}),
        updated_at  TEXT    NOT NULL DEFAULT (${NOW})
      );
      CREATE INDEX idx_quotes_item ON quotes(item_id, created_at);
      CREATE UNIQUE INDEX idx_quotes_sync_uid ON quotes(sync_uid);

      CREATE TRIGGER trg_quotes_sync_uid AFTER INSERT ON quotes
      WHEN NEW.sync_uid IS NULL
      BEGIN
        UPDATE quotes SET sync_uid = ${UUID} WHERE rowid = NEW.rowid;
      END;

      CREATE TRIGGER trg_quotes_deleted AFTER DELETE ON quotes
      WHEN OLD.sync_uid IS NOT NULL
      BEGIN
        INSERT INTO sync_deletions (table_name, sync_uid) VALUES ('quotes', OLD.sync_uid);
      END;
    `);
  },
};
