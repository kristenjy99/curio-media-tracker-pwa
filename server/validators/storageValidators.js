import path from 'node:path';
import { z } from 'zod';
import { queryBoolean } from './common.js';

const absolutePath = z
  .string()
  .trim()
  .min(1)
  .max(4096)
  .refine((value) => path.isAbsolute(value), 'Phải là đường dẫn tuyệt đối');

export const inspectStorageSchema = z.object({ path: absolutePath });

export const changeStorageSchema = z.object({
  path: absolutePath,
  mode: z.enum(['copy', 'open']),
});

export const browseQuerySchema = z.object({
  path: absolutePath.optional(),
  show_hidden: queryBoolean,
});
