/**
 * Xuất dữ liệu cục bộ thành các "đơn vị đồng bộ" cho Google Drive (Phiên 5).
 *
 * Quy tắc gộp A: mỗi quyển sách (dòng items cùng library_cards, reading_logs, reading_notes, quotes) là một
 * đơn vị; media tương tự (media_items cùng media_watch_cards, media_notes). Các bảng còn lại:
 *  - challenge (kèm slot) và bracket: mỗi bản ghi một đơn vị.
 *  - goals, monthly_favorites, series_positions: mỗi bảng một khối, vì có khoá tự nhiên UNIQUE
 *    (year+metric, year+month+item) nên gộp từng dòng dễ vỡ ràng buộc khi hai máy cùng tạo.
 *  - app_settings: mỗi key một đơn vị (key ổn định giữa các máy nên dùng làm định danh).
 *
 * Dữ liệu trong đơn vị không chứa id tự tăng: mọi tham chiếu tới sách/media đổi sang sync_uid, vì
 * cùng một bản ghi có id khác nhau trên hai máy. Cột riêng của từng máy (đường dẫn Obsidian, hash
 * sync Obsidian) bị bỏ ra.
 *
 * Hash của đơn vị KHÔNG tính `updated_at`: trigger "touch" của migration 015 có thể đóng mốc mới khi
 * dữ liệu không đổi; nếu tính vào hash thì hai máy sẽ đẩy qua đẩy lại vô hạn. `updated_at` chỉ dùng
 * để phân xử khi cùng một đơn vị bị sửa ở cả hai nơi.
 */

export const LOCAL_SETTING_KEYS = ['drive_sync_state'];

const ITEM_LOCAL_COLUMNS = ['id', 'obsidian_path', 'sync_db_hash', 'sync_file_hash', 'obsidian_media_dir'];

/** Bảng con -> khoá đơn vị cha, dùng để tính mốc sửa khi dòng con bị xoá. */
export const CHILD_TABLES = {
  books: ['library_cards', 'reading_logs', 'reading_notes', 'quotes', 'challenge_slots'],
  media: ['media_watch_cards', 'media_notes'],
};

/** Bảng cha -> tiền tố khoá đơn vị, dùng để đổi sync_deletions thành dấu xoá đơn vị. */
export const DELETION_KINDS = {
  books: { items: 'book', challenges: 'challenge', brackets: 'bracket', app_settings: 'setting' },
  media: { media_items: 'media' },
};

const omit = (row, keys) => {
  const copy = { ...row };
  for (const key of keys) delete copy[key];
  return copy;
};

const byUid = (a, b) => String(a.sync_uid).localeCompare(String(b.sync_uid));

function groupBy(rows, field) {
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row[field])) map.set(row[field], []);
    map.get(row[field]).push(row);
  }
  return map;
}

