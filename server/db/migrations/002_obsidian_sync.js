export default {
  version: 2,
  name: 'obsidian_sync',
  up: `
    -- Định danh ổn định của item trong file .md (frontmatter "rt_id"), không phụ thuộc id tự tăng của DB.
    ALTER TABLE items ADD COLUMN sync_uid TEXT;
    UPDATE items SET sync_uid = lower(
      substr(hex(randomblob(4)), 1) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' ||
      substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6))
    ) WHERE sync_uid IS NULL;
    CREATE UNIQUE INDEX idx_items_sync_uid ON items(sync_uid);

    -- Hash nội dung ở lần sync gần nhất, dùng cho so sánh 3 chiều (DB hiện tại / file hiện tại / lần sync trước).
    ALTER TABLE items ADD COLUMN sync_db_hash TEXT;
    ALTER TABLE items ADD COLUMN sync_file_hash TEXT;

    -- Các thuộc tính frontmatter mà app không quản lý (ví dụ cssclasses, aliases); giữ lại để ghi trả nguyên vẹn.
    ALTER TABLE items ADD COLUMN obsidian_extra TEXT NOT NULL DEFAULT '{}'
      CHECK (json_valid(obsidian_extra) AND json_type(obsidian_extra) = 'object');

    ALTER TABLE obsidian_sync_config ADD COLUMN vault_subfolder TEXT NOT NULL DEFAULT 'Reading Tracker';
    ALTER TABLE obsidian_sync_config ADD COLUMN field_map TEXT NOT NULL DEFAULT '{}'
      CHECK (json_valid(field_map) AND json_type(field_map) = 'object');

    -- Item bị xoá trong app: lần sync sau sẽ chuyển file tương ứng vào thư mục .trash của vault.
    CREATE TABLE sync_tombstones (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      obsidian_path  TEXT NOT NULL,
      sync_uid       TEXT,
      deleted_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE TRIGGER trg_items_tombstone AFTER DELETE ON items
    WHEN OLD.obsidian_path IS NOT NULL
    BEGIN
      INSERT INTO sync_tombstones (obsidian_path, sync_uid) VALUES (OLD.obsidian_path, OLD.sync_uid);
    END;
  `,
};
