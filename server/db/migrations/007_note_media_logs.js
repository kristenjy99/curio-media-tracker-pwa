export default {
  version: 7,
  name: 'note_media_logs',
  up: `
    -- 1. Gộp trùng lặp: moodboard, playlist, file đính kèm chỉ còn nằm trong reading_notes.
    --    Tạo note cho sách có dữ liệu cũ ở items nhưng chưa có note.
    INSERT INTO reading_notes (item_id)
    SELECT i.id FROM items i
    WHERE NOT EXISTS (SELECT 1 FROM reading_notes n WHERE n.item_id = i.id)
      AND (json_array_length(i.moodboard_urls) > 0
           OR (i.playlist_url IS NOT NULL AND trim(i.playlist_url) <> '')
           OR json_array_length(i.file_links) > 0);

    -- moodboard_urls (mảng chuỗi) -> moodboard_images ({ src }), giữ ảnh đã có trong note, bỏ ảnh trùng.
    UPDATE reading_notes
    SET moodboard_images = (
      SELECT json_group_array(json(entry)) FROM (
        SELECT value AS entry FROM json_each(reading_notes.moodboard_images)
        UNION ALL
        SELECT json_object('src', u.value) FROM items i, json_each(i.moodboard_urls) u
        WHERE i.id = reading_notes.item_id
          AND NOT EXISTS (
            SELECT 1 FROM json_each(reading_notes.moodboard_images) m WHERE json_extract(m.value, '$.src') = u.value
          )
      )
    )
    WHERE item_id IN (SELECT id FROM items WHERE json_array_length(moodboard_urls) > 0);

    -- playlist_url -> phần tử đầu của playlist_links (nếu chưa có link đó).
    UPDATE reading_notes
    SET playlist_links = (
      SELECT json_group_array(json(entry)) FROM (
        SELECT json_object('url', i.playlist_url) AS entry FROM items i
        WHERE i.id = reading_notes.item_id
          AND NOT EXISTS (
            SELECT 1 FROM json_each(reading_notes.playlist_links) p WHERE json_extract(p.value, '$.url') = i.playlist_url
          )
        UNION ALL
        SELECT value FROM json_each(reading_notes.playlist_links)
      )
    )
    WHERE item_id IN (SELECT id FROM items WHERE playlist_url IS NOT NULL AND trim(playlist_url) <> '');

    -- file_links ({ name, url }) -> attached_files ({ name, src }).
    UPDATE reading_notes
    SET attached_files = (
      SELECT json_group_array(json(entry)) FROM (
        SELECT value AS entry FROM json_each(reading_notes.attached_files)
        UNION ALL
        SELECT json_object('name', json_extract(f.value, '$.name'), 'src', json_extract(f.value, '$.url'))
        FROM items i, json_each(i.file_links) f
        WHERE i.id = reading_notes.item_id
      )
    )
    WHERE item_id IN (SELECT id FROM items WHERE json_array_length(file_links) > 0);

    ALTER TABLE items DROP COLUMN moodboard_urls;
    ALTER TABLE items DROP COLUMN playlist_url;
    ALTER TABLE items DROP COLUMN file_links;

    -- 2. Thư mục ảnh của sách trong vault (<thư mục sync>/_attachments/<tên>), chọn ở lần sync đầu có ảnh
    --    và giữ cố định sau đó, giống tên file note.
    ALTER TABLE items ADD COLUMN obsidian_media_dir TEXT;
    ALTER TABLE sync_tombstones ADD COLUMN obsidian_media_dir TEXT;
    DROP TRIGGER trg_items_tombstone;
    CREATE TRIGGER trg_items_tombstone AFTER DELETE ON items
    WHEN OLD.obsidian_path IS NOT NULL OR OLD.obsidian_media_dir IS NOT NULL
    BEGIN
      INSERT INTO sync_tombstones (obsidian_path, sync_uid, obsidian_media_dir)
      VALUES (COALESCE(OLD.obsidian_path, ''), OLD.sync_uid, OLD.obsidian_media_dir);
    END;

    -- 3. Log đọc ghi lại số đơn vị đã cộng vào tiến độ, để sửa/xoá log thì trả lại đúng phần đó.
    ALTER TABLE reading_logs ADD COLUMN progress_applied INTEGER NOT NULL DEFAULT 0 CHECK (progress_applied >= 0);
    ALTER TABLE reading_logs ADD COLUMN updated_at TEXT;
  `,
};
