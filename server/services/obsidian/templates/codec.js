import { isoDate } from '../../../validators/common.js';
import { createItemSchema } from '../../../validators/itemValidators.js';
import { SYSTEM_KEY, describeField } from './catalog.js';
import { appendGallery, bodyFromVault, bodyToVault, createMediaMapper, isMediaUrl, renderGallery, stripGallery } from '../mediaLinks.js';

// Không truyền bộ ánh xạ media (ví dụ import note .md) thì URL /media giữ nguyên.
const NO_MEDIA = createMediaMapper({ mediaDir: null });

const ENUM_ALIASES = {
  main_category: {
    'non-fiction': 'Nonfiction',
    'non fiction': 'Nonfiction',
    fanfic: 'Fanfiction',
    'fan fiction': 'Fanfiction',
    comics: 'Visual/Comics',
    comic: 'Visual/Comics',
    visual: 'Visual/Comics',
    manga: 'Visual/Comics',
  },
  status: {
    finshed: 'Finished',
    tbr: 'TBR',
    'to read': 'TBR',
    'to-read': 'TBR',
    'want to read': 'TBR',
    'currently reading': 'Reading',
    read: 'Finished',
    done: 'Finished',
    completed: 'Finished',
    abandoned: 'DNF',
    'did not finish': 'DNF',
  },
  media_type: { 'light-novel': 'Light Novel', ln: 'Light Novel', fanfiction: 'Fanfic' },
  unit_type: { page: 'pages', chapter: 'chapters', volume: 'volumes', '%': 'percent' },
};

/** Trái tim (❤️ ♥ 💖 💕 ...) trong note Obsidian = sách yêu thích. */
export const HEART = /[\u2764\u2665\u2661\u{1F493}-\u{1F49F}\u{1F5A4}\u{1F90D}\u{1F90E}\u{1F9E1}\u{1FA77}-\u{1FA7B}\u{1F60D}\u{1F970}\u{1F63B}]/u;

export function containsHeart(value) {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.some(containsHeart);
  if (typeof value === 'object') return Object.values(value).some(containsHeart);
  return HEART.test(String(value));
}

const STAR = '⭐';
const HALF = '½';
const CHILI = '🌶️';

export function chilisText(value) {
  if (value === null || value === undefined || value <= 0) return null;
  const rounded = Math.round(value * 2) / 2;
  return CHILI.repeat(Math.floor(rounded)) + (rounded % 1 ? HALF : '');
}

function parseChilis(text, key) {
  const count = [...text.matchAll(/🌶/gu)].length;
  if (count > 0 || text.includes(HALF)) return count + (text.includes(HALF) ? 0.5 : 0);
  return parseNumber(text, key, false);
}
const READ_IN_PROGRESS = 'đang đọc';

const isEmpty = (value) =>
  value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0);

// ---------- Giá trị dẫn xuất từ lượt đọc ----------

function latestCard(cards) {
  return cards.length ? cards.reduce((a, b) => (b.read_number > a.read_number ? b : a)) : null;
}

function readYears(cards) {
  const years = new Set();
  for (const card of cards) {
    const date = card.finish_date ?? card.start_date;
    if (date) years.add(Number(date.slice(0, 4)));
    else if (card.finish_year) years.add(card.finish_year);
  }
  return [...years].sort((a, b) => a - b);
}

export function starsText(rating) {
  if (rating === null || rating === undefined || rating <= 0) return null;
  const rounded = Math.round(rating * 2) / 2;
  return STAR.repeat(Math.floor(rounded)) + (rounded % 1 ? HALF : '');
}

function readLine(card) {
  if (!card.start_date && !card.finish_date && card.finish_year) {
    const stars = starsText(card.rating);
    return [`#${card.read_number}`, `năm ${card.finish_year}`, ...(stars ? [stars] : [])].join(' · ');
  }
  const parts = [`#${card.read_number}`, `${card.start_date ?? '?'} → ${card.finish_date ?? READ_IN_PROGRESS}`];
  const stars = starsText(card.rating);
  if (stars) parts.push(stars);
  return parts.join(' · ');
}

function fieldValue(def, { item, cards, note }) {
  if (def.custom) return item.custom_fields?.[def.slug] ?? null;
  switch (def.field) {
    case 'playlist_url':
      return (note?.playlist_links ?? []).map((link) => link.url);
    case 'moodboard_urls':
      return (note?.moodboard_images ?? []).map((entry) => entry.src);
    case 'read_years':
      return readYears(cards);
    case 'latest_start_date':
      return latestCard(cards)?.start_date ?? null;
    case 'latest_finish_date':
      return latestCard(cards)?.finish_date ?? null;
    case 'reads':
      return [...cards].sort((a, b) => a.read_number - b.read_number);
    case 'read_count':
      return cards.length;
    case 'reread_count':
      return Math.max(cards.length - 1, 0);
    case 'last_read_date':
      return cards.reduce((max, card) => {
        const date = card.finish_date ?? card.start_date;
        return date && (!max || date > max) ? date : max;
      }, null);
    default:
      return item[def.field] ?? null;
  }
}

