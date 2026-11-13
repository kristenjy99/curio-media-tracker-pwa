import { z } from 'zod';
import { MAIN_CATEGORIES, STATUSES } from './common.js';

const base = {
  source: z.enum(['goodreads', 'notion', 'generic']),
  format: z.enum(['csv', 'json']),
  content: z.string().min(1, 'File rỗng').max(20_000_000, 'File quá lớn (tối đa ~20MB)'),
};

export const analyzeImportSchema = z.object(base);

export const convertImportSchema = z.object({
  ...base,
  mapping: z.record(z.string(), z.string().nullable()),
  defaults: z.object({
    main_category: z.enum(MAIN_CATEGORIES).default('Fiction'),
    status: z.enum(STATUSES).optional(),
  }).default({ main_category: 'Fiction' }),
  skip_duplicates: z.boolean().default(true),
  include_invalid: z.boolean().default(false),
  limit: z.number().int().min(1).max(5000).optional(),
});
