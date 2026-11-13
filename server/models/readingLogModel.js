import { buildSetClause, nowIso } from '../utils/sql.js';

const WRITABLE_COLUMNS = ['date', 'units_read', 'minutes_spent', 'progress_applied'];

const SQL_FIND_BY_ID = 'SELECT * FROM reading_logs WHERE id = ?';
const SQL_INSERT = `
    INSERT INTO reading_logs (item_id, date, units_read, minutes_spent, progress_applied, updated_at)
    VALUES (@item_id, @date, @units_read, @minutes_spent, @progress_applied, @updated_at)
  `;
const SQL_DELETE = 'DELETE FROM reading_logs WHERE id = ?';

export function createReadingLogModel(db) {
  return {
    async findById(id) {
      return (await db.get(SQL_FIND_BY_ID, [id])) ?? null;
    },

    async list({ item_id, from, to, limit = 500, offset = 0 } = {}) {
      const where = [];
      const params = { limit, offset };
      if (item_id !== undefined) {
        where.push('item_id = @item_id');
        params.item_id = item_id;
      }
      if (from) {
        where.push('date >= @from');
        params.from = from;
      }
      if (to) {
        where.push('date <= @to');
        params.to = to;
      }
      const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const total = await db.get(`SELECT COUNT(*) FROM reading_logs ${clause}`, params, { pluck: true });
      const data = await db.all(
        `SELECT * FROM reading_logs ${clause} ORDER BY date DESC, id DESC LIMIT @limit OFFSET @offset`,
        params,
      );
      return { data, total, limit, offset };
    },

    async create(data) {
      const info = await db.run(SQL_INSERT, {
        item_id: data.item_id,
        date: data.date,
        units_read: data.units_read ?? 0,
        minutes_spent: data.minutes_spent ?? 0,
        progress_applied: data.progress_applied ?? 0,
        updated_at: nowIso(),
      });
      return this.findById(info.lastInsertRowid);
    },

    async update(id, patch) {
      const { columns, clause } = buildSetClause(patch, WRITABLE_COLUMNS);
      if (columns.length === 0) return this.findById(id);
      const picked = Object.fromEntries(columns.map((c) => [c, patch[c]]));
      await db.run(`UPDATE reading_logs SET ${clause}, updated_at = @updated_at WHERE id = @id`, {
        ...picked,
        updated_at: nowIso(),
        id,
      });
      return this.findById(id);
    },

    async delete(id) {
      return (await db.run(SQL_DELETE, [id])).changes > 0;
    },
  };
}
