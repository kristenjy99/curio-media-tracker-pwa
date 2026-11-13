import path from 'node:path';
import { MAIN_CATEGORIES } from '../../validators/common.js';
import { splitMarkdown } from '../obsidian/markdown.js';
import { containsHeart, detectCategory, mergeCards, normalizeStatusKey, parseWithTemplate } from '../obsidian/templates/codec.js';
import { CONFLICT_PATTERN } from '../obsidian/vaultFs.js';
import { safeCards, salvageItem } from './salvage.js';

const unwrap = (value) => String(value).trim().replace(/^\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]$/, '$1').trim();

/**
 * Đoán thể loại khi file không có property Category: template nào có nhiều property
 * "đặc trưng" (chỉ template đó có) xuất hiện trong file nhất thì chọn template đó.
 * Ví dụ file có Fandom/Ships/FIN? là Fanfiction, có Volumes là Truyện tranh.
 */
function guessCategory(data, templates) {
  const keys = new Set(Object.keys(data).map((key) => key.toLowerCase()));
  const keySets = Object.fromEntries(
    Object.entries(templates).map(([category, template]) => [category, new Set(template.properties.map((prop) => prop.key.toLowerCase()))]),
  );
  let best = null;
  let bestScore = 0;
  for (const [category, own] of Object.entries(keySets)) {
    const others = Object.entries(keySets).filter(([other]) => other !== category).map(([, set]) => set);
    const score = [...own].filter((key) => keys.has(key) && !others.some((set) => set.has(key))).length;
    if (score > bestScore) {
      best = category;
      bestScore = score;
    }
  }
  return best;
}

/** Lượt đọc từ note: theo ngày nếu có; các năm trong "Year" không trùng năm của ngày thì thành lượt đọc chỉ biết năm. */
function buildCards(parsed, data, template) {
  const cards = mergeCards([], parsed);
  const yearProp = template.properties.find((prop) => prop.field === 'read_years');
  const entry = yearProp && Object.entries(data).find(([key]) => key.toLowerCase() === yearProp.key.toLowerCase());
  const rawYears = entry ? (Array.isArray(entry[1]) ? entry[1] : [entry[1]]) : [];
  const years = [...new Set(rawYears.filter((value) => value !== null && value !== '').map((value) => Number(unwrap(value))).filter((year) => year >= 1900 && year <= 2100))].sort();
  const datedYears = new Set(cards.map((card) => Number((card.finish_date ?? card.start_date ?? '').slice(0, 4))).filter(Boolean));
  const yearCards = years
    .filter((year) => !datedYears.has(year))
    .filter((year) => cards.length > 0 || parsed.item.status !== 'Reading' || year !== years.at(-1))
    .map((year) => ({ start_date: null, finish_date: null, finish_year: year, rating: null, review_summary: null }));
  const all = [...yearCards, ...cards];
  if (all.length === 0 && ['Reading', 'Finished', 'DNF'].includes(parsed.item.status)) {
    all.push({ start_date: null, finish_date: null, finish_year: null, rating: null, review_summary: null });
  }
  return all;
}

