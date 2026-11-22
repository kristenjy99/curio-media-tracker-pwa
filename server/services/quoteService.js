import { NotFoundError } from '../utils/errors.js';

/**
 * Chuẩn hoá để tìm kiếm không phân biệt hoa thường và dấu tiếng Việt: "Thời Gian" khớp "thoi gian".
 * LIKE của SQLite chỉ gộp hoa thường cho chữ ASCII nên việc lọc theo từ khoá làm ở đây.
 */
export function foldText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function createQuoteService(context) {
  const { models } = context;
  const { items, quotes } = models;

  async function getOrThrow(id) {
    const quote = await quotes.findById(id);
    if (!quote) throw new NotFoundError('Quote', id);
    return quote;
  }

  return {
    /**
     * Danh sách quotes kèm sách nguồn. `q` tìm trong nội dung, ghi chú, vị trí, tên sách và tác giả;
     * nhiều từ thì phải khớp đủ mọi từ. `counts` đếm theo loại trên toàn bộ quotes (không theo bộ lọc).
     */
    async list({ q, kind, item_id: itemId } = {}) {
      let rows = await quotes.list({ itemId, kind });
      const words = foldText(q).split(' ').filter(Boolean);
      if (words.length) {
        rows = rows.filter((row) => {
          const haystack = foldText([row.content, row.note, row.location, row.item_title, row.item_author].filter(Boolean).join(' \n '));
          return words.every((word) => haystack.includes(word));
        });
      }
      const counts = { quote: 0, highlight: 0 };
      for (const row of await quotes.countByKind()) counts[row.kind] = row.count;
      return { data: rows, total: rows.length, counts };
    },

    async create(data) {
      if (!(await items.exists(data.item_id))) throw new NotFoundError('Item', data.item_id);
      const { item_id: itemId, ...rest } = data;
      return quotes.create(itemId, rest);
    },

    async update(id, patch) {
      await getOrThrow(id);
      return quotes.update(id, patch);
    },

    async delete(id) {
      if (!(await quotes.delete(id))) throw new NotFoundError('Quote', id);
    },
  };
}
