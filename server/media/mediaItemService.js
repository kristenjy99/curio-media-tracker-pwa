import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { z } from 'zod';
import { detectImageType } from '../services/imageService.js';
import { joinStorePath } from '../storage/fileStore.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';

export const MEDIA_CATEGORIES = ['tv_series', 'movie', 'animation', 'youtube', 'short_drama'];
export const MEDIA_STATUSES = ['TBW', 'Watching', 'Finished', 'DNF'];
export const FILES_URL_PREFIX = '/api/media/files/';

const rating = z.number().min(0).max(5).multipleOf(0.5).nullable();
const progress = {
  progress_current: z.number().int().min(0).max(100000),
  progress_total: z.number().int().min(0).max(100000).nullable(),
};
const uniqueList = (max, each = 100) =>
  z
    .array(z.string().trim().min(1).max(each))
    .max(max)
    .transform((list) => list.filter((g, i) => list.findIndex((o) => o.toLowerCase() === g.toLowerCase()) === i));
const optionalText = (max) => z.string().trim().max(max).nullable().transform((v) => v || null);
const httpUrlOrNull = z
  .string()
  .trim()
  .max(2000)
  .nullable()
  .transform((v) => v || null)
  .refine((v) => v === null || /^https?:\/\/\S+$/i.test(v), 'Link phải bắt đầu bằng http:// hoặc https://');

const base = {
  title: z.string().trim().min(1, 'Tên không được để trống').max(300),
  category: z.enum(MEDIA_CATEGORIES),
  status: z.enum(MEDIA_STATUSES),
  rating,
  ...progress,
  // Series chung cho mọi category; season là "hiện tại / tổng" (ví dụ 10/10, 9/10, 5/15).
  series_name: z.string().trim().max(200).nullable().transform((v) => v || null),
  season_current: z.number().int().min(0).max(10000).nullable(),
  season_total: z.number().int().min(0).max(10000).nullable(),
  genres: z
    .array(z.string().trim().min(1).max(50))
    .max(30)
    .transform((list) => list.filter((g, i) => list.findIndex((o) => o.toLowerCase() === g.toLowerCase()) === i)),
  countries: z
    .array(z.string().trim().min(1).max(60))
    .max(30)
    .transform((list) => list.filter((g, i) => list.findIndex((o) => o.toLowerCase() === g.toLowerCase()) === i)),
  is_favorite: z.boolean(),
  start_year: z.number().int().min(1900).max(3000).nullable(),
  finish_year: z.number().int().min(1900).max(3000).nullable(),
  youtube_channel: optionalText(200),
  cast_members: uniqueList(100, 120),
  studios: uniqueList(30, 120),
  platforms: uniqueList(30, 80),
  // Số tập của từng season theo thứ tự season 1, 2, ...; null = chưa biết số tập của season đó.
  episodes_per_season: z.array(z.number().int().min(0).max(100000).nullable()).max(500),
  language: optionalText(60),
  trailer_url: httpUrlOrNull,
  // Link ảnh ngoài (http/https). Ảnh tải từ máy đi qua PUT /items/:id/cover.
  cover_image: httpUrlOrNull,
  warnings: uniqueList(50, 100),
  topics: uniqueList(50, 100),
};
const OPTIONAL_KEYS = Object.fromEntries(Object.keys(base).filter((key) => key !== 'title' && key !== 'category').map((key) => [key, true]));
export const createSchema = z.object(base).partial(OPTIONAL_KEYS).strict();
export const updateSchema = z.object(base).partial().strict();
export const listSchema = z.object({
  category: z.enum(MEDIA_CATEGORIES).optional(),
  status: z.enum(MEDIA_STATUSES).optional(),
  q: z.string().trim().max(200).optional(),
  genre: z.string().trim().max(50).optional(),
  favorite: z.enum(['1']).optional(),
});

const JSON_COLUMNS = ['genres', 'countries', 'cast_members', 'studios', 'platforms', 'episodes_per_season', 'warnings', 'topics'];
const COLUMNS =
  'id, sync_uid, title, category, status, rating, cover_image, progress_current, progress_total, series_name, season_current, season_total, genres, countries, is_favorite, start_year, finish_year, youtube_channel, cast_members, studios, platforms, episodes_per_season, language, trailer_url, warnings, topics, obsidian_path, obsidian_media_dir, sync_db_hash, sync_file_hash, created_at, updated_at';
