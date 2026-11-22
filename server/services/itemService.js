import { splitAuthors } from '../models/itemModel.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';

// Dấu thanh tiếng Việt (huyền, sắc, ngã, hỏi, nặng) dạng combining sau khi tách NFD.
const TONE_MARKS = /[\u0300\u0301\u0303\u0309\u0323]/g;

/**
 * Khoá so trùng tên sách: không phân biệt hoa thường, dấu câu, ký hiệu, khoảng trắng thừa và vị trí đặt
 * dấu thanh (kiểu cũ "hoà", "thuỷ" và kiểu mới "hòa", "thủy" là một). Vẫn phân biệt có dấu và không dấu.
 * Cách làm: tách NFD, gỡ dấu thanh khỏi từng chữ rồi gắn lại ở cuối chữ theo thứ tự cố định.
 */
export function titleKey(value) {
  return String(value ?? '')
    .normalize('NFD')
    .toLocaleLowerCase('vi')
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((word) => word.replace(TONE_MARKS, '') + (word.match(TONE_MARKS) ?? []).sort().join(''))
    .join(' ')
    .normalize('NFC');
}

function assertProgressWithinTotal(item) {
  if (item.total_units !== null && item.total_units !== undefined && item.current_unit > item.total_units) {
    throw new ValidationError('current_unit không được lớn hơn total_units', [
      { path: ['current_unit'], message: `Tối đa ${item.total_units}` },
    ]);
  }
}

const READ_STATUSES = ['Reading', 'Finished', 'DNF'];

