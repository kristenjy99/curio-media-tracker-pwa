/**
 * Bộ đọc giá trị "dễ dãi" cho dữ liệu nhập từ Goodreads/Notion/CSV tự làm.
 * Mỗi hàm trả về null khi ô trống, ném lỗi có thông điệp rõ khi có giá trị nhưng không đọc được.
 */

const MONTHS = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4, may: 5, june: 6, jun: 6,
  july: 7, jul: 7, august: 8, aug: 8, september: 9, sep: 9, sept: 9, october: 10, oct: 10,
  november: 11, nov: 11, december: 12, dec: 12,
};

export const isBlank = (value) => value === null || value === undefined || String(value).trim() === '';

/** Bỏ link Notion "Tên (https://www.notion.so/...)", wikilink [[Tên]], và dấu ="..." của Goodreads. */
export function cleanText(value) {
  if (isBlank(value)) return null;
  let text = String(value).trim();
  text = text.replace(/^="(.*)"$/, '$1');
  text = text.replace(/\s*\((?:https?:\/\/)?(?:www\.)?notion\.so\/[^)]*\)/gi, '');
  text = text.replace(/\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]/g, '$1');
  return text.trim() || null;
}

export function parseList(value) {
  if (isBlank(value)) return [];
  const raw = Array.isArray(value) ? value : String(value).split(/\s*[,;]\s*/);
  const seen = new Set();
  return raw
    .map((entry) => cleanText(entry))
    .filter((entry) => {
      if (!entry) return false;
      const key = entry.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function parseInteger(value) {
  if (isBlank(value)) return null;
  if (typeof value === 'number') return Math.round(value);
  const digits = String(value).replace(/[^\d-]/g, '');
  if (!digits || digits === '-') throw new Error(`"${value}" không phải số`);
  return Number.parseInt(digits, 10);
}

/** Nhận "4", "4.5", "4,5", "⭐⭐⭐⭐", "★★★★☆", thang 10 (8 -> 4). Goodreads dùng 0 = chưa chấm. */
export function parseRating(value) {
  if (isBlank(value)) return null;
  const text = cleanText(value) ?? '';
  const stars = [...text].filter((char) => char === '⭐' || char === '★').length;
  if (stars > 0 || text.includes('½')) return Math.min(stars + (text.includes('½') ? 0.5 : 0), 5);
  const number = Number(text.replace(',', '.').replace(/\/\s*(5|10)$/, ''));
  if (!Number.isFinite(number)) throw new Error(`"${value}" không phải điểm đánh giá`);
  if (number === 0) return null;
  if (number > 5 && number <= 10) return Math.round(number) / 2;
  if (number < 0 || number > 10) throw new Error(`"${value}" nằm ngoài thang 0–5`);
  return number;
}

export function parseBoolean(value) {
  if (isBlank(value)) return false;
  const text = String(value).trim().toLowerCase();
  if (['yes', 'true', '1', 'x', '✓', '✔', 'checked', 'có'].includes(text)) return true;
  if (['no', 'false', '0', 'unchecked', 'không'].includes(text)) return false;
  throw new Error(`"${value}" không phải có/không`);
}

const pad = (number) => String(number).padStart(2, '0');

function toIso(year, month, day, original) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error(`"${original}" không phải ngày hợp lệ`);
  }
  return `${year}-${pad(month)}-${pad(day)}`;
}

/**
 * Đọc ngày ở các dạng hay gặp: 2025-09-14, 2025/09/14 (Goodreads), September 14, 2025 (Notion),
 * 14 September 2025, 14/09/2025 (ngày trước tháng, trừ khi số thứ hai > 12), "14 tháng 9, 2025".
 */
export function parseLooseDate(value) {
  if (isBlank(value)) return null;
  const text = String(value).trim().replace(/\s+\(GMT[^)]*\)$/i, '');
  let match = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/);
  if (match) return toIso(+match[1], +match[2], +match[3], value);

  match = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:\s.*)?$/);
  if (match) {
    const [first, second] = [+match[1], +match[2]];
    return second > 12 ? toIso(+match[3], first, second, value) : toIso(+match[3], second, first, value);
  }

  match = text.match(/^([a-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})(?:\s.*)?$/i);
  if (match && MONTHS[match[1].toLowerCase()]) return toIso(+match[3], MONTHS[match[1].toLowerCase()], +match[2], value);

  match = text.match(/^(\d{1,2})\s+([a-z]+)\.?,?\s+(\d{4})$/i);
  if (match && MONTHS[match[2].toLowerCase()]) return toIso(+match[3], MONTHS[match[2].toLowerCase()], +match[1], value);

  match = text.match(/^(?:ngày\s+)?(\d{1,2})\s+tháng\s+(\d{1,2}),?\s+(?:năm\s+)?(\d{4})$/i);
  if (match) return toIso(+match[3], +match[2], +match[1], value);

  match = text.match(/^(\d{4})$/);
  if (match) throw new Error(`"${value}" chỉ có năm, cần ngày đầy đủ`);

  throw new Error(`Không đọc được ngày "${value}"`);
}

