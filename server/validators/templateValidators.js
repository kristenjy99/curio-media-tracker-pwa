import { z } from 'zod';
import { MAIN_CATEGORIES } from './common.js';

const property = z.object({
  key: z.string().max(64),
  field: z.string().min(1).max(60),
  format: z.enum(['text', 'number', 'date', 'checkbox', 'stars', 'reads']),
  link: z.boolean().optional(),
  list: z.boolean().optional(),
});

export const templateBody = z.object({
  properties: z.array(property).min(1).max(80),
  body_template: z.string().max(100_000).default(''),
});

export const categoryParam = z.object({ category: z.enum(MAIN_CATEGORIES) });

export const previewBody = z.object({
  template: templateBody.optional(),
  item_id: z.number().int().positive().optional(),
});