// ---------- App -> frontmatter ----------

function shape(values, prop) {
  if (values.length === 0) return null;
  if (prop.list) return values;
  return values.length === 1 ? values[0] : values;
}

const wrap = (value, prop) => (prop.link ? `[[${value}]]` : value);

/** File tải lên trong app luôn ghi thành link vault [[...]] để Obsidian hiển thị được, bất kể property có bật link hay không. */
const wrapValue = (value, prop, media) => {
  if (isMediaUrl(value)) {
    const target = media.link(value);
    if (target) return `[[${target}]]`;
  }
  return wrap(value, prop);
};

function renderProperty(prop, def, raw, media) {
  switch (prop.format) {
    case 'checkbox':
      return Boolean(raw);
    case 'reads':
      return isEmpty(raw) ? null : raw.map(readLine);
    case 'stars': {
      const values = (Array.isArray(raw) ? raw : [raw]).map(starsText).filter(Boolean).map((v) => wrap(v, prop));
      return shape(values, prop);
    }
    case 'chilis': {
      const values = (Array.isArray(raw) ? raw : [raw]).map(chilisText).filter(Boolean).map((v) => wrap(v, prop));
      return shape(values, prop);
    }
    case 'date':
      return isEmpty(raw) ? null : String(raw);
    case 'number': {
      const values = (Array.isArray(raw) ? raw : [raw])
        .filter((value) => !isEmpty(value))
        .map((value) => (prop.link ? wrap(value, prop) : Number(value)));
      return shape(values, prop);
    }
    default: {
      if (isEmpty(raw)) return null;
      let values = Array.isArray(raw) ? raw : [raw];
      // Chuỗi nhiều giá trị (ví dụ 2 tác giả "A, B") được tách thành danh sách khi property là list.
      if (!Array.isArray(raw) && def.splitList && prop.list) values = String(raw).split(/\s*[,;]\s*/);
      values = values.map((value) => String(value).trim()).filter(Boolean).map((value) => wrapValue(value, prop, media));
      return shape(values, prop);
    }
  }
}

/**
 * Dựng frontmatter + phần thân của một item theo template của thể loại đó.
 * media: bộ ánh xạ /media -> vault (mediaLinks.createMediaMapper); file nào được nhắc tới sẽ được ghi nhận
 * trong media.files() để sync engine chép sang vault.
 */
export function renderWithTemplate({ item, cards, note, template, media = NO_MEDIA }) {
  const data = { [SYSTEM_KEY]: item.sync_uid };
  const context = { item, cards, note };
  for (const prop of template.properties) {
    const def = describeField(prop.field, prop.format, prop.list);
    data[prop.key] = renderProperty(prop, def, fieldValue(def, context), media);
  }
  const usedKeys = new Set(Object.keys(data).map((key) => key.toLowerCase()));
  for (const [key, value] of Object.entries(item.obsidian_extra ?? {})) {
    if (!usedKeys.has(key.toLowerCase())) data[key] = value;
  }
  const noteBody = note?.content_markdown ?? '';
  const body = bodyToVault(noteBody.trim() ? noteBody : template.body_template, media);
  return { data, body: appendGallery(body, renderGallery(note, media)) };
}

// ---------- Frontmatter -> app (chỉ dùng khi sync hai chiều) ----------

class FieldError extends Error {}

const unwrapLink = (value) => {
  const text = String(value).trim();
  const match = text.match(/^\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]$/);
  return (match ? match[1] : text).trim();
};

const asList = (value) => (isEmpty(value) ? [] : (Array.isArray(value) ? value : [value]).filter((v) => !isEmpty(v)));

/** Trạng thái ghi trong note mà app chưa biết tương ứng với trạng thái nào. */
export class UnknownStatusError extends Error {
  constructor(value) {
    super(`Trạng thái "${value}" chưa được ghép`);
    this.value = value;
  }
}

/** Chuẩn hoá trạng thái để so khớp: chữ thường, bỏ emoji/ký hiệu ở hai đầu ("📖 Đang đọc" ~ "đang đọc"). */
export const normalizeStatusKey = (text) =>
  String(text)
    .normalize('NFC')
    .toLowerCase()
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
    .replace(/\s+/g, ' ');

