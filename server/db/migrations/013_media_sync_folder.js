/** Thư mục chứa note media trong vault, tính từ gốc vault. Chuỗi rỗng = không sync media. */
export default {
  version: 13,
  name: 'media_sync_folder',
  up(db) {
    db.exec("ALTER TABLE obsidian_sync_config ADD COLUMN media_subfolder TEXT NOT NULL DEFAULT 'Media Tracker';");
  },
};