/** Cột ngày dạng khoảng của Notion: "September 8, 2025 → September 14, 2025". */
export function parseDateRange(value) {
  if (isBlank(value)) return { start: null, finish: null };
  const parts = String(value).split(/\s*(?:→|->|–|—| to )\s*/);
  return { start: parseLooseDate(parts[0]), finish: parts[1] ? parseLooseDate(parts[1]) : null };
}

const ENUM_SYNONYMS = {
  status: [
    [/^(read|finished|done|completed|đã đọc|đọc xong|hoàn thành|finshed)$/i, 'Finished'],
    [/^(currently[- ]reading|reading|in progress|đang đọc)$/i, 'Reading'],
    [/^(to[- ]read|tbr|want to read|not started|chưa đọc|muốn đọc)$/i, 'TBR'],
    [/(dnf|did[- ]not[- ]finish|abandon|bỏ dở|drop)/i, 'DNF'],
  ],
  main_category: [
    [/^(non[- ]?fiction|phi hư cấu|self[- ]help)$/i, 'Nonfiction'],
    [/^(fan[- ]?fic(tion)?|fic|đồng nhân)$/i, 'Fanfiction'],
    [/^(visual\/comics|comics?|manga|manhwa|manhua|webtoon|graphic[- ]novels?|truyện tranh)$/i, 'Visual/Comics'],
    [/^(fiction|novel|tiểu thuyết|hư cấu)$/i, 'Fiction'],
  ],
  media_type: [
    [/^(paperback|hardcover|book|sách giấy)$/i, 'Book'],
    [/^(ebook|kindle|kindle edition|epub)$/i, 'Ebook'],
    [/^(audiobook|audio cd|audible|sách nói)$/i, 'Audiobook'],
    [/^(fanfic|fanfiction|ao3)$/i, 'Fanfic'],
    [/^manga$/i, 'Manga'],
    [/^manhwa$/i, 'Manhwa'],
    [/^manhua$/i, 'Manhua'],
    [/^(comic|comics|graphic novel)$/i, 'Comic'],
    [/^webtoon$/i, 'Webtoon'],
    [/^(web ?novel)$/i, 'Webnovel'],
    [/^(light novel|ln)$/i, 'Light Novel'],
    [/^(news|article|bài báo|tin tức)$/i, 'News'],
    [/^(research paper|paper|journal article|bài nghiên cứu)$/i, 'Research Paper'],
  ],
};

export function parseEnum(kind, value) {
  const text = cleanText(Array.isArray(value) ? value[0] : value);
  if (!text) return null;
  for (const [pattern, result] of ENUM_SYNONYMS[kind]) if (pattern.test(text)) return result;
  return undefined;
}
