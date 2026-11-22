import { z } from 'zod';
import { queryInt, requireAtLeastOneField } from './common.js';

export const QUOTE_KINDS = ['quote', 'highlight'];

const content = z.string().trim().min(1, 'Cần nội dung quote').max(20_000);
// Chuỗi rỗng sau khi trim được lưu là null.
const optionalText = (max) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((value) => (value ? value : null));

export const createQuoteSchema = z.object({
  item_id: z.number().int().positive(),
  kind: z.enum(QUOTE_KINDS).default('quote'),
  content,
  note: optionalText(5000).optional(),
  location: optionalText(100).optional(),
});

export const updateQuoteSchema = requireAtLeastOneField(
  z.object({
    kind: z.enum(QUOTE_KINDS).optional(),
    content: content.optional(),
    note: optionalText(5000).optional(),
    location: optionalText(100).optional(),
  }),
);

export const listQuotesQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  kind: z.enum(QUOTE_KINDS).optional(),
  item_id: queryInt(1, Number.MAX_SAFE_INTEGER),
});