export function createMarkdownImport(context) {
  const { db, models } = context;
  const { items, libraryCards, readingNotes } = models;

  async function duplicateIndex() {
    const index = new Map();
    for (const row of await db.all('SELECT id, title, creator_author FROM items')) {
      const key = row.title.trim().toLowerCase();
      index.set(key, [...(index.get(key) ?? []), row]);
    }
    return index;
  }

  /** Bảng ghép trạng thái: cặp đã lưu từ các lần trước + cặp người dùng vừa chọn ở bước xem trước. */
  async function statusAliasesFor(statusMap = {}) {
    const saved = (await context.services.settings?.statusAliases()) ?? {};
    const chosen = Object.fromEntries(Object.entries(statusMap).map(([raw, status]) => [normalizeStatusKey(raw), status]));
    return { ...saved, ...chosen };
  }

  async function convert({ files, default_category: defaultCategory, overrides = {}, status_map: statusMap = {} }) {
    const templates = await context.services.templates.all();
    const statusAliases = await statusAliasesFor(statusMap);
    const index = await duplicateIndex();
    const seen = new Map();
    return files
      .filter((file) => file.path.toLowerCase().endsWith('.md') && !CONFLICT_PATTERN.test(file.path))
      .filter((file) => !file.path.split(/[\\/]/).some((segment) => segment.startsWith('.')))
      .map((file) => {
        // macOS lưu tên file tiếng Việt dạng NFD; chuẩn hoá NFC để tên sách và việc dò trùng nhất quán.
        const fallbackTitle = path.basename(file.path.replace(/\\/g, '/'), '.md').normalize('NFC');
        const row = { path: file.path, title: fallbackTitle, errors: [], category: defaultCategory, detected_by: 'default', raw: file.content };
        let split;
        try {
          split = splitMarkdown(file.content);
        } catch (error) {
          row.errors.push(error.message);
          return row;
        }
        const fromProperty = detectCategory(split.data, templates);
        const guessed = fromProperty ? null : guessCategory(split.data, templates);
        if (MAIN_CATEGORIES.includes(overrides[file.path])) {
          row.category = overrides[file.path];
          row.detected_by = 'manual';
        } else if (fromProperty) {
          row.category = fromProperty;
          row.detected_by = 'category';
        } else if (guessed) {
          row.category = guessed;
          row.detected_by = 'template';
        }
        const template = templates[row.category];
        try {
          const parsed = parseWithTemplate({ data: split.data, body: split.body, template, fallbackTitle, category: row.category, statusAliases });
          if (parsed.unknownStatus) row.unknown_status = parsed.unknownStatus;
          // Note có trái tim ở bất kỳ property nào (hoặc trong tên file) thì đánh dấu yêu thích.
          if (containsHeart(split.data) || containsHeart(fallbackTitle)) parsed.item.is_favorite = true;
          if (row.category === 'Fanfiction' && parsed.item.media_type === 'Book') parsed.item.media_type = 'Fanfic';
          if (parsed.item.status === 'Finished' && parsed.item.total_units) parsed.item.current_unit = parsed.item.total_units;
          row.parsed = parsed;
          row.cards = buildCards(parsed, split.data, template);
          row.title = parsed.item.title;
        } catch (error) {
          row.errors.push(...(error.fieldErrors ?? [error.message]));
          return row;
        }
        const author = row.parsed.item.creator_author?.toLowerCase() ?? '';
        row.duplicate =
          (index.get(row.title.trim().toLowerCase()) ?? []).find((existing) => !existing.creator_author || !author || existing.creator_author.toLowerCase() === author) ?? null;
        const fileKey = `${row.title.toLowerCase()}|${author}`;
        row.duplicate_in_file = seen.get(fileKey) ?? null;
        if (!seen.has(fileKey)) seen.set(fileKey, file.path);
        return row;
      });
  }

  const summarize = (row) => ({
    path: row.path,
    title: row.title,
    category: row.category,
    detected_by: row.detected_by,
    creator_author: row.parsed?.item.creator_author ?? null,
    status: row.unknown_status ? null : row.parsed?.item.status ?? null,
    unknown_status: row.unknown_status ?? null,
    is_favorite: row.parsed?.item.is_favorite ?? false,
    rating: row.parsed?.item.rating ?? null,
    reads: row.cards?.length ?? 0,
    has_note: Boolean(row.parsed?.note.content_markdown.trim()),
    errors: row.errors,
    duplicate: row.duplicate ? { id: row.duplicate.id, title: row.duplicate.title } : null,
    duplicate_in_file: row.duplicate_in_file ?? null,
  });

  return {
    async preview(input) {
      const rows = await convert(input);
      return {
        total: rows.length,
        valid: rows.filter((row) => !row.errors.length).length,
        invalid: rows.filter((row) => row.errors.length).length,
        valid_duplicates: rows.filter((row) => !row.errors.length && (row.duplicate || row.duplicate_in_file)).length,
        invalid_duplicates: rows.filter((row) => row.errors.length && (row.duplicate || row.duplicate_in_file)).length,
        skipped_files: input.files.length - rows.length,
        // Trạng thái lạ chưa ghép, kèm số note dùng trạng thái đó; giao diện hỏi người dùng chọn trạng thái tương ứng.
        unknown_statuses: Object.entries(
          rows.reduce((acc, row) => (row.unknown_status ? { ...acc, [row.unknown_status]: (acc[row.unknown_status] ?? 0) + 1 } : acc), {}),
        ).map(([value, count]) => ({ value, count })),
        rows: rows.map(summarize),
      };
    },

    /** Chỉ chép dữ liệu vào app; file .md gốc không bị sửa. */
    async commit(input) {
      const rows = await convert(input);
      const summary = { created: 0, with_issues: 0, skipped_duplicates: 0, failed: 0, created_ids: [], failures: [] };
      await db.transaction(async () => {
        for (const row of rows) {
          if (row.unknown_status) row.errors.push(`Chưa chọn trạng thái tương ứng cho "${row.unknown_status}"`);
          const invalid = row.errors.length > 0;
          if (invalid && !input.include_invalid) {
            summary.failed += 1;
            summary.failures.push({ path: row.path, errors: row.errors });
            continue;
          }
          if (input.skip_duplicates !== false && (row.duplicate || row.duplicate_in_file)) {
            summary.skipped_duplicates += 1;
            continue;
          }
          let created;
          if (row.parsed) {
            const { item, customFields, extra, note } = row.parsed;
            created = await items.create({ ...item, custom_fields: customFields, obsidian_extra: extra, ...(invalid && { import_issues: row.errors }) });
            if (note.content_markdown.trim()) await readingNotes.upsert(created.id, note);
          } else {
            // Note không đọc được: giữ nguyên nội dung gốc trong ghi chú để người dùng tự sửa.
            const item = salvageItem({ title: row.title, main_category: row.category, media_type: row.category === 'Fanfiction' ? 'Fanfic' : 'Book' }, row.path);
            created = await items.create({ ...item, import_issues: row.errors });
            if (row.raw?.trim()) await readingNotes.upsert(created.id, { content_markdown: row.raw });
          }
          const cards = invalid ? safeCards(row.cards ?? []) : row.cards;
          if (cards?.length) await libraryCards.replaceAllForItem(created.id, cards);
          summary.created += 1;
          if (invalid) {
            summary.with_issues += 1;
            summary.failures.push({ path: row.path, title: row.title, errors: row.errors });
          }
          summary.created_ids.push(created.id);
        }
        await context.services.settings?.rememberStatusAliases(
          Object.fromEntries(Object.entries(input.status_map ?? {}).map(([raw, status]) => [normalizeStatusKey(raw), status])),
        );
      })();
      return summary;
    },
  };
}
