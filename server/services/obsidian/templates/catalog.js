import { MAIN_CATEGORIES, MEDIA_TYPES, STATUSES, UNIT_TYPES } from '../../../validators/common.js';

/**
 * Định dạng ghi ra frontmatter:
 *   text     chữ (kèm link: [[...]], kèm list: danh sách)
 *   number   số
 *   date     ngày YYYY-MM-DD
 *   checkbox true/false
 *   stars    rating dạng ⭐⭐⭐⭐½
 *   chilis   độ spicy dạng 🌶️🌶️🌶️½
 *   reads    lịch sử lượt đọc, mỗi lượt một dòng
 */
export const FORMATS = [
  { id: 'text', label: 'Chữ' },
  { id: 'number', label: 'Số' },
  { id: 'date', label: 'Ngày' },
  { id: 'checkbox', label: 'Có/Không' },
  { id: 'stars', label: 'Sao ⭐' },
  { id: 'chilis', label: 'Ớt 🌶️' },
  { id: 'reads', label: 'Lịch sử lượt đọc' },
];

/**
 * Các trường của app có thể nối với property Obsidian.
 * valueType quyết định cách đọc/ghi; readOnly = trường tính ra, chỉ ghi ra file, không nhập ngược từ file.
 */
export const FIELD_CATALOG = [
  { field: 'main_category', label: 'Thể loại chính', valueType: 'enum', values: MAIN_CATEGORIES, formats: ['text'] },
  { field: 'title', label: 'Tiêu đề', valueType: 'string', formats: ['text'] },
  { field: 'creator_author', label: 'Tác giả', valueType: 'string', splitList: true, formats: ['text'] },
  { field: 'media_type', label: 'Loại ấn phẩm', valueType: 'enum', values: MEDIA_TYPES, formats: ['text'] },
  { field: 'status', label: 'Trạng thái', valueType: 'enum', values: STATUSES, formats: ['text'] },
  { field: 'rating', label: 'Đánh giá chung', valueType: 'number', formats: ['stars', 'number'] },
  { field: 'spice_rating', label: 'Độ spicy (sách có tag smut)', valueType: 'number', formats: ['chilis', 'number'] },
  { field: 'is_favorite', label: 'Yêu thích', valueType: 'boolean', formats: ['checkbox'] },
  { field: 'format', label: 'Định dạng / nền tảng', valueType: 'string', formats: ['text'] },
  { field: 'language', label: 'Ngôn ngữ', valueType: 'string', splitList: true, formats: ['text'] },
  { field: 'release_year', label: 'Năm phát hành', valueType: 'integer', formats: ['number'] },
  { field: 'unit_type', label: 'Đơn vị tiến độ', valueType: 'enum', values: UNIT_TYPES, formats: ['text'] },
  { field: 'total_units', label: 'Tổng số trang/chương', valueType: 'integer', formats: ['number'] },
  { field: 'current_unit', label: 'Đang ở trang/chương', valueType: 'integer', formats: ['number'] },
  { field: 'word_count', label: 'Số chữ', valueType: 'integer', formats: ['number'] },
  { field: 'volume_count', label: 'Số volume', valueType: 'integer', formats: ['number'] },
  { field: 'progress_percent', label: 'Tiến độ %', valueType: 'number', formats: ['number'], readOnly: true },
  { field: 'tags', label: 'Tags / Genres', valueType: 'string_list', formats: ['text'] },
  { field: 'fandoms', label: 'Fandom', valueType: 'string_list', formats: ['text'] },
  { field: 'pairings', label: 'Pairing / Ship', valueType: 'string_list', formats: ['text'] },
  { field: 'tropes', label: 'Tropes', valueType: 'string_list', formats: ['text'] },
  { field: 'warnings', label: 'Warnings (cảnh báo nội dung)', valueType: 'string_list', formats: ['text'] },
  { field: 'topics', label: 'Chủ đề (nonfiction)', valueType: 'string_list', formats: ['text'] },
  { field: 'cover_image', label: 'Ảnh bìa', valueType: 'string', formats: ['text'] },
  { field: 'spine_image', label: 'Ảnh gáy sách', valueType: 'string', formats: ['text'] },
  // Lấy từ note (tab Note & Review); chỉ ghi ra file. Ảnh moodboard tải lên được ghi thành link vault.
  { field: 'playlist_url', label: 'Playlist (link)', valueType: 'string_list', formats: ['text'], readOnly: true },
  { field: 'moodboard_urls', label: 'Moodboard (ảnh)', valueType: 'string_list', formats: ['text'], readOnly: true },
  { field: 'review_date', label: 'Ngày review', valueType: 'date', formats: ['date'] },
  { field: 'read_years', label: 'Các năm đã đọc', valueType: 'number_list', formats: ['number'], readOnly: true },
  { field: 'latest_start_date', label: 'Ngày bắt đầu (lượt gần nhất)', valueType: 'date', formats: ['date'] },
  { field: 'latest_finish_date', label: 'Ngày đọc xong (lượt gần nhất)', valueType: 'date', formats: ['date'] },
  { field: 'reads', label: 'Lịch sử lượt đọc (re-read)', valueType: 'reads', formats: ['reads'] },
  { field: 'read_count', label: 'Số lượt đọc', valueType: 'integer', formats: ['number'], readOnly: true },
  { field: 'reread_count', label: 'Số lần re-read', valueType: 'integer', formats: ['number'], readOnly: true },
  { field: 'last_read_date', label: 'Ngày đọc gần nhất', valueType: 'date', formats: ['date'], readOnly: true },
];

export const CUSTOM_PREFIX = 'custom:';
export const CUSTOM_FORMATS = ['text', 'number', 'date', 'checkbox'];
export const SYSTEM_KEY = 'rt_id';

const CATALOG_BY_FIELD = new Map(FIELD_CATALOG.map((entry) => [entry.field, entry]));

/** Trả về mô tả trường; trường riêng (custom:xxx) có valueType suy ra từ format. */
export function describeField(field, format, list = false) {
  if (field.startsWith(CUSTOM_PREFIX)) {
    const slug = field.slice(CUSTOM_PREFIX.length);
    const valueType = { text: list ? 'string_list' : 'string', number: 'number', date: 'date', checkbox: 'boolean' }[format];
    return { field, slug, custom: true, label: slug, valueType, formats: CUSTOM_FORMATS };
  }
  return CATALOG_BY_FIELD.get(field) ?? null;
}
