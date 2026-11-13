import Papa from 'papaparse';
import { ValidationError } from '../../utils/errors.js';
import { createItemSchema } from '../../validators/itemValidators.js';
import { safeCards, salvageItem } from './salvage.js';
import {
  cleanText,
  isBlank,
  parseBoolean,
  parseDateRange,
  parseEnum,
  parseInteger,
  parseList,
  parseLooseDate,
  parseRating,
} from './valueParsers.js';

/** Các đích có thể ánh xạ một cột vào. */
export const IMPORT_TARGETS = [
  { id: 'title', label: 'Tiêu đề' },
  { id: 'creator_author', label: 'Tác giả' },
  { id: 'additional_authors', label: 'Tác giả phụ' },
  { id: 'main_category', label: 'Thể loại chính' },
  { id: 'media_type', label: 'Loại ấn phẩm' },
  { id: 'status', label: 'Trạng thái' },
  { id: 'rating', label: 'Đánh giá' },
  { id: 'is_favorite', label: 'Yêu thích' },
  { id: 'format', label: 'Định dạng / nền tảng' },
  { id: 'language', label: 'Ngôn ngữ' },
  { id: 'release_year', label: 'Năm phát hành' },
  { id: 'release_year_fallback', label: 'Năm phát hành (dự phòng)' },
  { id: 'total_units', label: 'Số trang / chương' },
  { id: 'word_count', label: 'Số chữ' },
  { id: 'volume_count', label: 'Số volume' },
  { id: 'tags', label: 'Tags / Genres' },
  { id: 'fandoms', label: 'Fandom' },
  { id: 'pairings', label: 'Pairing / Ship' },
  { id: 'tropes', label: 'Tropes' },
  { id: 'warnings', label: 'Warnings' },
  { id: 'topics', label: 'Chủ đề' },
  { id: 'cover_image', label: 'Ảnh bìa (URL)' },
  { id: 'date_started', label: 'Ngày bắt đầu' },
  { id: 'date_finished', label: 'Ngày đọc xong' },
  { id: 'date_range', label: 'Khoảng ngày đọc (bắt đầu → xong)' },
  { id: 'read_count', label: 'Số lượt đọc' },
  { id: 'review', label: 'Nhận xét (gắn vào lượt đọc gần nhất)' },
  { id: 'notes', label: 'Ghi chú (vào Freeform note)' },
  { id: 'custom:series', label: 'Series (trường riêng)' },
  { id: 'custom:link', label: 'Link (trường riêng)' },
];
const TARGET_IDS = new Set(IMPORT_TARGETS.map((target) => target.id));
const CUSTOM_TARGET = /^custom:[a-z0-9_]{1,40}$/;

const GOODREADS_COLUMNS = {
  Title: 'title',
  Author: 'creator_author',
  'Additional Authors': 'additional_authors',
  'My Rating': 'rating',
  Binding: 'format',
  'Number of Pages': 'total_units',
  'Original Publication Year': 'release_year',
  'Year Published': 'release_year_fallback',
  'Date Read': 'date_finished',
  Bookshelves: 'tags',
  'Exclusive Shelf': 'status',
  'My Review': 'review',
  'Private Notes': 'notes',
  'Read Count': 'read_count',
};

// Gợi ý theo tên cột (đã bỏ dấu, chữ thường) cho Notion và CSV tự làm.
const HEADER_HINTS = [
  [/^(name|title|ten|ten sach|book|book title|tieu de)$/, 'title'],
  [/^(authors?|tac gia|writer|by)$/, 'creator_author'],
  [/^(status|trang thai|reading status)$/, 'status'],
  [/^(ratings?|my rating|danh gia|score|stars?)$/, 'rating'],
  [/^(genres?|tags?|the loai phu|shelves|bookshelves)$/, 'tags'],
  [/^(category|main category|the loai|kind)$/, 'main_category'],
  [/^(type|media type|loai)$/, 'media_type'],
  [/^(format|platform|binding|nen tang|dinh dang)$/, 'format'],
  [/^(language|ngon ngu|lang)$/, 'language'],
  [/^(published|year published|publication year|release year|nam xuat ban|nam phat hanh|release)$/, 'release_year'],
  [/^(pages?|number of pages|so trang|chapters?|so chuong)$/, 'total_units'],
  [/^(words?|word count|so chu)$/, 'word_count'],
  [/^(volumes?|vols?|so volume|so tap)$/, 'volume_count'],
  [/^(fandoms?)$/, 'fandoms'],
  [/^(ships?|pairings?|couple|otp)$/, 'pairings'],
  [/^(tropes?)$/, 'tropes'],
  [/^(warnings?|content warnings?|trigger warnings?|canh bao)$/, 'warnings'],
  [/^(topics?|chu de)$/, 'topics'],
  [/^(cover|cover url|coverurl|cover image|anh bia|bia)$/, 'cover_image'],
  [/^(favorite\??|favourite\??|yeu thich|fav)$/, 'is_favorite'],
  [/^(date started|start date|started|ngay bat dau)$/, 'date_started'],
  [/^(date finished|date read|finished|finish date|end date|ngay doc xong|ngay xong)$/, 'date_finished'],
  [/^(dates?|reading dates?|thoi gian doc)$/, 'date_range'],
  [/^(read count|times read|so lan doc)$/, 'read_count'],
  [/^(review|my review|nhan xet|cam nhan)$/, 'review'],
  [/^(notes?|private notes|ghi chu)$/, 'notes'],
  [/^(series|series, pj)$/, 'custom:series'],
  [/^(link|url|source)$/, 'custom:link'],
];

