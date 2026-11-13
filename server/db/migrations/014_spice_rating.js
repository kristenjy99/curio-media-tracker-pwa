/** Độ spicy (0–5, bước 0,5) cho sách có tag smut; sách khác không hiển thị trường này. */
export default {
  version: 14,
  name: 'spice_rating',
  up(db) {
    db.exec('ALTER TABLE items ADD COLUMN spice_rating REAL CHECK (spice_rating IS NULL OR (spice_rating >= 0 AND spice_rating <= 5));');
  },
};
