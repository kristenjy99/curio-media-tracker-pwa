export default {
  version: 3,
  name: 'obsidian_templates',
  up: `
    -- Giá trị của các property tự định nghĩa trong template (ví dụ Series, FIN?, Platform, Link).
    -- Xoá property khỏi template không xoá dữ liệu ở đây.
    ALTER TABLE items ADD COLUMN custom_fields TEXT NOT NULL DEFAULT '{}'
      CHECK (json_valid(custom_fields) AND json_type(custom_fields) = 'object');

    -- Template theo từng thể loại: danh sách property frontmatter + phần thân mẫu.
    -- Thể loại chưa có dòng ở đây thì dùng template mặc định trong code.
    CREATE TABLE obsidian_templates (
      category       TEXT PRIMARY KEY CHECK (category IN ('Fiction','Nonfiction','Fanfiction','Visual/Comics')),
      properties     TEXT NOT NULL CHECK (json_valid(properties) AND json_type(properties) = 'array'),
      body_template  TEXT NOT NULL DEFAULT '',
      updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    -- app_to_obsidian: app là nguồn duy nhất, chỉ ghi ra vault. two_way: nhận cả thay đổi từ Obsidian.
    ALTER TABLE obsidian_sync_config ADD COLUMN sync_direction TEXT NOT NULL DEFAULT 'app_to_obsidian'
      CHECK (sync_direction IN ('app_to_obsidian', 'two_way'));
  `,
};
