export default {
  version: 10,
  name: 'import_issues',
  up: `
    -- Lỗi khi import (JSON mảng chuỗi); NULL = không cần chỉnh sửa.
    ALTER TABLE items ADD COLUMN import_issues TEXT;
  `,
};
