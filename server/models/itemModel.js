import { randomUUID } from 'node:crypto';
import { buildSetClause, escapeLike, fromDbRow, nowIso, toDbParams } from '../utils/sql.js';

export const ITEM_JSON_FIELDS = ['tags', 'pairings', 'fandoms', 'tropes', 'topics', 'warnings'];
export const ITEM_BOOLEAN_FIELDS = ['is_favorite'];

export const ITEM_WRITABLE_COLUMNS = [
  'title',
  'creator_author',
  'media_type',
  'main_category',
  'format',
  'unit_type',
  'total_units',
  'current_unit',
  'word_count',
  'volume_count',
  'status',
  'release_year',
  'language',
  'rating',
  'is_favorite',
  'cover_image',
  'tags',
  'pairings',
  'fandoms',
  'tropes',
  'topics',
  'warnings',
  'obsidian_path',
  'spine_image',
  'review_date',
  'spice_rating',
  'obsidian_extra',
  'custom_fields',
  'sync_uid',
  'sync_db_hash',
  'sync_file_hash',
  'obsidian_media_dir',
  'ownership',
  'release_date',
  'from_tbr',
  'import_issues',
];

// Trường nội bộ của sync engine, không trả ra API.
const INTERNAL_FIELDS = ['sync_db_hash', 'sync_file_hash', 'obsidian_media_dir'];

const SORT_COLUMNS = {
  title: 'i.title COLLATE NOCASE',
  created_at: 'i.created_at',
  updated_at: 'i.updated_at',
  release_year: 'i.release_year',
  rating: 'i.rating',
  last_read_date: 'last_read_date',
  review_date: 'i.review_date',
};

// Các trường dẫn xuất từ library_cards, dùng chung cho list và detail.
const SELECT_WITH_DERIVED = `
  SELECT
    i.*,
    (SELECT COUNT(*) FROM library_cards lc WHERE lc.item_id = i.id) AS read_count,
    (SELECT COUNT(*) FROM library_cards lc WHERE lc.item_id = i.id AND lc.finish_date IS NOT NULL) AS finished_read_count,
    (SELECT MAX(COALESCE(lc.finish_date, lc.start_date)) FROM library_cards lc WHERE lc.item_id = i.id) AS last_read_date
  FROM items i
`;

function computeProgress(item) {
  if (item.total_units && item.total_units > 0) {
    return Math.round((Math.min(item.current_unit, item.total_units) / item.total_units) * 1000) / 10;
  }
  return item.status === 'Finished' ? 100 : 0;
}

