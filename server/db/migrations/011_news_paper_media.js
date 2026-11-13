/**
 * Thêm loại ấn phẩm News và Research Paper: SQLite không sửa được CHECK bằng ALTER nên cập nhật câu lệnh
 * CREATE TABLE trong sqlite_master (dữ liệu giữ nguyên). better-sqlite3 bật chế độ defensive mặc định,
 * chế độ này chặn sửa sqlite_master, nên phải bật unsafeMode tạm thời trong migration này.
 */
export default {
  version: 11,
  name: 'news_paper_media',
  up(db) {
    const version = db.pragma('schema_version', { simple: true });
    db.unsafeMode(true);
    try {
      db.pragma('writable_schema = ON');
      db.prepare(
        `UPDATE sqlite_master SET sql = replace(sql, '''Webtoon'',''Other''', '''Webtoon'',''Other'',''News'',''Research Paper''') WHERE type = 'table' AND name = 'items'`,
      ).run();
      db.pragma(`schema_version = ${version + 1}`);
    } finally {
      db.pragma('writable_schema = OFF');
      db.unsafeMode(false);
    }
  },
};