function parseEnum(def, text, key, statusAliases) {
  const exact = def.values.find((candidate) => candidate.toLowerCase() === text.toLowerCase());
  if (exact) return exact;
  const alias = ENUM_ALIASES[def.field]?.[text.toLowerCase()];
  if (alias) return alias;
  if (def.field === 'status') {
    const mapped = statusAliases?.[normalizeStatusKey(text)];
    if (mapped && def.values.includes(mapped)) return mapped;
    if (statusAliases) throw new UnknownStatusError(text);
  }
  throw new FieldError(`${key}: "${text}" không hợp lệ, cho phép: ${def.values.join(', ')}`);
}

function parseNumber(text, key, integer) {
  const number = Number(String(text).replace(',', '.'));
  if (!Number.isFinite(number)) throw new FieldError(`${key}: "${text}" không phải số`);
  if (integer && !Number.isInteger(number)) throw new FieldError(`${key}: "${text}" phải là số nguyên`);
  return number;
}

function parseStars(text, key) {
  const stars = [...text].filter((char) => char === STAR).length;
  if (stars > 0 || text.includes(HALF)) return stars + (text.includes(HALF) ? 0.5 : 0);
  return parseNumber(text, key, false);
}

function parseBoolean(value, key) {
  if (isEmpty(value)) return false;
  if (typeof value === 'boolean') return value;
  if (containsHeart(value)) return true;
  const text = String(value).trim().toLowerCase();
  if (['true', 'yes', 'y', '1', 'có'].includes(text)) return true;
  if (['false', 'no', 'n', '0', 'không'].includes(text)) return false;
  throw new FieldError(`${key}: "${value}" không phải true/false`);
}

function parseDate(text, key) {
  if (!isoDate.safeParse(text).success) throw new FieldError(`${key}: "${text}" không phải ngày YYYY-MM-DD`);
  return text;
}

const READ_LINE = /^#?\s*(\d+)\s*[·:\-]\s*(\d{4}-\d{2}-\d{2}|\?)\s*(?:→|->)\s*(\d{4}-\d{2}-\d{2}|\?|đang đọc)(?:\s*·\s*(.*))?$/u;

const READ_YEAR_LINE = /^#?\s*(\d+)\s*[·:\-]\s*năm\s+(\d{4})(?:\s*·\s*(.*))?$/u;

function parseReads(value, key) {
  return asList(value).map((entry, index) => {
    const yearOnly = String(entry).trim().match(READ_YEAR_LINE);
    if (yearOnly) {
      return { order: Number(yearOnly[1]), start_date: null, finish_date: null, finish_year: Number(yearOnly[2]), rating: yearOnly[3] ? parseStars(yearOnly[3], key) : null };
    }
    const match = String(entry).trim().match(READ_LINE);
    if (!match) throw new FieldError(`${key}[${index}]: "${entry}" không đúng dạng "#1 · 2025-01-01 → 2025-01-10 · ⭐⭐⭐⭐"`);
    const start = match[2] === '?' ? null : parseDate(match[2], key);
    const finish = /^\d/.test(match[3]) ? parseDate(match[3], key) : null;
    if (start && finish && finish < start) throw new FieldError(`${key}[${index}]: ngày xong trước ngày bắt đầu`);
    return { order: Number(match[1]), start_date: start, finish_date: finish, rating: match[4] ? parseStars(match[4], key) : null };
  }).sort((a, b) => a.order - b.order);
}

function parseProperty(prop, def, value, statusAliases) {
  const key = prop.key;
  const texts = asList(value).map(unwrapLink).filter(Boolean);
  switch (prop.format) {
    case 'checkbox':
      return parseBoolean(Array.isArray(value) ? value[0] : value, key);
    case 'reads':
      return parseReads(value, key);
    case 'stars':
      return texts.length ? parseStars(texts[0], key) : null;
    case 'chilis':
      return texts.length ? parseChilis(texts[0], key) : null;
    case 'date':
      return texts.length ? parseDate(texts[0], key) : null;
    case 'number':
      if (def.valueType === 'number_list') return texts.map((text) => parseNumber(text, key, true));
      return texts.length ? parseNumber(texts[0], key, def.valueType === 'integer') : null;
    default:
      if (def.valueType === 'enum') return texts.length ? parseEnum(def, texts[0], key, statusAliases) : undefined;
      if (def.valueType === 'string_list') return texts;
      return texts.length ? texts.join(', ') : null;
  }
}

