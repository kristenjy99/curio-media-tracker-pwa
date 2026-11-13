export default {
  version: 8,
  name: 'warnings',
  up: `
    -- Cảnh báo nội dung (trigger warning) cho sách Fiction và Fanfiction.
    ALTER TABLE items ADD COLUMN warnings TEXT NOT NULL DEFAULT '[]'
      CHECK (json_valid(warnings) AND json_type(warnings) = 'array');
  `,
};