export function createItemService(context) {
  const { db, models } = context;
  const { items, libraryCards } = models;

  async function getOrThrow(id) {
    const item = await items.findById(id);
    if (!item) throw new NotFoundError('Item', id);
    return item;
  }

  /** Mỗi sách đã/đang đọc/bỏ dở luôn có ít nhất một lượt đọc (nguồn dữ liệu chung của lịch và thống kê). */
  async function ensureReading(item) {
    if (!READ_STATUSES.includes(item.status)) return;
    if ((await libraryCards.listByItem(item.id)).length === 0) await libraryCards.create(item.id, {});
  }

  return {
    list(filters) {
      return items.list(filters);
    },

    /** Chi tiết item kèm toàn bộ lượt đọc, phục vụ header + Vintage Library Card. */
    async getDetail(id) {
      const item = await getOrThrow(id);
      return { ...item, library_cards: await libraryCards.listByItem(id) };
    },

    getOrThrow,

    async create(data) {
      assertProgressWithinTotal({ current_unit: data.current_unit ?? 0, total_units: data.total_units ?? null });
      return db.transaction(async () => {
        const item = await items.create(data);
        await ensureReading(item);
        return item;
      })();
    },

    async update(id, patch) {
      const existing = await getOrThrow(id);
      assertProgressWithinTotal({ ...existing, ...patch });
      return db.transaction(async () => {
        const item = await items.update(id, patch);
        if (existing.status === 'TBR' && item.status !== 'TBR') await items.update(id, { from_tbr: 1 });
        await ensureReading(item);
        return items.findById(id);
      })();
    },

    /** TBR → đang đọc: tạo lượt đọc mới bắt đầu ở ngày chỉ định (mặc định hôm nay). */
    async startReading(id, date) {
      const item = await getOrThrow(id);
      if (item.status !== 'TBR') throw new ValidationError('Chỉ sách đang ở TBR mới bắt đầu đọc được', [{ path: ['status'], message: item.status }]);
      return db.transaction(async () => {
        await context.services.libraryCards.create(id, { start_date: date });
        await items.update(id, { from_tbr: 1 });
        return items.findById(id);
      })();
    },

    async delete(id) {
      const item = await items.findByIdInternal(id);
      if (!item || !(await items.delete(id))) throw new NotFoundError('Item', id);
      await context.services?.images?.removeAllForItem(item.sync_uid);
    },

    listTags() {
      return items.listTags();
    },

    /** Sách có tên trùng với `title` (theo titleKey), bỏ qua sách `excludeId` (đang sửa). */
    async titleMatches(title, excludeId) {
      const key = titleKey(title);
      if (!key) return [];
      const rows = await db.all('SELECT id, title, creator_author, main_category, status, release_year FROM items ORDER BY id');
      return rows.filter((row) => row.id !== excludeId && titleKey(row.title) === key);
    },

    /** Tác giả kèm số sách, tổng và theo từng thể loại; tên đã tách theo dấu phẩy/chấm phẩy. */
    async authorFacet() {
      const collator = new Intl.Collator('vi', { sensitivity: 'base' });
      const groups = new Map();
      const rows = await db.all("SELECT creator_author, main_category FROM items WHERE creator_author IS NOT NULL AND trim(creator_author) <> ''");
      for (const row of rows) {
        for (const name of new Set(splitAuthors(row.creator_author))) {
          const key = name.toLowerCase();
          if (!groups.has(key)) groups.set(key, { value: name, count: 0, categories: {} });
          const group = groups.get(key);
          group.count += 1;
          group.categories[row.main_category] = (group.categories[row.main_category] ?? 0) + 1;
        }
      }
      return [...groups.values()].sort((a, b) => b.count - a.count || collator.compare(a.value, b.value));
    },

    /** Tag kèm số sách, chỉ trong một thể loại chính (không truyền thì toàn thư viện). */
    tagsForCategory(category) {
      const value = typeof category === 'string' && category ? category : null;
      return db.all(
        `SELECT json_each.value AS tag, COUNT(*) AS count FROM items, json_each(items.tags)
         ${value ? 'WHERE items.main_category = ?' : ''}
         GROUP BY json_each.value COLLATE NOCASE ORDER BY count DESC, tag COLLATE NOCASE`,
        value ? [value] : [],
      );
    },

    /** { fandom: [pairing...] } lấy từ sách: pairing của các sách có fandom đó (sách crossover có mặt ở mọi fandom của nó). */
    async fandomPairings() {
      const rows = await db.all(
        `SELECT f.value AS fandom, p.value AS pairing, COUNT(*) AS count
         FROM items, json_each(items.fandoms) f, json_each(items.pairings) p
         GROUP BY f.value COLLATE NOCASE, p.value COLLATE NOCASE
         ORDER BY count DESC, p.value COLLATE NOCASE`,
      );
      const result = {};
      for (const row of rows) (result[row.fandom] ??= []).push(row.pairing);
      return result;
    },

    pairingsForFandoms(fandoms) {
      return items.listValues('pairings', { fandoms });
    },

    /** Giá trị đã nhập của các trường riêng dạng chữ (custom_fields), dùng làm danh sách chọn trong form. */
    async customValues() {
      const rows = await db.all(
        `SELECT f.key AS slug, v.value AS value, COUNT(*) AS count
         FROM items, json_each(items.custom_fields) f,
              json_each(CASE WHEN f.type = 'array' THEN f.value ELSE json_array(f.value) END) v
         WHERE v.type = 'text' AND trim(v.value) <> ''
         GROUP BY f.key, v.value COLLATE NOCASE
         ORDER BY count DESC, v.value COLLATE NOCASE`,
      );
      const result = {};
      for (const row of rows) (result[row.slug] ??= []).push(row.value);
      return result;
    },

    /** Dữ liệu cho bộ lọc: số sách theo thể loại/trạng thái, các năm đã đọc, khoảng năm phát hành, tags. */
    async facets() {
      const countBy = async (column) => {
        const rows = await db.all(`SELECT ${column} AS key, COUNT(*) AS count FROM items GROUP BY ${column}`);
        return Object.fromEntries(rows.map((row) => [row.key, row.count]));
      };
      return {
        total: await db.get('SELECT COUNT(*) FROM items', undefined, { pluck: true }),
        categories: await countBy('main_category'),
        statuses: await countBy('status'),
        read_years: await db.all(
          `SELECT DISTINCT year FROM (
             SELECT COALESCE(CAST(strftime('%Y', COALESCE(finish_date, start_date)) AS INTEGER), finish_year) AS year FROM library_cards
           ) WHERE year IS NOT NULL ORDER BY year DESC`,
          undefined,
          { pluck: true },
        ),
        release_years: await db.get('SELECT MIN(release_year) AS min, MAX(release_year) AS max FROM items'),
        release_year_list: await db.all(
          'SELECT DISTINCT release_year FROM items WHERE release_year IS NOT NULL ORDER BY release_year DESC',
          undefined,
          { pluck: true },
        ),
        tags: await items.listTags(),
        fandoms: await items.listValues('fandoms'),
        topics: await items.listValues('topics'),
        tropes: await items.listValues('tropes'),
        warnings: await items.listValues('warnings'),
        formats: await db.all(
          `SELECT main_category AS category, format AS value, COUNT(*) AS count FROM items
           WHERE format IS NOT NULL AND trim(format) <> '' GROUP BY main_category, format COLLATE NOCASE ORDER BY count DESC, format COLLATE NOCASE`,
        ),
        custom_values: await this.customValues(),
        pairings: await items.listValues('pairings'),
        authors: await this.authorFacet(),
        needs_review: await db.get('SELECT COUNT(*) FROM items WHERE import_issues IS NOT NULL', undefined, { pluck: true }),
        favorites: await db.get('SELECT COUNT(*) FROM items WHERE is_favorite = 1', undefined, { pluck: true }),
      };
    },
  };
}
