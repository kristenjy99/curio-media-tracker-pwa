import { z } from 'zod';
import { MAIN_CATEGORIES, STATUSES } from './common.js';

export const markdownImportSchema = z.object({
  files: z
    .array(z.object({ path: z.string().min(1).max(1000), content: z.string().max(2_000_000) }))
    .min(1, 'Chưa chọn file nào')
    .max(5000, 'Tối đa 5000 file mỗi lần'),
  default_category: z.enum(MAIN_CATEGORIES).default('Fiction'),
  overrides: z.record(z.string(), z.enum(MAIN_CATEGORIES)).default({}),
  skip_duplicates: z.boolean().default(true),
  include_invalid: z.boolean().default(false),
  // Ghép trạng thái lạ trong note (đúng chữ như trong note) -> trạng thái của app; lưu lại cho các lần sau.
  status_map: z.record(z.string().max(200), z.enum(STATUSES)).default({}),
});

export const imageParams = z.object({
  id: z.coerce.number().int().positive(),
  kind: z.enum(['cover', 'spine']),
});
