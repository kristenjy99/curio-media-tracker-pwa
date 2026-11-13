/**
 * Thứ tự các phần trong một series (sách và media dùng chung). Series nhận diện theo tên đã chuẩn hoá
 * (`series_key` = tên viết thường, bỏ khoảng trắng thừa). Item không có dòng ở đây thì xếp sau, theo tên.
 */
export default {
  version: 12,
  name: 'series_positions',
  up(db) {
    db.exec(`
      CREATE TABLE series_positions (
        series_key TEXT    NOT NULL,
        source     TEXT    NOT NULL CHECK (source IN ('book', 'media')),
        item_id    INTEGER NOT NULL,
        position   INTEGER NOT NULL,
        PRIMARY KEY (series_key, source, item_id)
      );
    `);
  },
};