function parseJsonObject(value) {
  try {
    const parsed = JSON.parse(value ?? '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(value ?? 'null');
    return Array.isArray(parsed) && parsed.length ? parsed : null;
  } catch {
    return null;
  }
}

function serialize(data) {
  const params = toDbParams(data, { jsonFields: ITEM_JSON_FIELDS, booleanFields: ITEM_BOOLEAN_FIELDS });
  if (data.obsidian_extra !== undefined) params.obsidian_extra = JSON.stringify(data.obsidian_extra ?? {});
  if (data.import_issues !== undefined) params.import_issues = data.import_issues?.length ? JSON.stringify(data.import_issues) : null;
  if (data.custom_fields !== undefined) params.custom_fields = JSON.stringify(data.custom_fields ?? {});
  return params;
}

function hydrate(row, { includeInternal = false } = {}) {
  const item = fromDbRow(row, { jsonFields: ITEM_JSON_FIELDS, booleanFields: ITEM_BOOLEAN_FIELDS });
  if (!item) return null;
  if ('obsidian_extra' in item) item.obsidian_extra = parseJsonObject(item.obsidian_extra);
  if ('custom_fields' in item) item.custom_fields = parseJsonObject(item.custom_fields);
  if ('import_issues' in item) item.import_issues = parseJsonArray(item.import_issues);
  if (!includeInternal) for (const field of INTERNAL_FIELDS) delete item[field];
  if ('read_count' in item) {
    // Mọi lượt đọc sau lượt đầu tiên đều là re-read, kể cả lượt đang đọc dở.
    item.reread_count = Math.max(item.read_count - 1, 0);
  }
  item.progress_percent = computeProgress(item);
  return item;
}

function asList(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function buildWhere(filters) {
  const where = [];
  const params = {};

  if (filters.q) {
    where.push(`(i.title LIKE @q ESCAPE '\\' OR i.creator_author LIKE @q ESCAPE '\\')`);
    params.q = `%${escapeLike(filters.q)}%`;
  }

  const enumFilters = [
    ['status', 'i.status'],
    ['main_category', 'i.main_category'],
    ['media_type', 'i.media_type'],
  ];
  for (const [key, column] of enumFilters) {
    const values = asList(filters[key]);
    if (values.length === 0) continue;
    const placeholders = values.map((value, index) => {
      params[`${key}_${index}`] = value;
      return `@${key}_${index}`;
    });
    where.push(`${column} IN (${placeholders.join(', ')})`);
  }

  // Nhiều tag/fandom/pairing = điều kiện AND: item phải có đủ tất cả giá trị được chọn.
  for (const [key, column] of [['tag', 'i.tags'], ['fandom', 'i.fandoms'], ['pairing', 'i.pairings'], ['topic', 'i.topics']]) {
    asList(filters[key]).forEach((value, index) => {
      params[`${key}_${index}`] = value;
      where.push(`EXISTS (SELECT 1 FROM json_each(${column}) WHERE json_each.value = @${key}_${index} COLLATE NOCASE)`);
    });
  }

  if (filters.rating_min !== undefined) {
    where.push('i.rating >= @rating_min');
    params.rating_min = filters.rating_min;
  }
  if (filters.unrated) where.push('(i.rating IS NULL OR i.rating = 0)');

  if (filters.release_year !== undefined) {
    where.push('i.release_year = @release_year');
    params.release_year = filters.release_year;
  }
  if (filters.release_year_from !== undefined) {
    where.push('i.release_year >= @release_year_from');
    params.release_year_from = filters.release_year_from;
  }
  if (filters.release_year_to !== undefined) {
    where.push('i.release_year <= @release_year_to');
    params.release_year_to = filters.release_year_to;
  }

  // "Năm đọc": năm hoàn thành của bất kỳ lượt đọc nào; lượt chưa xong thì lấy năm bắt đầu.
  if (filters.read_year !== undefined) {
    where.push(`EXISTS (
      SELECT 1 FROM library_cards lc
      WHERE lc.item_id = i.id
        AND COALESCE(CAST(strftime('%Y', COALESCE(lc.finish_date, lc.start_date)) AS INTEGER), lc.finish_year) = @read_year
    )`);
    params.read_year = filters.read_year;
  }

  if (filters.needs_review) where.push('i.import_issues IS NOT NULL');

  if (filters.is_favorite !== undefined) {
    where.push('i.is_favorite = @is_favorite');
    params.is_favorite = filters.is_favorite ? 1 : 0;
  }

  return { clause: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

const SQL_FIND_BY_ID = `${SELECT_WITH_DERIVED} WHERE i.id = ?`;
const SQL_FIND_BY_OBSIDIAN_PATH = `${SELECT_WITH_DERIVED} WHERE i.obsidian_path = ?`;
const SQL_FIND_BY_SYNC_UID = `${SELECT_WITH_DERIVED} WHERE i.sync_uid = ?`;
const SQL_LIST_ALL = `${SELECT_WITH_DERIVED} ORDER BY i.id`;
const SQL_DELETE = 'DELETE FROM items WHERE id = ?';
const SQL_EXISTS = 'SELECT 1 FROM items WHERE id = ?';
const SQL_TAGS = `SELECT json_each.value AS tag, COUNT(*) AS count
   FROM items, json_each(items.tags)
   GROUP BY json_each.value COLLATE NOCASE
   ORDER BY count DESC, tag COLLATE NOCASE`;

export function createItemModel(db) {
  return {
    async findById(id) {
      return hydrate(await db.get(SQL_FIND_BY_ID, [id]));
    },

    /** Bản đầy đủ kèm hash sync, chỉ dùng nội bộ cho sync engine. */
    async findByIdInternal(id) {
      return hydrate(await db.get(SQL_FIND_BY_ID, [id]), { includeInternal: true });
    },

    async listAllInternal() {
      const rows = await db.all(SQL_LIST_ALL);
      return rows.map((row) => hydrate(row, { includeInternal: true }));
    },

    async findBySyncUid(syncUid) {
      return hydrate(await db.get(SQL_FIND_BY_SYNC_UID, [syncUid]), { includeInternal: true });
    },

    async findByObsidianPath(obsidianPath) {
      return hydrate(await db.get(SQL_FIND_BY_OBSIDIAN_PATH, [obsidianPath]));
    },

    async exists(id) {
      return (await db.get(SQL_EXISTS, [id], { pluck: true })) === 1;
    },

    async list(filters = {}) {
      const { clause, params } = buildWhere(filters);
      const sortColumn = SORT_COLUMNS[filters.sort] ?? SORT_COLUMNS.updated_at;
      const direction = filters.order === 'asc' ? 'ASC' : 'DESC';
      const limit = filters.limit ?? 50;
      const offset = filters.offset ?? 0;

      const total = await db.get(`SELECT COUNT(*) FROM items i ${clause}`, params, { pluck: true });
      const rows = await db.all(
        `${SELECT_WITH_DERIVED} ${clause}
         ORDER BY ${sortColumn} IS NULL, ${sortColumn} ${direction}, i.id ${direction}
         LIMIT @limit OFFSET @offset`,
        { ...params, limit, offset },
      );

      return { data: rows.map((row) => hydrate(row)), total, limit, offset };
    },

    async create(data) {
      const params = serialize({ ...data, sync_uid: data.sync_uid ?? randomUUID() });
      const columns = Object.keys(params).filter((key) => ITEM_WRITABLE_COLUMNS.includes(key));
      const timestamp = nowIso();
      const info = await db.run(
        `INSERT INTO items (${[...columns, 'created_at', 'updated_at'].join(', ')})
         VALUES (${[...columns.map((c) => `@${c}`), '@created_at', '@updated_at'].join(', ')})`,
        { ...params, created_at: timestamp, updated_at: timestamp },
      );
      return this.findById(info.lastInsertRowid);
    },

    async update(id, patch) {
      const params = serialize(patch);
      const { columns, clause } = buildSetClause(params, ITEM_WRITABLE_COLUMNS);
      if (columns.length === 0) return this.findById(id);
      const picked = Object.fromEntries(columns.map((c) => [c, params[c]]));
      await db.run(`UPDATE items SET ${clause}, updated_at = @updated_at WHERE id = @id`, {
        ...picked,
        updated_at: nowIso(),
        id,
      });
      return this.findById(id);
    },

    /** Ghi trạng thái sync mà không đổi updated_at (để không bị coi là "app vừa sửa"). */
    async setSyncState(id, { obsidian_path, sync_db_hash, sync_file_hash, obsidian_media_dir }) {
      await db.run('UPDATE items SET obsidian_path = ?, sync_db_hash = ?, sync_file_hash = ? WHERE id = ?', [
        obsidian_path,
        sync_db_hash,
        sync_file_hash,
        id,
      ]);
      if (obsidian_media_dir !== undefined) {
        await db.run('UPDATE items SET obsidian_media_dir = ? WHERE id = ?', [obsidian_media_dir, id]);
      }
    },

    /** Thư mục ảnh của sách trong vault (_attachments/<tên>), không đổi updated_at. */
    async setMediaDir(id, dir) {
      await db.run('UPDATE items SET obsidian_media_dir = ? WHERE id = ?', [dir, id]);
    },

    async touch(id) {
      await db.run('UPDATE items SET updated_at = ? WHERE id = ?', [nowIso(), id]);
    },

    async delete(id) {
      return (await db.run(SQL_DELETE, [id])).changes > 0;
    },

    listTags() {
      return db.all(SQL_TAGS);
    },

    /** Giá trị kèm số sách cho một cột danh sách JSON (fandoms, pairings...). */
    listValues(column, { fandoms = [] } = {}) {
      if (!['fandoms', 'pairings', 'tropes', 'topics', 'warnings'].includes(column)) throw new Error(`Cột ${column} không hỗ trợ`);
      // Lọc theo fandom (AND): chỉ đếm sách có đủ mọi fandom đã chọn.
      const where = fandoms.map(() => 'EXISTS (SELECT 1 FROM json_each(items.fandoms) fd WHERE fd.value = ? COLLATE NOCASE)');
      return db.all(
        `SELECT json_each.value AS value, COUNT(*) AS count FROM items, json_each(items.${column})
         ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
         GROUP BY json_each.value COLLATE NOCASE ORDER BY count DESC, value COLLATE NOCASE`,
        fandoms,
      );
    },
  };
}