const normalizeHeader = (header) =>
  header
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .trim()
    .toLowerCase();

const GOODREADS_EXCLUSIVE = new Set(['read', 'currently-reading', 'to-read']);

function readRows(format, content) {
  if (typeof content !== 'string' || !content.trim()) throw new ValidationError('File rỗng', [{ path: ['content'], message: 'Không có dữ liệu' }]);
  if (format === 'json') {
    let data;
    try {
      data = JSON.parse(content);
    } catch (error) {
      throw new ValidationError(`File JSON không hợp lệ: ${error.message}`, [{ path: ['content'], message: 'JSON lỗi' }]);
    }
    const rows = Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results : Array.isArray(data?.items) ? data.items : null;
    if (!rows) throw new ValidationError('JSON phải là một mảng các sách (hoặc có trường "results"/"items")', [{ path: ['content'], message: 'Sai cấu trúc' }]);
    const flat = rows.map((row) =>
      Object.fromEntries(
        Object.entries(row ?? {}).map(([key, value]) => [
          key,
          Array.isArray(value) ? value.map((v) => (typeof v === 'object' ? v?.name ?? JSON.stringify(v) : v)).join(', ') : typeof value === 'object' && value !== null ? value.name ?? value.start ?? JSON.stringify(value) : value,
        ]),
      ),
    );
    const headers = [...new Set(flat.flatMap((row) => Object.keys(row)))];
    return { headers, rows: flat };
  }
  const parsed = Papa.parse(content.replace(/^﻿/, ''), { header: true, skipEmptyLines: 'greedy', transformHeader: (header) => header.trim() });
  const fatal = parsed.errors.find((error) => error.type === 'Delimiter' || error.code === 'UndetectableDelimiter');
  if (fatal && parsed.data.length === 0) throw new ValidationError(`Không đọc được CSV: ${fatal.message}`, [{ path: ['content'], message: 'CSV lỗi' }]);
  return { headers: parsed.meta.fields ?? [], rows: parsed.data };
}

function suggestMapping(source, headers) {
  const mapping = {};
  const used = new Set();
  for (const header of headers) {
    let target = null;
    if (source === 'goodreads') target = GOODREADS_COLUMNS[header] ?? null;
    else {
      const normalized = normalizeHeader(header);
      target = HEADER_HINTS.find(([pattern]) => pattern.test(normalized))?.[1] ?? null;
    }
    if (target && used.has(target)) target = null;
    if (target) used.add(target);
    mapping[header] = target;
  }
  return mapping;
}

function guessCategoryFromTags(tags) {
  const joined = tags.map((tag) => tag.toLowerCase());
  if (joined.some((tag) => /non-?fiction|self-help|history|science/.test(tag))) return 'Nonfiction';
  if (joined.some((tag) => /fanfic/.test(tag))) return 'Fanfiction';
  if (joined.some((tag) => /manga|manhwa|manhua|comic|graphic-novel|webtoon/.test(tag))) return 'Visual/Comics';
  return null;
}

