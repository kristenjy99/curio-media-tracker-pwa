import { nowIso } from '../utils/sql.js';

// Kèm thông tin sách nguồn để trang Quotes hiện được "trích từ sách nào, của ai".
const SELECT_WITH_ITEM = `
  SELECT q.id, q.item_id, q.kind, q.content, q.note, q.location, q.created_at, q.updated_at,
         i.title AS item_title, i.creator_author AS item_author, i.main_category AS item_category, i.cover_image AS item_cover
  FROM quotes q JOIN items i ON i.id = q.item_id`;

const WRITABLE = ['kind', 'content', 'note', 'location'];

export function createQuoteModel(db) {
  return {
    findById(id) {
      return db.get(`${SELECT_WITH_ITEM} WHERE q.id = ?`, [id]);
    },

    /** Toàn bộ quotes (hoặc của một sách), mới nhất trước. Lọc theo từ khoá làm ở service. */
    list({ itemId, kind } = {}) {
      const where = [];
      const params = [];
      if (itemId) {
        where.push('q.item_id = ?');
        params.push(itemId);
      }
      if (kind) {
        where.push('q.kind = ?');
        params.push(kind);
      }
      return db.all(`${SELECT_WITH_ITEM} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY q.created_at DESC, q.id DESC`, params);
    },

    async create(itemId, data) {
      const timestamp = nowIso();
      const info = await db.run(
        'INSERT INTO quotes (item_id, kind, content, note, location, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [itemId, data.kind ?? 'quote', data.content, data.note ?? null, data.location ?? null, timestamp, timestamp],
      );
      return this.findById(Number(info.lastInsertRowid));
    },

    async update(id, patch) {
      const keys = WRITABLE.filter((key) => patch[key] !== undefined);
      if (keys.length) {
        await db.run(`UPDATE quotes SET ${keys.map((key) => `${key} = ?`).join(', ')}, updated_at = ? WHERE id = ?`, [...keys.map((key) => patch[key]), nowIso(), id]);
      }
      return this.findById(id);
    },

    async delete(id) {
      return (await db.run('DELETE FROM quotes WHERE id = ?', [id])).changes > 0;
    },

    countByKind() {
      return db.all('SELECT kind, COUNT(*) AS count FROM quotes GROUP BY kind');
    },
  };
}
