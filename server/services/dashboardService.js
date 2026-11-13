import { isFinishedCard } from './libraryCardService.js';

export const SHORT_FANFIC_MAX_WORDS = 80000;
export const LONG_COMICS_MIN_VOLUMES = 60;
export const SHORT_FANFIC = 'Fanfic ngắn';
export const DASHBOARD_CATEGORIES = ['Fiction', 'Nonfiction', 'Fanfiction', 'Visual/Comics', SHORT_FANFIC];

// Nonfiction dạng News / Research Paper được xem như fanfic ngắn: nhóm riêng, không cộng vào KPI.
const SHORT_NONFICTION_MEDIA = new Set(['News', 'Research Paper']);
const COMIC_MEDIA = new Set(['Manga', 'Manhwa', 'Manhua', 'Comic', 'Webtoon']);
const pad = (n) => String(n).padStart(2, '0');

export function localDateString(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Nhóm thống kê của một sách:
 * - Fanfiction có số chữ ≤ 80.000 vào nhóm riêng "Fanfic ngắn", không cộng vào tổng KPI (không có số chữ thì tính Fanfiction thường).
 * - Nonfiction có loại ấn phẩm News hoặc Research Paper cũng vào nhóm riêng này (không cần số chữ).
 * - Truyện tranh (manga, manhwa, manhua, comic, webtoon) trên 60 volume luôn thuộc Visual/Comics, kể cả khi sách đang ghi thể loại Fiction.
 */
export function statsCategory(item) {
  if (item.main_category === 'Fanfiction') {
    return item.word_count != null && item.word_count <= SHORT_FANFIC_MAX_WORDS ? SHORT_FANFIC : 'Fanfiction';
  }
  if (item.main_category === 'Nonfiction' && SHORT_NONFICTION_MEDIA.has(item.media_type)) return SHORT_FANFIC;
  if (item.main_category === 'Fiction' && COMIC_MEDIA.has(item.media_type) && (item.volume_count ?? 0) > LONG_COMICS_MIN_VOLUMES) {
    return 'Visual/Comics';
  }
  return item.main_category;
}

function addDays(dateString, days) {
  const [y, m, d] = dateString.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** Streak từ danh sách ngày có log (đã sắp xếp tăng dần, không trùng). */
export function computeStreak(sortedDates, today) {
  const set = new Set(sortedDates);
  let longest = 0;
  let run = 0;
  let previous = null;
  for (const date of sortedDates) {
    run = previous && addDays(previous, 1) === date ? run + 1 : 1;
    if (run > longest) longest = run;
    previous = date;
  }
  // Chuỗi hiện tại còn sống nếu hôm nay hoặc hôm qua có log (hôm nay chưa ghi thì chưa bị đứt).
  let cursor = set.has(today) ? today : set.has(addDays(today, -1)) ? addDays(today, -1) : null;
  let current = 0;
  const lastDate = cursor;
  while (cursor && set.has(cursor)) {
    current += 1;
    cursor = addDays(cursor, -1);
  }
  return { current, longest, last_read_date: sortedDates.at(-1) ?? null, active_today: set.has(today), alive: lastDate !== null };
}

const SQL_CARDS = `
    SELECT lc.read_number, lc.start_date, lc.finish_date, lc.finish_year,
           i.main_category, i.media_type, i.word_count, i.volume_count
    FROM library_cards lc JOIN items i ON i.id = lc.item_id
  `;
const SQL_LOG_DATES = 'SELECT DISTINCT date FROM reading_logs ORDER BY date';
const SQL_HEATMAP = `
    SELECT date, COUNT(*) AS logs, COALESCE(SUM(units_read), 0) AS units, COALESCE(SUM(minutes_spent), 0) AS minutes
    FROM reading_logs WHERE date BETWEEN ? AND ? GROUP BY date ORDER BY date
  `;

export function createDashboardService(context) {
  const { db } = context;

  const emptyBucket = () => ({ first_read: 0, re_read: 0, total: 0 });

  return {
    /** Lượt đọc đã xong, kèm năm tính: năm của finish_date, hoặc finish_year nếu lượt chỉ biết năm. */
    async finishedReads() {
      const reads = [];
      for (const card of await db.all(SQL_CARDS)) {
        if (!isFinishedCard(card)) continue;
        const year = card.finish_date ? Number(card.finish_date.slice(0, 4)) : card.finish_year;
        reads.push({ year, is_first: card.read_number === 1, category: statsCategory(card) });
      }
      return reads;
    },

    async get({ year, today } = {}) {
      const todayString = today ?? localDateString();
      const selectedYear = year ?? Number(todayString.slice(0, 4));
      const reads = await this.finishedReads();

      const years = [...new Set([...reads.map((read) => read.year), Number(todayString.slice(0, 4))])].sort((a, b) => b - a);

      const totals = emptyBucket();
      const byCategory = Object.fromEntries(DASHBOARD_CATEGORIES.map((category) => [category, emptyBucket()]));
      for (const read of reads) {
        if (read.year !== selectedYear) continue;
        const bucket = byCategory[read.category];
        bucket[read.is_first ? 'first_read' : 're_read'] += 1;
        bucket.total += 1;
        if (read.category !== SHORT_FANFIC) {
          totals[read.is_first ? 'first_read' : 're_read'] += 1;
          totals.total += 1;
        }
      }

      const heatmapStart = `${selectedYear}-01-01`;
      const heatmapEnd = `${selectedYear}-12-31`;
      const days = await db.all(SQL_HEATMAP, [heatmapStart, heatmapEnd]);
      const allReadings = await context.services.readings.all();

      return {
        year: selectedYear,
        years,
        today: todayString,
        totals,
        short_fanfic: byCategory[SHORT_FANFIC],
        by_category: DASHBOARD_CATEGORIES.map((category) => ({ category, ...byCategory[category] })),
        streak: computeStreak(await db.all(SQL_LOG_DATES, undefined, { pluck: true }), todayString),
        heatmap: { start: heatmapStart, end: heatmapEnd, days, active_days: days.length },
        stats: await context.services.stats.compute(selectedYear, allReadings, todayString),
        goals: await context.services.goals.list(selectedYear, todayString, allReadings),
        rules: { short_fanfic_max_words: SHORT_FANFIC_MAX_WORDS, long_comics_min_volumes: LONG_COMICS_MIN_VOLUMES },
      };
    },
  };
}