/** Chuyển một dòng thành sách + lượt đọc + ghi chú, thu lỗi theo từng cột. */
function convertRow(row, { source, mapping, defaults }) {
  const errors = [];
  const values = {};
  for (const [header, target] of Object.entries(mapping)) {
    if (!target || isBlank(row[header])) continue;
    values[target] = row[header];
  }
  const attempt = (label, fn) => {
    try {
      return fn();
    } catch (error) {
      errors.push(`${label}: ${error.message}`);
      return null;
    }
  };

  const item = { custom_fields: {} };
  item.title = cleanText(values.title);
  const authors = [cleanText(values.creator_author), ...parseList(values.additional_authors)].filter(Boolean);
  item.creator_author = authors.length ? [...new Set(authors)].join(', ') : null;
  item.format = cleanText(values.format);
  item.language = cleanText(values.language);
  item.cover_image = cleanText(values.cover_image);
  item.rating = attempt('Đánh giá', () => parseRating(values.rating));
  item.is_favorite = attempt('Yêu thích', () => parseBoolean(values.is_favorite)) ?? false;
  item.release_year =
    attempt('Năm phát hành', () => parseInteger(values.release_year)) ??
    attempt('Năm phát hành', () => parseInteger(values.release_year_fallback));
  item.total_units = attempt('Số trang', () => parseInteger(values.total_units));
  item.word_count = attempt('Số chữ', () => parseInteger(values.word_count));
  item.volume_count = attempt('Số volume', () => parseInteger(values.volume_count));
  for (const field of ['tags', 'fandoms', 'pairings', 'tropes', 'topics', 'warnings']) item[field] = parseList(values[field]);

  if (source === 'goodreads') {
    // Bookshelves của Goodreads có cả kệ trạng thái (read, to-read...), bỏ đi để chỉ còn kệ tự đặt.
    item.tags = item.tags.filter((tag) => !GOODREADS_EXCLUSIVE.has(tag.toLowerCase()));
  }

  const statusText = cleanText(values.status);
  const status = parseEnum('status', values.status);
  if (statusText && status === undefined) errors.push(`Trạng thái: "${statusText}" không nhận ra (Finished, Reading, TBR, DNF)`);
  const categoryText = cleanText(values.main_category);
  const category = parseEnum('main_category', values.main_category);
  if (categoryText && category === undefined) errors.push(`Thể loại chính: "${categoryText}" không nhận ra`);
  item.main_category = category || guessCategoryFromTags(item.tags) || defaults.main_category;
  const media = parseEnum('media_type', values.media_type) ?? parseEnum('media_type', values.format);
  item.media_type = media || (item.main_category === 'Fanfiction' ? 'Fanfic' : 'Book');
  if (item.main_category === 'Fanfiction') item.unit_type = 'chapters';
  if (item.main_category === 'Visual/Comics') item.unit_type = item.volume_count ? 'volumes' : 'chapters';

  for (const [target, value] of Object.entries(values)) {
    if (CUSTOM_TARGET.test(target)) {
      const list = parseList(value);
      item.custom_fields[target.slice('custom:'.length)] = list.length > 1 ? list : cleanText(value);
    }
  }

  const range = attempt('Khoảng ngày', () => parseDateRange(values.date_range)) ?? { start: null, finish: null };
  const started = attempt('Ngày bắt đầu', () => parseLooseDate(values.date_started)) ?? range.start;
  const finished = attempt('Ngày đọc xong', () => parseLooseDate(values.date_finished)) ?? range.finish;
  const readCount = attempt('Số lượt đọc', () => parseInteger(values.read_count)) ?? 0;
  item.status = status || (finished ? 'Finished' : started ? 'Reading' : defaults.status ?? 'TBR');
  if (started && finished && finished < started) errors.push('Ngày đọc xong trước ngày bắt đầu');

  // Số lượt đọc: theo cột Read Count nếu có, nếu không thì 1 lượt khi có ngày hoặc đã đọc xong.
  const hasRead = Boolean(started || finished || item.status === 'Finished' || item.status === 'Reading' || item.status === 'DNF');
  const totalReads = Math.max(readCount, hasRead ? 1 : 0);
  const review = cleanText(values.review)?.replace(/<br\s*\/?>/gi, '\n') ?? null;
  const cards = Array.from({ length: totalReads }, (_, index) =>
    index === totalReads - 1
      ? { start_date: started, finish_date: finished, rating: item.rating, review_summary: review }
      : { start_date: null, finish_date: null, rating: null, review_summary: null },
  );
  if (item.status === 'Finished' && item.total_units) item.current_unit = item.total_units;
  const notes = cleanText(values.notes)?.replace(/<br\s*\/?>/gi, '\n') ?? '';

  if (!item.title) errors.push('Thiếu tiêu đề');
  let normalized = item;
  if (errors.length === 0) {
    const parsed = createItemSchema.safeParse(item);
    if (parsed.success) normalized = parsed.data;
    else for (const issue of parsed.error.issues) errors.push(`${issue.path.join('.')}: ${issue.message}`);
  }
  return { item: normalized, cards, note: notes, errors };
}

