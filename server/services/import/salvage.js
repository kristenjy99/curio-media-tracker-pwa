import { createItemSchema } from '../../validators/itemValidators.js';

/** Dựng sách hợp lệ từ dữ liệu lỗi: bỏ từng trường sai, thiếu tên thì đặt tên tạm để người dùng sửa lại. */
export function salvageItem(item, label) {
  const data = { ...item, title: String(item.title ?? '').trim().slice(0, 500) || `Chưa có tên (${label})` };
  if (!['Fiction', 'Nonfiction', 'Fanfiction', 'Visual/Comics'].includes(data.main_category)) data.main_category = 'Fiction';
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const parsed = createItemSchema.safeParse(data);
    if (parsed.success) return parsed.data;
    const bad = new Set(parsed.error.issues.map((issue) => issue.path[0]).filter((key) => key && key !== 'title' && key !== 'main_category'));
    if (!bad.size) break;
    for (const key of bad) delete data[key];
  }
  return createItemSchema.parse({ title: data.title, main_category: data.main_category });
}

/** Lượt đọc có ngày xong trước ngày bắt đầu thì bỏ ngày xong để khỏi sai dữ liệu. */
export const safeCards = (cards) =>
  cards.map((card) => (card.start_date && card.finish_date && card.finish_date < card.start_date ? { ...card, finish_date: null } : card));
