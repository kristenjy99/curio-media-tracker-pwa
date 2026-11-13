export default {
  version: 6,
  name: 'category_folders',
  up: `
    -- Khi sync, đặt mỗi sách vào thư mục con theo thể loại (Fiction/, Fanfiction/...). Mặc định bật.
    ALTER TABLE obsidian_sync_config ADD COLUMN category_folders INTEGER NOT NULL DEFAULT 1 CHECK (category_folders IN (0, 1));
    -- Tên thư mục cho từng thể loại; thể loại không có trong đây dùng tên mặc định.
    ALTER TABLE obsidian_sync_config ADD COLUMN folder_names TEXT NOT NULL DEFAULT '{}'
      CHECK (json_valid(folder_names) AND json_type(folder_names) = 'object');
  `,
};
