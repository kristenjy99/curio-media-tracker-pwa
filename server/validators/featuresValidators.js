import { z } from 'zod';
import { isoDate, queryInt } from './common.js';

const year = z.number().int().min(1900).max(3000);
const label = z.string().trim().min(1).max(200);

export const yearQuery = z.object({ year: queryInt(1900, 3000), today: isoDate.optional() });
export const yearParams = z.object({ year: z.coerce.number().int().min(1900).max(3000) });
export const favoritesParams = z.object({ year: z.coerce.number().int().min(1900).max(3000), month: z.coerce.number().int().min(1).max(12) });

export const goalBody = z.object({ year, metric: z.enum(['books', 'pages', 'hours']), target: z.number().positive().max(1_000_000) });

export const createChallengeSchema = z.object({
  name: z.string().trim().min(1).max(100),
  type: z.enum(['prompt', 'bingo', 'az']),
  year: year.optional(),
  size: z.number().int().min(3).max(5).optional(),
  az_mode: z.enum(['title', 'author']).optional(),
  prompts: z.array(z.string().trim().max(200)).max(100).optional(),
});
export const renameChallengeSchema = z.object({ name: z.string().trim().min(1).max(100) });
export const promptBody = z.object({ label });
export const slotPatchSchema = z
  .object({ item_id: z.number().int().positive().nullable().optional(), label: z.string().trim().max(200).optional() })
  .refine((value) => value.item_id !== undefined || value.label !== undefined, { message: 'Cần item_id hoặc label' });

export const favoritesBody = z.object({ item_ids: z.array(z.number().int().positive()).max(3).refine((ids) => new Set(ids).size === ids.length, 'Trùng sách') });

export const createBracketSchema = z.object({
  name: z.string().trim().min(1).max(100),
  year,
  size: z.union([z.literal(4), z.literal(8), z.literal(16)]),
  item_ids: z.array(z.number().int().positive()).max(16),
});
export const pickSchema = z.object({ round: z.number().int().min(0).max(3), match: z.number().int().min(0).max(7), item_id: z.number().int().positive().nullable() });
export const startBody = z.object({ date: isoDate.optional() });