export function createImportService({ db, models }) {
  const { items, libraryCards, readingNotes } = models;

  async function existingIndex() {
    const index = new Map();
    for (const row of await db.all('SELECT id, title, creator_author FROM items')) {
      index.set(row.title.trim().toLowerCase(), [...(index.get(row.title.trim().toLowerCase()) ?? []), row]);
    }
    return index;
  }

  function findDuplicate(index, item) {
    const candidates = index.get(item.title?.trim().toLowerCase()) ?? [];
    const author = item.creator_author?.toLowerCase() ?? '';
    return candidates.find((row) => !row.creator_author || !author || row.creator_author.toLowerCase() === author) ?? null;
  }

  function validateMapping(mapping, headers) {
    for (const [header, target] of Object.entries(mapping)) {
      if (!headers.includes(header)) throw new ValidationError(`Cột "${header}" không có trong file`, [{ path: ['mapping', header], message: 'Không tồn tại' }]);
      if (target && !TARGET_IDS.has(target) && !CUSTOM_TARGET.test(target)) {
        throw new ValidationError(`Đích "${target}" không hợp lệ`, [{ path: ['mapping', header], message: target }]);
      }
    }
    if (!Object.values(mapping).includes('title')) {
      throw new ValidationError('Cần chọn một cột làm Tiêu đề', [{ path: ['mapping'], message: 'Thiếu title' }]);
    }
  }

  async function convertAll(input) {
    const { headers, rows } = readRows(input.format, input.content);
    validateMapping(input.mapping, headers);
    const index = await existingIndex();
    const seenInFile = new Map();
    return rows.map((row, rowIndex) => {
      const converted = convertRow(row, input);
      const duplicate = converted.item.title ? findDuplicate(index, converted.item) : null;
      const fileKey = `${converted.item.title?.toLowerCase()}|${converted.item.creator_author?.toLowerCase() ?? ''}`;
      const duplicateInFile = seenInFile.has(fileKey) ? seenInFile.get(fileKey) : null;
      if (!seenInFile.has(fileKey)) seenInFile.set(fileKey, rowIndex + 1);
      return { row: rowIndex + 1, ...converted, duplicate, duplicate_in_file: duplicateInFile };
    });
  }

  return {
    targets() {
      return IMPORT_TARGETS;
    },

    analyze({ source, format, content }) {
      const { headers, rows } = readRows(format, content);
      if (headers.length === 0) throw new ValidationError('File không có dòng tiêu đề cột', [{ path: ['content'], message: 'Thiếu header' }]);
      return { headers, total_rows: rows.length, sample: rows.slice(0, 5), mapping: suggestMapping(source, headers), targets: IMPORT_TARGETS };
    },

    async preview(input) {
      const results = await convertAll(input);
      return {
        total: results.length,
        valid: results.filter((result) => result.errors.length === 0).length,
        invalid: results.filter((result) => result.errors.length > 0).length,
        duplicates: results.filter((result) => result.duplicate || result.duplicate_in_file).length,
        valid_duplicates: results.filter((result) => !result.errors.length && (result.duplicate || result.duplicate_in_file)).length,
        invalid_duplicates: results.filter((result) => result.errors.length && (result.duplicate || result.duplicate_in_file)).length,
        rows: results.slice(0, input.limit ?? 200).map((result) => ({
          row: result.row,
          title: result.item.title,
          creator_author: result.item.creator_author,
          main_category: result.item.main_category,
          status: result.item.status,
          rating: result.item.rating,
          reads: result.cards.length,
          errors: result.errors,
          duplicate: result.duplicate ? { id: result.duplicate.id, title: result.duplicate.title } : null,
          duplicate_in_file: result.duplicate_in_file,
        })),
      };
    },

    async commit(input) {
      const results = await convertAll(input);
      const summary = { created: 0, with_issues: 0, skipped_duplicates: 0, failed: 0, created_ids: [], failures: [] };
      await db.transaction(async () => {
        for (const result of results) {
          const invalid = result.errors.length > 0;
          if (invalid && !input.include_invalid) {
            summary.failed += 1;
            summary.failures.push({ row: result.row, title: result.item.title, errors: result.errors });
            continue;
          }
          if (input.skip_duplicates !== false && (result.duplicate || result.duplicate_in_file)) {
            summary.skipped_duplicates += 1;
            continue;
          }
          const data = invalid ? { ...salvageItem(result.item, `dòng ${result.row}`), import_issues: result.errors } : result.item;
          const created = await items.create(data);
          const cards = invalid ? safeCards(result.cards) : result.cards;
          if (cards.length) await libraryCards.replaceAllForItem(created.id, cards);
          if (result.note) await readingNotes.upsert(created.id, { content_markdown: result.note });
          summary.created += 1;
          if (invalid) {
            summary.with_issues += 1;
            summary.failures.push({ row: result.row, title: data.title, errors: result.errors });
          }
          summary.created_ids.push(created.id);
        }
      })();
      return summary;
    },
  };
}
