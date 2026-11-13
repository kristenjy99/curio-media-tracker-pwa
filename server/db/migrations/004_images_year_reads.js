export default {
  version: 4,
  name: 'images_year_reads',
  up: `
    -- Ảnh gáy sách do người dùng tải lên (ảnh bìa đã có cột cover_image).
    ALTER TABLE items ADD COLUMN spine_image TEXT;

    -- Lượt đọc chỉ biết năm (ví dụ note Obsidian chỉ ghi Year: [[2026]], không có ngày).
    ALTER TABLE library_cards ADD COLUMN finish_year INTEGER
      CHECK (finish_year IS NULL OR finish_year BETWEEN 1900 AND 2100);
  `,
};