function parseJson(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

/** Mốc lớn nhất của updated_at/created_at ở mọi tầng của dữ liệu đơn vị. */
function latestStamp(value, current = '') {
  if (Array.isArray(value)) return value.reduce((max, entry) => latestStamp(entry, max), current);
  if (value && typeof value === 'object') {
    let max = current;
    for (const [key, entry] of Object.entries(value)) {
      if ((key === 'updated_at' || key === 'created_at') && typeof entry === 'string' && entry > max) max = entry;
      else if (entry && typeof entry === 'object') max = latestStamp(entry, max);
    }
    return max;
  }
  return current;
}

/** JSON với khoá sắp theo thứ tự, bỏ updated_at — đầu vào của hash. */
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .filter((key) => key !== 'updated_at' && value[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

export async function sha256(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

// Ảnh/file trong dữ liệu: sách là /media/<đường dẫn store>, media là /api/media/files/<đường dẫn store>.
const BOOK_FILE = /\/media\/((?:items|app)\/[^"'\s)\\?#<>]+)/g;
const MEDIA_FILE = /\/api\/media\/files\/(items\/[^"'\s)\\?#<>]+)/g;

function decode(segment) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/** Khoá file ('books/items/<uid>/cover-1.webp', 'media/items/...') mà dữ liệu đơn vị tham chiếu tới. */
export function fileRefs(data) {
  const text = JSON.stringify(data);
  const refs = new Set();
  for (const match of text.matchAll(MEDIA_FILE)) refs.add(`media/${decode(match[1])}`);
  // Bỏ phần /api/media/files/ đã khớp ở trên để không bị coi nhầm là file của sách.
  for (const match of text.replace(MEDIA_FILE, '').matchAll(BOOK_FILE)) refs.add(`books/${decode(match[1])}`);
  return [...refs].filter((key) => !key.split('/').includes('..'));
}

/**
 * Đọc toàn bộ dữ liệu cục bộ thành Map<khoá, { key, kind, title, data, updated_at, hash, children }>.
 * `children` là danh sách sync_uid của dòng con, để biết việc xoá dòng con thuộc về đơn vị nào.
 */
export async function exportUnits({ db, mediaDb }) {
  const units = new Map();
  const add = (key, kind, title, data, children = []) => units.set(key, { key, kind, title, data, children, updated_at: latestStamp(data) || null });

  // --- Media (DB riêng) ---
  const mediaUid = new Map();
  if (mediaDb) {
    const items = await mediaDb.all('SELECT * FROM media_items ORDER BY id');
    const cards = groupBy(await mediaDb.all('SELECT * FROM media_watch_cards'), 'media_id');
    const notes = groupBy(await mediaDb.all('SELECT * FROM media_notes'), 'media_id');
    for (const item of items) {
      mediaUid.set(item.id, item.sync_uid);
      const cardRows = (cards.get(item.id) ?? []).map((row) => omit(row, ['id', 'media_id'])).sort(byUid);
      const note = notes.get(item.id)?.[0];
      const data = { item: omit(item, ITEM_LOCAL_COLUMNS), cards: cardRows, note: note ? omit(note, ['media_id']) : null };
      add(`media:${item.sync_uid}`, 'media', item.title, data, [...cardRows.map((row) => row.sync_uid), ...(note ? [note.sync_uid] : [])]);
    }
  }

  // --- Sách ---
  const bookUid = new Map();
  const items = await db.all('SELECT * FROM items ORDER BY id');
  const cards = groupBy(await db.all('SELECT * FROM library_cards'), 'item_id');
  const logs = groupBy(await db.all('SELECT * FROM reading_logs'), 'item_id');
  const notes = groupBy(await db.all('SELECT * FROM reading_notes'), 'item_id');
  // Bảng quotes có từ schema v16; DB cũ hơn (chưa migrate) thì coi như không có quotes.
  const hasQuotes = Boolean(await db.get("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'quotes'", undefined, { pluck: true }));
  const quotes = groupBy(hasQuotes ? await db.all('SELECT * FROM quotes') : [], 'item_id');
  for (const item of items) {
    bookUid.set(item.id, item.sync_uid);
    const strip = (rows) => (rows ?? []).map((row) => omit(row, ['id', 'item_id'])).sort(byUid);
    const note = notes.get(item.id)?.[0];
    const data = {
      item: omit(item, ITEM_LOCAL_COLUMNS),
      cards: strip(cards.get(item.id)),
      logs: strip(logs.get(item.id)),
      note: note ? omit(note, ['id', 'item_id']) : null,
    };
    // Chỉ thêm khoá `quotes` khi sách có quote: sách không có quote giữ nguyên hash như trước patch 6,
    // nên lần đồng bộ đầu sau khi cập nhật không phải đẩy lại toàn bộ thư viện.
    const quoteRows = strip(quotes.get(item.id));
    if (quoteRows.length) data.quotes = quoteRows;
    const children = [...data.cards, ...data.logs, ...(data.note ? [data.note] : []), ...quoteRows].map((row) => row.sync_uid);
    add(`book:${item.sync_uid}`, 'book', item.title, data, children);
  }
  const uidOf = (id) => (id == null ? null : bookUid.get(id) ?? null);

  // --- Challenge + slot ---
  const slots = groupBy(await db.all('SELECT * FROM challenge_slots'), 'challenge_id');
  for (const challenge of await db.all('SELECT * FROM challenges ORDER BY id')) {
    const slotRows = (slots.get(challenge.id) ?? [])
      .map((row) => ({ ...omit(row, ['id', 'challenge_id', 'item_id']), item_uid: uidOf(row.item_id) }))
      .sort((a, b) => a.position - b.position);
    add(`challenge:${challenge.sync_uid}`, 'challenge', challenge.name, { challenge: omit(challenge, ['id']), slots: slotRows }, slotRows.map((row) => row.sync_uid));
  }

  // --- Bracket: entries là mảng item_id, picks là { "vòng-trận": item_id } ---
  for (const bracket of await db.all('SELECT * FROM brackets ORDER BY id')) {
    const entries = parseJson(bracket.entries, []).map((id) => uidOf(id));
    const picks = Object.fromEntries(Object.entries(parseJson(bracket.picks, {})).map(([slot, id]) => [slot, uidOf(id)]));
    add(`bracket:${bracket.sync_uid}`, 'bracket', bracket.name, { bracket: { ...omit(bracket, ['id']), entries, picks } });
  }

  // --- Khối: goals, monthly_favorites, series_positions ---
  const goals = (await db.all('SELECT * FROM goals')).map((row) => omit(row, ['id']));
  goals.sort((a, b) => a.year - b.year || String(a.metric).localeCompare(String(b.metric)));
  add('goals', 'collection', 'Mục tiêu đọc', { rows: goals });

  const favorites = (await db.all('SELECT * FROM monthly_favorites'))
    .map((row) => ({ ...omit(row, ['item_id']), item_uid: uidOf(row.item_id) }))
    .filter((row) => row.item_uid);
  favorites.sort((a, b) => a.year - b.year || a.month - b.month || a.position - b.position || a.item_uid.localeCompare(b.item_uid));
  add('monthly_favorites', 'collection', 'Yêu thích theo tháng', { rows: favorites });

  const positions = (await db.all('SELECT * FROM series_positions'))
    .map((row) => ({ ...omit(row, ['item_id']), item_uid: (row.source === 'media' ? mediaUid.get(row.item_id) : bookUid.get(row.item_id)) ?? null }))
    .filter((row) => row.item_uid);
  positions.sort((a, b) => a.series_key.localeCompare(b.series_key) || a.source.localeCompare(b.source) || a.position - b.position || a.item_uid.localeCompare(b.item_uid));
  add('series_positions', 'collection', 'Thứ tự series', { rows: positions });

  // --- Cài đặt: mỗi key một đơn vị ---
  for (const row of await db.all('SELECT * FROM app_settings ORDER BY key')) {
    if (LOCAL_SETTING_KEYS.includes(row.key)) continue;
    let { value } = row;
    if (row.key === 'general') {
      // app_icon_ico là file .ico cho lối tắt Desktop, chỉ bản Windows có: giữ riêng từng máy.
      const parsed = parseJson(value, {});
      delete parsed.app_icon_ico;
      value = JSON.stringify(parsed);
    }
    add(`setting:${row.key}`, 'setting', row.key, { key: row.key, value, updated_at: row.updated_at ?? null });
  }

  for (const unit of units.values()) unit.hash = await sha256(canonical(unit.data));
  return units;
}

/** Dấu xoá cục bộ: { units: Map<khoá, deleted_at>, children: Map<sync_uid dòng con, deleted_at> }. */
export async function readLocalDeletions({ db, mediaDb }) {
  const units = new Map();
  const children = new Map();
  const keep = (map, key, at) => {
    if (!map.has(key) || map.get(key) < at) map.set(key, at);
  };
  const sources = [
    [db, 'sync_deletions', 'books'],
    [mediaDb, 'media_sync_deletions', 'media'],
  ];
  for (const [handle, table, side] of sources) {
    if (!handle) continue;
    for (const row of await handle.all(`SELECT table_name, sync_uid, deleted_at FROM ${table}`)) {
      const kind = DELETION_KINDS[side][row.table_name];
      if (kind) {
        if (kind === 'setting' && LOCAL_SETTING_KEYS.includes(row.sync_uid)) continue;
        keep(units, `${kind}:${row.sync_uid}`, row.deleted_at);
      } else if (CHILD_TABLES[side].includes(row.table_name)) {
        keep(children, row.sync_uid, row.deleted_at);
      }
    }
  }
  return { units, children };
}
