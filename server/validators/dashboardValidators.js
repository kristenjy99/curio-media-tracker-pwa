import { z } from 'zod';

export const dashboardQuerySchema = z.object({
  year: z.coerce.number().int().min(1900).max(3000).optional(),
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