const DEFAULTS = { status: 'TBW', rating: null, progress_current: 0, progress_total: null, series_name: null, season_current: null, season_total: null, genres: [], countries: [], is_favorite: false, start_year: null, finish_year: null, youtube_channel: null, cast_members: [], studios: [], platforms: [], episodes_per_season: [], language: null, trailer_url: null, cover_image: null, warnings: [], topics: [] };
// Danh sách gợi ý cho các ô nhập (giá trị đã từng nhập ở media khác).
const VALUE_COLUMNS = ['cast_members', 'studios', 'platforms', 'warnings', 'topics', 'genres', 'countries'];

/**
 * CRUD cho media_items và ảnh bìa (lưu ở <storage>/media/uploads/items/<sync_uid>/).
 * Dùng interface Db async và FileStore giống phía sách, xem server/db/async.js và server/storage/fileStore.js.
 */
export function createMediaItemService({ db, storagePaths, fileStore }) {
  const uploadsDir = storagePaths?.mediaUploadsDir ?? null;

  const hydrate = (row) => {
    if (!row) return row;
    const out = { ...row, is_favorite: row.is_favorite === 1 };
    for (const key of JSON_COLUMNS) out[key] = JSON.parse(row[key] ?? '[]');
    return out;
  };
  const toDb = (value) => (Array.isArray(value) ? JSON.stringify(value) : typeof value === 'boolean' ? Number(value) : value);
  const get = async (id) => hydrate(await db.get(`SELECT ${COLUMNS} FROM media_items WHERE id = ?`, [id]));
  const require = async (id) => {
    const row = await get(id);
    if (!row) throw new NotFoundError('Media', id);
    return row;
  };
  const withDefaults = (data) => ({ ...DEFAULTS, ...data });
  const checkProgress = (row) => {
    if (row.progress_total !== null && row.progress_current > row.progress_total) {
      throw new ValidationError('Số tập đã xem không được lớn hơn tổng số tập', [{ path: ['progress_current'], message: 'Lớn hơn tổng số tập' }]);
    }
  };
  const checkSeason = (row) => {
    if (row.season_total !== null && row.season_current !== null && row.season_current > row.season_total) {
      throw new ValidationError('Season hiện tại không được lớn hơn tổng số season', [{ path: ['season_current'], message: 'Lớn hơn tổng số season' }]);
    }
  };
  const checkYears = (row) => {
    if (row.start_year !== null && row.finish_year !== null && row.finish_year < row.start_year) {
      throw new ValidationError('Năm xem xong không được nhỏ hơn năm bắt đầu', [{ path: ['finish_year'], message: 'Nhỏ hơn năm bắt đầu' }]);
    }
  };
  /** URL /api/media/files/... -> đường dẫn tương đối trong store, hoặc null nếu trỏ ra ngoài. */
  const toStorePath = (url) => {
    if (typeof url !== 'string' || !url.startsWith(FILES_URL_PREFIX)) return null;
    const parts = url.slice(FILES_URL_PREFIX.length).split('/').map(decodeURIComponent);
    if (parts.some((part) => part === '..' || part === '')) return null;
    return joinStorePath(...parts);
  };
  // Giữ đồng bộ: chỉ là phép tính đường dẫn, và nơi dùng nó (sync media sang Obsidian) chỉ chạy trên Node.
  const toLocal = (url) => {
    const relative = toStorePath(url);
    if (!relative || !uploadsDir) return null;
    const absolute = path.resolve(uploadsDir, ...relative.split('/'));
    const back = path.relative(uploadsDir, absolute);
    return back && !back.startsWith('..') && !path.isAbsolute(back) ? absolute : null;
  };
  const removeFile = async (url) => {
    const relative = toStorePath(url);
    if (relative && fileStore) await fileStore.remove(relative);
  };

  return {
    async list(query = {}) {
      const { category, status, q, genre, favorite } = listSchema.parse(query);
      const where = [];
      const params = [];
      if (favorite) where.push('is_favorite = 1');
      if (category) (where.push('category = ?'), params.push(category));
      if (status) (where.push('status = ?'), params.push(status));
      if (genre) (where.push('EXISTS (SELECT 1 FROM json_each(media_items.genres) WHERE value = ? COLLATE NOCASE)'), params.push(genre));
      if (q) {
        where.push("(title LIKE ? ESCAPE '\\' OR series_name LIKE ? ESCAPE '\\')");
        const like = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
        params.push(like, like);
      }
      const sql = `SELECT ${COLUMNS} FROM media_items${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY updated_at DESC, id DESC`;
      return { items: (await db.all(sql, params)).map(hydrate) };
    },

    get: require,

    /** Thể loại đã dùng, gợi ý khi nhập và lọc. */
    async countryNames() {
      const rows = await db.all('SELECT DISTINCT value AS name FROM media_items, json_each(media_items.countries) ORDER BY value COLLATE NOCASE');
      return { countries: rows.map((r) => r.name) };
    },

    async genreNames() {
      const rows = await db.all('SELECT DISTINCT value AS name FROM media_items, json_each(media_items.genres) ORDER BY value COLLATE NOCASE');
      return { genres: rows.map((r) => r.name) };
    },

    /** Giá trị đã nhập của các trường danh sách và một số trường chữ, sắp theo số lần dùng. */
    async values() {
      const result = {};
      for (const column of VALUE_COLUMNS) {
        result[column] = await db.all(
          `SELECT value FROM media_items, json_each(media_items.${column}) GROUP BY value COLLATE NOCASE ORDER BY COUNT(*) DESC, value COLLATE NOCASE`,
          undefined,
          { pluck: true },
        );
      }
      for (const column of ['youtube_channel', 'language']) {
        result[column] = await db.all(
          `SELECT ${column} FROM media_items WHERE ${column} IS NOT NULL AND trim(${column}) <> '' GROUP BY ${column} COLLATE NOCASE ORDER BY COUNT(*) DESC, ${column} COLLATE NOCASE`,
          undefined,
          { pluck: true },
        );
      }
      return result;
    },

    /** Tên series đã có, dùng gợi ý khi nhập. */
    async seriesNames() {
      const rows = await db.all("SELECT DISTINCT series_name FROM media_items WHERE series_name IS NOT NULL ORDER BY series_name COLLATE NOCASE");
      return { series: rows.map((r) => r.series_name) };
    },

    async create(input) {
      const data = withDefaults(createSchema.parse(input));
      checkProgress(data);
      checkSeason(data);
      checkYears(data);
      const keys = ['title', 'category', ...Object.keys(DEFAULTS)];
      const info = await db.run(`INSERT INTO media_items (sync_uid, ${keys.join(', ')}) VALUES (?, ${keys.map(() => '?').join(', ')})`, [
        randomUUID(),
        ...keys.map((key) => toDb(data[key])),
      ]);
      return require(info.lastInsertRowid);
    },

    async update(id, input) {
      const current = await require(id);
      const patch = updateSchema.parse(input);
      const merged = { ...current, ...patch };
      checkProgress(merged);
      checkSeason(merged);
      checkYears(merged);
      const keys = Object.keys(patch);
      if (keys.length === 0) return current;
      // Đổi sang link ngoài hoặc xoá ảnh: gỡ file ảnh đã tải lên trước đó.
      if ('cover_image' in patch && patch.cover_image !== current.cover_image) await removeFile(current.cover_image);
      await db.run(
        `UPDATE media_items SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`,
        [...keys.map((k) => toDb(patch[k])), id],
      );
      return require(id);
    },

    async delete(id) {
      const item = await require(id);
      await db.run('DELETE FROM media_items WHERE id = ?', [id]);
      if (fileStore) await fileStore.removeDir(joinStorePath('items', item.sync_uid));
    },

    async setCover(id, buffer) {
      const item = await require(id);
      if (!fileStore) throw new ValidationError('Chưa có nơi lưu ảnh', []);
      const ext = detectImageType(buffer);
      if (!ext) throw new ValidationError('File không phải ảnh JPG, PNG, WebP, GIF hoặc AVIF', [{ path: ['file'], message: 'Sai định dạng' }]);
      const fileName = `cover-${Date.now()}.${ext}`;
      await fileStore.write(joinStorePath('items', item.sync_uid, fileName), buffer);
      await db.run("UPDATE media_items SET cover_image = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?", [
        `${FILES_URL_PREFIX}items/${item.sync_uid}/${fileName}`,
        id,
      ]);
      await removeFile(item.cover_image);
      return require(id);
    },

    async removeCover(id) {
      const item = await require(id);
      await removeFile(item.cover_image);
      await db.run("UPDATE media_items SET cover_image = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?", [id]);
      return require(id);
    },
  };
}