/** Tìm thể loại của file: thử property Category của từng template. */
export function detectCategory(data, templates) {
  const entries = new Map(Object.entries(data).map(([key, value]) => [key.toLowerCase(), value]));
  for (const template of Object.values(templates)) {
    const prop = template.properties.find((candidate) => candidate.field === 'main_category');
    if (!prop || !entries.has(prop.key.toLowerCase())) continue;
    const value = entries.get(prop.key.toLowerCase());
    if (isEmpty(value)) continue;
    try {
      return parseEnum(describeField('main_category', 'text'), unwrapLink(asList(value)[0]), prop.key);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Đọc file theo template. Trả về dữ liệu đã chuẩn hoá; ném lỗi kèm danh sách lỗi nếu có property sai,
 * để sync engine bỏ qua cả file thay vì nhập một phần.
 */
/**
 * statusAliases (tuỳ chọn): bảng ghép trạng thái do người dùng chọn, key đã chuẩn hoá bằng normalizeStatusKey.
 * Khi có bảng này, trạng thái lạ không làm lỗi cả note mà được trả về ở unknownStatus để hỏi người dùng.
 */
export function parseWithTemplate({ data, body, template, fallbackTitle, category, media = NO_MEDIA, statusAliases }) {
  const lower = new Map(Object.entries(data).map(([key, value]) => [key.toLowerCase(), value]));
  const errors = [];
  const item = {};
  const customFields = {};
  let reads = null;
  let unknownStatus = null;
  const latest = {};

  for (const prop of template.properties) {
    if (!lower.has(prop.key.toLowerCase())) continue;
    const def = describeField(prop.field, prop.format, prop.list);
    if (!def || def.readOnly) continue;
    try {
      const parsed = parseProperty(prop, def, lower.get(prop.key.toLowerCase()), statusAliases);
      if (def.custom) customFields[def.slug] = parsed;
      else if (def.field === 'reads') reads = parsed;
      else if (def.field === 'latest_start_date') latest.start_date = parsed;
      else if (def.field === 'latest_finish_date') latest.finish_date = parsed;
      else if (parsed !== undefined) item[def.field] = parsed;
    } catch (error) {
      if (error instanceof UnknownStatusError) unknownStatus = error.value;
      else errors.push(error.message);
    }
  }

  // Ảnh bìa/gáy đã chép sang vault: đổi link vault về lại file trong app.
  for (const field of ['cover_image', 'spine_image']) {
    if (typeof item[field] === 'string') item[field] = media.restore(item[field]) ?? item[field];
  }
  if (!item.title) item.title = fallbackTitle;
  // Note không có property Category: dùng thể loại đã xác định từ bên ngoài (đoán theo template hoặc người dùng chọn).
  if (category) item.main_category = category;
  item.media_type ??= 'Book';
  item.status ??= 'TBR';
  item.unit_type ??= 'pages';
  item.current_unit ??= 0;

  if (errors.length === 0) {
    const parsed = createItemSchema.safeParse(item);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const prop = template.properties.find((candidate) => candidate.field === issue.path[0]);
        errors.push(`${prop?.key ?? issue.path.join('.')}: ${issue.message}`);
      }
    } else {
      Object.assign(item, parsed.data);
    }
  }
  if (errors.length) {
    const error = new Error(errors.join('; '));
    error.fieldErrors = errors;
    throw error;
  }

  const templateKeys = new Set([SYSTEM_KEY, ...template.properties.map((prop) => prop.key.toLowerCase())]);
  const extra = Object.fromEntries(Object.entries(data).filter(([key]) => !templateKeys.has(key.toLowerCase())));
  const syncUid = lower.has(SYSTEM_KEY) && !isEmpty(lower.get(SYSTEM_KEY)) ? String(lower.get(SYSTEM_KEY)).trim() : null;
  // Mục gallery do app tạo lại mỗi lần ghi file nên không nhập ngược vào nội dung note.
  const ownBody = bodyFromVault(stripGallery(body), media);
  const noteBody = ownBody.trim() === template.body_template.trim() ? '' : ownBody;

  return { item, customFields, reads, latest, note: { content_markdown: noteBody }, extra, syncUid, unknownStatus };
}

/**
 * Ghép lượt đọc từ file vào lượt đọc hiện có: giữ review_summary theo số thứ tự,
 * và áp Date started/Date finished (nếu người dùng sửa) vào lượt mới nhất.
 */
export function mergeCards(existing, { reads, latest }) {
  const byNumber = new Map(existing.map((card) => [card.read_number, card]));
  let cards = reads
    ? reads.map((read, index) => ({
        start_date: read.start_date,
        finish_date: read.finish_date,
        finish_year: read.finish_year ?? null,
        rating: read.rating,
        review_summary: byNumber.get(index + 1)?.review_summary ?? null,
      }))
    : existing.map((card) => ({ ...card }));

  const hasLatest = latest.start_date !== undefined || latest.finish_date !== undefined;
  if (hasLatest && (latest.start_date || latest.finish_date)) {
    if (cards.length === 0) cards.push({ start_date: null, finish_date: null, rating: null, review_summary: null });
    const last = cards[cards.length - 1];
    if (latest.start_date !== undefined) last.start_date = latest.start_date;
    if (latest.finish_date !== undefined) last.finish_date = latest.finish_date;
    if (last.start_date && last.finish_date && last.finish_date < last.start_date) {
      throw new Error('Date finished trước Date started');
    }
  }
  return cards;
}
