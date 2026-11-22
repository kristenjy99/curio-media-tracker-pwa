import { z } from 'zod';
import {
  isoDate,
  MAIN_CATEGORIES,
  MEDIA_TYPES,
  STATUSES,
  UNIT_TYPES,
  nonNegativeInt,
  optionalText,
  queryBoolean,
  queryInt,
  queryList,
  rating,
  requireAtLeastOneField,
  resourceRef,
  stringList,
} from './common.js';

export const CUSTOM_FIELD_SLUG = /^[a-z0-9_]{1,40}$/;

const customValue = z.union([
  z.string().max(5000),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.string().trim().max(500)).max(200),
]);

// Giá trị cho các property tự định nghĩa trong template Obsidian (Series, FIN?, Platform...).
const customFields = z
  .record(z.string().regex(CUSTOM_FIELD_SLUG, 'Tên trường riêng chỉ gồm a-z, 0-9, _'), customValue)
  .refine((value) => Object.keys(value).length <= 100, 'Tối đa 100 trường riêng');

const itemFields = z.object({
  title: z
    .string({ error: (issue) => (issue.input === undefined ? 'title là bắt buộc' : 'title phải là chuỗi') })
    .trim()
    .min(1, 'Tiêu đề không được để trống')
    .max(500),
  creator_author: optionalText(500),
  media_type: z.enum(MEDIA_TYPES),
  main_category: z.enum(MAIN_CATEGORIES, {
    error: (issue) =>
      issue.input === undefined
        ? 'main_category là bắt buộc'
        : `main_category phải là một trong: ${MAIN_CATEGORIES.join(', ')}`,
  }),
  format: optionalText(100),
  unit_type: z.enum(UNIT_TYPES),
  total_units: nonNegativeInt.nullable(),
  current_unit: nonNegativeInt,
  word_count: nonNegativeInt.nullable(),
  volume_count: nonNegativeInt.nullable(),
  status: z.enum(STATUSES),
  release_year: z.number().int().min(-3000).max(3000).nullable(),
  language: optionalText(50),
  rating: rating.nullable(),
  // Độ spicy chỉ có nghĩa với sách có tag smut; giao diện ẩn trường này ở sách khác.
  spice_rating: rating.nullable(),
  is_favorite: z.boolean(),
  cover_image: resourceRef.nullable(),
  spine_image: resourceRef.nullable(),
  review_date: isoDate.nullable(),
  ownership: z.enum(['owned', 'wishlist']).nullable(),
  release_date: isoDate.nullable(),
  tags: stringList(),
  pairings: stringList(),
  fandoms: stringList(),
  tropes: stringList(),
  topics: stringList(),
  warnings: stringList(),
  import_issues: z.array(z.string().max(500)).max(50).nullable(),
  custom_fields: customFields,
});

export const createItemSchema = itemFields
  .partial()
  .extend({ title: itemFields.shape.title, main_category: itemFields.shape.main_category });

export const updateItemSchema = requireAtLeastOneField(itemFields.partial());

export const listItemsQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  status: queryList(z.enum(STATUSES)),
  main_category: queryList(z.enum(MAIN_CATEGORIES)),
  media_type: queryList(z.enum(MEDIA_TYPES)),
  tag: queryList(z.string().max(200)),
  fandom: queryList(z.string().max(200)),
  pairing: queryList(z.string().max(200)),
  topic: queryList(z.string().max(200)),
  // Tác giả: không tách theo dấu phẩy như queryList, vì tên tác giả có thể chứa dấu phẩy. Nhiều giá trị = OR.
  author: z.preprocess(
    (value) => (value === undefined || value === '' ? undefined : (Array.isArray(value) ? value : [value]).map((entry) => String(entry).trim()).filter(Boolean)),
    z.array(z.string().max(500)).max(50).optional(),
  ),
  rating_min: z.coerce.number().min(0).max(5).optional(),
  unrated: queryBoolean,
  release_year: queryInt(-3000, 3000),
  release_year_from: queryInt(-3000, 3000),
  release_year_to: queryInt(-3000, 3000),
  read_year: queryInt(1900, 3000),
  is_favorite: queryBoolean,
  needs_review: queryBoolean,
  sort: z.enum(['title', 'created_at', 'updated_at', 'release_year', 'rating', 'last_read_date', 'review_date']).optional(),
  order: z.enum(['asc', 'desc']).optional(),
  limit: queryInt(1, 5000),
  offset: queryInt(0, Number.MAX_SAFE_INTEGER),
});

export const titleCheckQuerySchema = z.object({
  title: z.string().trim().min(1).max(500),
  exclude_id: queryInt(1, Number.MAX_SAFE_INTEGER),
});
