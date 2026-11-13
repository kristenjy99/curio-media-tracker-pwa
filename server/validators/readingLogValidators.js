import { z } from 'zod';
import { isoDate, nonNegativeInt, queryInt, requireAtLeastOneField } from './common.js';

const hasActivity = (log) => (log.units_read ?? 0) > 0 || (log.minutes_spent ?? 0) > 0;

export const createReadingLogSchema = z
  .object({
    item_id: z.number().int().positive(),
    date: isoDate,
    units_read: nonNegativeInt.default(0),
    minutes_spent: nonNegativeInt.default(0),
    // true: cộng units_read vào items.current_unit (giới hạn bởi total_units) trong cùng transaction.
    advance_progress: z.boolean().default(false),
  })
  .refine(hasActivity, { message: 'Cần units_read hoặc minutes_spent lớn hơn 0', path: ['units_read'] });

export const updateReadingLogSchema = requireAtLeastOneField(
  z.object({
    date: isoDate.optional(),
    units_read: nonNegativeInt.optional(),
    minutes_spent: nonNegativeInt.optional(),
  }),
);

export const listReadingLogsQuerySchema = z
  .object({
    item_id: queryInt(1, Number.MAX_SAFE_INTEGER),
    from: isoDate.optional(),
    to: isoDate.optional(),
    limit: queryInt(1, 5000),
    offset: queryInt(0, Number.MAX_SAFE_INTEGER),
  })
  .refine((query) => !query.from || !query.to || query.from <= query.to, {
    message: '"from" phải nhỏ hơn hoặc bằng "to"',
    path: ['from'],
  });

export { hasActivity };
