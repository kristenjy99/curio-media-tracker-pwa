export default {
  version: 5,
  name: 'review_date_settings',
  up: `
    -- Ngày review thành trường chính của sách (trước đây là trường riêng custom:review_date trong template).
    ALTER TABLE items ADD COLUMN review_date TEXT CHECK (review_date IS NULL OR date(review_date) = review_date);

    UPDATE items
    SET review_date = json_extract(custom_fields, '$.review_date'),
        custom_fields = json_remove(custom_fields, '$.review_date')
    WHERE json_type(custom_fields, '$.review_date') = 'text'
      AND date(json_extract(custom_fields, '$.review_date')) = json_extract(custom_fields, '$.review_date');

    UPDATE obsidian_templates
    SET properties = replace(properties, '"custom:review_date"', '"review_date"');

    -- Cài đặt chung của app (danh sách ngôn ngữ, giao diện). Nằm trong DB nên đi theo thư mục lưu trữ.
    CREATE TABLE app_settings (
      key    TEXT PRIMARY KEY,
      value  TEXT NOT NULL CHECK (json_valid(value))
    );
  `,
};
