import { NotFoundError, ValidationError } from '../utils/errors.js';
import { hasActivity } from '../validators/readingLogValidators.js';

/**
 * Log đọc theo ngày. Khi tạo log với advance_progress = true, số đơn vị đọc được cộng vào items.current_unit
 * (không vượt total_units) và phần thực sự cộng được lưu ở progress_applied. Sửa units_read hoặc xoá log
 * thì trả lại đúng phần đã cộng rồi cộng lại theo số mới, nên tiến độ không bị lệch.
 */
export function createReadingLogService({ db, models }) {
  const { items, readingLogs } = models;

  async function requireLog(id) {
    const log = await readingLogs.findById(id);
    if (!log) throw new NotFoundError('Reading log', id);
    return log;
  }

  async function requireItem(id) {
    const item = await items.findById(id);
    if (!item) throw new NotFoundError('Item', id);
    return item;
  }

  /** Cộng (delta > 0) hoặc trừ (delta < 0) vào tiến độ; trả về số đơn vị thực sự đã đổi. */
  async function shiftProgress(item, delta) {
    if (delta === 0) return 0;
    const cap = item.total_units ?? Number.MAX_SAFE_INTEGER;
    const next = Math.max(0, Math.min(cap, item.current_unit + delta));
    if (next !== item.current_unit) await items.update(item.id, { current_unit: next });
    return next - item.current_unit;
  }

  return {
    list(filters) {
      return readingLogs.list(filters);
    },

    create({ advance_progress: advanceProgress, ...data }) {
      return db.transaction(async () => {
        const item = await requireItem(data.item_id);
        const applied = advanceProgress && data.units_read > 0 ? await shiftProgress(item, data.units_read) : 0;
        const log = await readingLogs.create({ ...data, progress_applied: Math.max(applied, 0) });
        if (!applied) await items.touch(item.id);
        return { log, item: await items.findById(item.id) };
      })();
    },

    update(id, patch) {
      return db.transaction(async () => {
        const existing = await requireLog(id);
        if (!hasActivity({ ...existing, ...patch })) {
          throw new ValidationError('Cần units_read hoặc minutes_spent lớn hơn 0', [
            { path: ['units_read'], message: 'Cả hai bằng 0' },
          ]);
        }
        const next = { ...patch };
        if (existing.progress_applied > 0 && patch.units_read !== undefined && patch.units_read !== existing.units_read) {
          const item = await requireItem(existing.item_id);
          const reverted = await shiftProgress(item, -existing.progress_applied);
          const reapplied = await shiftProgress(await requireItem(existing.item_id), patch.units_read);
          next.progress_applied = Math.max(reapplied, 0);
          if (!reverted && !reapplied) await items.touch(existing.item_id);
        } else {
          await items.touch(existing.item_id);
        }
        return { log: await readingLogs.update(id, next), item: await items.findById(existing.item_id) };
      })();
    },

    delete(id) {
      return db.transaction(async () => {
        const log = await requireLog(id);
        await readingLogs.delete(id);
        const item = await requireItem(log.item_id);
        if (log.progress_applied > 0) await shiftProgress(item, -log.progress_applied);
        else await items.touch(item.id);
        return { item: await items.findById(item.id) };
      })();
    },
  };
}
