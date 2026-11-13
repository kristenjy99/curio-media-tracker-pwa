import { z } from 'zod';
import { AppError, ValidationError } from '../utils/errors.js';
import { splitList } from './readingsService.js';

/** "[[Percy Jackson|PJ]]" -> "Percy Jackson"; bỏ khoảng trắng thừa. */
export function cleanSeriesName(raw) {
  if (raw === null || raw === undefined) return '';
  let text = String(raw).trim();
  const link = text.match(/^\[\[([^\]|]+)(?:\|[^\]]*)?\]\]$/);
  if (link) text = link[1];
  return text.replace(/\s+/g, ' ').trim();
}

export const seriesKey = (name) => cleanSeriesName(name).toLowerCase();

/** custom_fields.series có thể là chuỗi hoặc mảng (template ghi dạng danh sách link). */
function bookSeriesNames(customFields) {
  let value;
  try {
    value = JSON.parse(customFields ?? '{}')?.series;
  } catch {
    return [];
  }
  const list = Array.isArray(value) ? value : value ? [value] : [];
  return [...new Set(list.map(cleanSeriesName).filter(Boolean))];
}

export const seriesOrderSchema = z
  .object({
    name: z.string().trim().min(1, 'Cần tên series').max(200),
    entries: z
      .array(z.object({ source: z.enum(['book', 'media']), id: z.number().int().positive() }).strict())
      .max(1000),
  })
  .strict();

/** Gộp series của sách (custom_fields.series) và media (media_items.series_name), kèm thứ tự đã lưu. */
export function createSeriesService(context) {
  const db = () => context.db;

  async function collect() {
    const groups = new Map();
    const add = (name, entry) => {
      const key = seriesKey(name);
      if (!key) return;
      if (!groups.has(key)) groups.set(key, { key, name: cleanSeriesName(name), entries: [] });
      groups.get(key).entries.push(entry);
    };

    const books = await db().all(
      `SELECT id, title, creator_author, main_category, media_type, status, rating, cover_image, release_year, custom_fields
       FROM items WHERE json_extract(custom_fields, '$.series') IS NOT NULL`,
    );
    for (const book of books) {
      for (const name of bookSeriesNames(book.custom_fields)) {
        add(name, {
          source: 'book',
          id: book.id,
          title: book.title,
          subtitle: book.creator_author,
          category: book.main_category,
          media_type: book.media_type,
          status: book.status,
          rating: book.rating,
          cover_image: book.cover_image,
          year: book.release_year,
        });
      }
    }

    const mediaDb = context.mediaDb;
    if (mediaDb?.open) {
      const media = await mediaDb.all(
        `SELECT id, title, category, status, rating, cover_image, series_name, season_current, season_total, start_year, finish_year
         FROM media_items WHERE series_name IS NOT NULL AND trim(series_name) <> ''`,
      );
      for (const item of media) {
        add(item.series_name, {
          source: 'media',
          id: item.id,
          title: item.title,
          subtitle: item.season_current ? `Season ${item.season_current}${item.season_total ? `/${item.season_total}` : ''}` : null,
          category: item.category,
          media_type: null,
          status: item.status,
          rating: item.rating,
          cover_image: item.cover_image,
          year: item.finish_year ?? item.start_year,
        });
      }
    }

    const positionRows = await db().all('SELECT series_key, source, item_id, position FROM series_positions');
    const positions = new Map(positionRows.map((row) => [`${row.series_key}|${row.source}|${row.item_id}`, row.position]));
    const collator = new Intl.Collator('vi', { numeric: true, sensitivity: 'base' });
    for (const group of groups.values()) {
      for (const entry of group.entries) entry.position = positions.get(`${group.key}|${entry.source}|${entry.id}`) ?? null;
      // Phần đã xếp đứng trước theo thứ tự đã lưu; phần chưa xếp đứng sau, theo năm rồi theo tên.
      group.entries.sort((a, b) => {
        if (a.position !== null || b.position !== null) {
          if (a.position === null) return 1;
          if (b.position === null) return -1;
          return a.position - b.position;
        }
        if ((a.year ?? 9999) !== (b.year ?? 9999)) return (a.year ?? 9999) - (b.year ?? 9999);
        return collator.compare(a.title, b.title);
      });
      group.book_count = group.entries.filter((entry) => entry.source === 'book').length;
      group.media_count = group.entries.length - group.book_count;
      group.ordered = group.entries.some((entry) => entry.position !== null);
    }
    return [...groups.values()].sort((a, b) => collator.compare(a.name, b.name));
  }

  return {
    async list() {
      return { data: await collect() };
    },

    /** Tác giả (tách theo dấu phẩy như thống kê) kèm các sách, sách xếp theo năm phát hành rồi theo tên. */
    async authors() {
      const collator = new Intl.Collator('vi', { numeric: true, sensitivity: 'base' });
      const groups = new Map();
      const books = await db().all(
        'SELECT id, title, creator_author, main_category, media_type, status, rating, cover_image, release_year, custom_fields FROM items',
      );
      for (const book of books) {
        for (const name of splitList(book.creator_author)) {
          const key = name.toLowerCase();
          if (!groups.has(key)) groups.set(key, { key, name, books: [] });
          groups.get(key).books.push({
            source: 'book',
            id: book.id,
            title: book.title,
            category: book.main_category,
            media_type: book.media_type,
            status: book.status,
            rating: book.rating,
            cover_image: book.cover_image,
            year: book.release_year,
            series: bookSeriesNames(book.custom_fields),
          });
        }
      }
      const result = [...groups.values()];
      for (const group of result) {
        group.books.sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999) || collator.compare(a.title, b.title));
        const rated = group.books.filter((book) => book.rating);
        group.count = group.books.length;
        group.finished = group.books.filter((book) => book.status === 'Finished').length;
        group.average_rating = rated.length ? Math.round((rated.reduce((sum, book) => sum + book.rating, 0) / rated.length) * 100) / 100 : null;
      }
      return { data: result.sort((a, b) => collator.compare(a.name, b.name)) };
    },

    /** Lưu thứ tự mới cho một series: entries là toàn bộ phần theo thứ tự mong muốn. */
    async saveOrder({ name, entries }) {
      const key = seriesKey(name);
      const group = (await collect()).find((entry) => entry.key === key);
      if (!group) throw new AppError(`Không có series "${name}"`, { status: 404, code: 'NOT_FOUND' });
      const known = new Set(group.entries.map((entry) => `${entry.source}|${entry.id}`));
      const unknown = entries.filter((entry) => !known.has(`${entry.source}|${entry.id}`));
      if (unknown.length) throw new ValidationError('Có phần không thuộc series này', unknown.map((entry) => ({ path: ['entries'], message: `${entry.source} #${entry.id}` })));
      await db().transaction(async () => {
        await db().run('DELETE FROM series_positions WHERE series_key = ?', [key]);
        for (const [index, entry] of entries.entries()) {
          await db().run('INSERT INTO series_positions (series_key, source, item_id, position) VALUES (?, ?, ?, ?)', [key, entry.source, entry.id, index + 1]);
        }
      })();
      return { data: (await collect()).find((entry) => entry.key === key) };
    },
  };
}
