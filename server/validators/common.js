import { z } from 'zod';

export const MAIN_CATEGORIES = ['Fiction', 'Nonfiction', 'Fanfiction', 'Visual/Comics'];
export const STATUSES = ['Reading', 'Finished', 'TBR', 'DNF'];
export const MEDIA_TYPES = [
  'Book',
  'Ebook',
  'Audiobook',
  'Fanfic',
  'Webnovel',
  'Light Novel',
  'Manga',
  'Manhwa',
  'Manhua',
  'Comic',
  'Webtoon',
  'Other',
  'News',
  'Research Paper',
];
export const UNIT_TYPES = ['pages', 'chapters', 'volumes', 'words', 'minutes', 'percent'];

export const idParam = z.object({ id: z.coerce.number().int().positive() });
export const itemIdParam = z.object({ itemId: z.coerce.number().int().positive() });

export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Định dạng ngày phải là YYYY-MM-DD')
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, 'Ngày không tồn tại');

export const optionalText = (max = 2000) => z.string().trim().max(max).nullable();

export const nonNegativeInt = z.number().int().min(0);

export const rating = z.number().min(0).max(5);

/** Mảng chuỗi đã trim, bỏ phần tử rỗng, khử trùng lặp không phân biệt hoa thường, giữ thứ tự xuất hiện. */
export const stringList = (maxItems = 200, maxLength = 200) =>
  z
    .array(z.string().trim().max(maxLength))
    .max(maxItems)
    .transform((values) => {
      const seen = new Set();
      return values.filter((value) => {
        const key = value.toLowerCase();
        if (!value || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    });

/** Chuỗi trỏ tới tài nguyên: URL http(s), data URI hoặc đường dẫn tương đối trong thư mục storage. */
export const resourceRef = z.string().trim().min(1).max(4096);

export const httpUrl = z
  .string()
  .trim()
  .url()
  .refine((value) => /^https?:\/\//i.test(value), 'Chỉ chấp nhận URL http(s)');

/** Query string: hỗ trợ cả ?status=A&status=B lẫn ?status=A,B */
export const queryList = (itemSchema) =>
  z.preprocess((value) => {
    if (value === undefined || value === '') return undefined;
    const list = Array.isArray(value) ? value : [value];
    return list
      .flatMap((entry) => String(entry).split(','))
      .map((entry) => entry.trim())
      .filter(Boolean);
  }, z.array(itemSchema).optional());

export const queryBoolean = z
  .enum(['true', 'false', '1', '0'])
  .transform((value) => value === 'true' || value === '1')
  .optional();

export const queryInt = (min, max) => z.coerce.number().int().min(min).max(max).optional();

export const requireAtLeastOneField = (schema) =>
  schema.refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'Cần ít nhất một trường để cập nhật',
  });
