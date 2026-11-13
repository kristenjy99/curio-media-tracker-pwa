import { buildSetClause, nowIso } from '../utils/sql.js';

const WRITABLE_COLUMNS = ['start_date', 'finish_date', 'finish_year', 'rating', 'review_summary'];

const SQL_LIST_BY_ITEM = 'SELECT * FROM library_cards WHERE item_id = ? ORDER BY read_number ASC';
const SQL_FIND_BY_ID = 'SELECT * FROM library_cards WHERE id = ?';
const SQL_LATEST_BY_ITEM = 'SELECT * FROM library_cards WHERE item_id = ? ORDER BY read_number DESC LIMIT 1';
const SQL_NEXT_READ_NUMBER = 'SELECT COALESCE(MAX(read_number), 0) + 1 FROM library_cards WHERE item_id = ?';
const SQL_INSERT = `
    INSERT INTO library_cards (item_id, read_number, start_date, finish_date, finish_year, rating, review_summary, created_at, updated_at)
    VALUES (@item_id, @read_number, @start_date, @finish_date, @finish_year, @rating, @review_summary, @created_at, @updated_at)
  `;
const SQL_DELETE = 'DELETE FROM library_cards WHERE id = ?';
const SQL_LATER_CARDS = 'SELECT id, read_number FROM library_cards WHERE item_id = ? AND read_number > ? ORDER BY read_number ASC';
const SQL_SET_READ_NUMBER = 'UPDATE library_cards SET read_number = ?, updated_at = ? WHERE id = ?';
const SQL_DELETE_ALL_FOR_ITEM = 'DELETE FROM library_cards WHERE item_id = ?';

export function createLibraryCardModel(db) {
  return {
    listByItem(itemId) {
      return db.all(SQL_LIST_BY_ITEM, [itemId]);
    },

    async findById(id) {
      return (await db.get(SQL_FIND_BY_ID, [id])) ?? null;
    },

    async findLatestByItem(itemId) {
      return (await db.get(SQL_LATEST_BY_ITEM, [itemId])) ?? null;
    },

    async create(itemId, data) {
      const timestamp = nowIso();
      const info = await db.run(SQL_INSERT, {
        item_id: itemId,
        read_number: await db.get(SQL_NEXT_READ_NUMBER, [itemId], { pluck: true }),
        start_date: data.start_date ?? null,
        finish_date: data.finish_date ?? null,
        finish_year: data.finish_year ?? null,
        rating: data.rating ?? null,
        review_summary: data.review_summary ?? null,
        created_at: timestamp,
        updated_at: timestamp,
      });
      return this.findById(info.lastInsertRowid);
    },

    async update(id, patch) {
      const { columns, clause } = buildSetClause(patch, WRITABLE_COLUMNS);
      if (columns.length === 0) return this.findById(id);
      const picked = Object.fromEntries(columns.map((c) => [c, patch[c]]));
      await db.run(`UPDATE library_cards SET ${clause}, updated_at = @updated_at WHERE id = @id`, {
        ...picked,
        updated_at: nowIso(),
        id,
      });
      return this.findById(id);
    },

    /** Thay toàn bộ lượt đọc của item (dùng khi nhập từ file Obsidian), đánh số lại từ #1. */
    async replaceAllForItem(itemId, cards) {
      await db.run(SQL_DELETE_ALL_FOR_ITEM, [itemId]);
      const timestamp = nowIso();
      for (const [index, card] of cards.entries()) {
        await db.run(SQL_INSERT, {
          item_id: itemId,
          read_number: index + 1,
          start_date: card.start_date ?? null,
          finish_date: card.finish_date ?? null,
          finish_year: card.finish_year ?? null,
          rating: card.rating ?? null,
          review_summary: card.review_summary ?? null,
          created_at: timestamp,
          updated_at: timestamp,
        });
      }
    },

    /** Xoá một lượt đọc và dồn số thứ tự các lượt phía sau để stamp luôn liên tục (#1, #2, #3...). */
    async deleteAndRenumber(card) {
      await db.run(SQL_DELETE, [card.id]);
      // Dồn từng lượt theo thứ tự tăng dần: vị trí đích luôn vừa được giải phóng,
      // nên không vi phạm UNIQUE(item_id, read_number) và CHECK(read_number >= 1).
      const timestamp = nowIso();
      for (const later of await db.all(SQL_LATER_CARDS, [card.item_id, card.read_number])) {
        await db.run(SQL_SET_READ_NUMBER, [later.read_number - 1, timestamp, later.id]);
      }
    },
  };
}
