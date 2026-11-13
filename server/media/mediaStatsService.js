import { z } from 'zod';
import { MEDIA_CATEGORIES } from './mediaItemService.js';
import { localDateString } from '../services/dashboardService.js';

export const MIN_GROUP_FOR_AVERAGE = 5;
const UNKNOWN = 'Chưa có';
const STATUS_ORDER = { Watching: 0, Finished: 1, DNF: 2 };

export const statsQuerySchema = z.object({
  year: z.coerce.number().int().min(1900).max(3000).optional(),
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const round = (value, digits) => Math.round(value * 10 ** digits) / 10 ** digits;
const average = (rows) => {
  const rated = rows.filter((row) => row.rating);
  return rated.length ? round(rated.reduce((sum, row) => sum + row.rating, 0) / rated.length, 2) : null;
};
const compare = (current, previous) => ({
  current,
  previous,
  diff: current === null || previous === null ? null : round(current - previous, 2),
  pct: current === null || !previous ? null : round(((current - previous) / previous) * 100, 1),
});

/** Đếm theo khóa; điểm trung bình chỉ có khi nhóm có ít nhất 5 media đã chấm. */
function tally(rows, keysOf, top = 12) {
  const map = new Map();
  for (const row of rows) {
    for (const key of keysOf(row)) {
      const entry = map.get(key) ?? { name: key, count: 0, rated: 0, sum: 0 };
      entry.count += 1;
      if (row.rating) {
        entry.rated += 1;
        entry.sum += row.rating;
      }
      map.set(key, entry);
    }
  }
  return [...map.values()]
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'vi'))
    .slice(0, top)
    .map(({ name, count, rated, sum }) => ({ name, count, rated, average: rated >= MIN_GROUP_FOR_AVERAGE ? round(sum / rated, 2) : null }));
}

const orUnknown = (list) => (list.length ? list : [UNKNOWN]);
const ratingDistribution = (rows) =>
  [1, 2, 3, 4, 5, 0].map((star) => ({
    name: star ? `${star} sao` : 'Chưa chấm',
    count: rows.filter((row) => (star ? Math.round(row.rating ?? 0) === star : !row.rating)).length,
  }));

/**
 * Thống kê Media theo năm.
 * - Đã xem/Bỏ dở: tính vào năm của finish_year.
 * - Đang xem: tính vào mọi năm từ start_year đến năm hiện tại; chưa có start_year thì chỉ tính năm hiện tại.
 * Media thiếu năm được đếm riêng ở `undated`, không tính vào năm nào.
 */
export function createMediaStatsService({ db }) {
  const SQL_ROWS =
    "SELECT id, title, category, status, rating, cover_image, genres, countries, start_year, finish_year FROM media_items WHERE status IN ('Watching', 'Finished', 'DNF')";

  return {
    async get(query = {}) {
      const { year, today } = statsQuerySchema.parse(query);
      const todayString = today ?? localDateString();
      const currentYear = Number(todayString.slice(0, 4));
      const selectedYear = year ?? currentYear;
      const rows = (await db.all(SQL_ROWS)).map((row) => ({ ...row, genres: JSON.parse(row.genres), countries: JSON.parse(row.countries) }));

      const isDone = (row) => row.status !== 'Watching';
      const inYear = (row, y) => (isDone(row) ? row.finish_year === y : y <= currentYear && (row.start_year ?? currentYear) <= y);
      const bucket = (y) => {
        const list = rows.filter((row) => inYear(row, y));
        const done = list.filter(isDone);
        return {
          list,
          done,
          finished: list.filter((row) => row.status === 'Finished').length,
          dnf: list.filter((row) => row.status === 'DNF').length,
          watching: list.filter((row) => row.status === 'Watching').length,
          average: average(done),
        };
      };

      const years = new Set([currentYear]);
      for (const row of rows) {
        if (isDone(row)) {
          if (row.finish_year) years.add(row.finish_year);
        } else {
          for (let y = row.start_year ?? currentYear; y <= currentYear; y += 1) years.add(y);
        }
      }

      const now = bucket(selectedYear);
      const before = bucket(selectedYear - 1);
      const ratedCount = now.done.filter((row) => row.rating).length;

      return {
        year: selectedYear,
        years: [...years].sort((a, b) => b - a),
        today: todayString,
        totals: { finished: now.finished, dnf: now.dnf, watching: now.watching, rated: ratedCount, average_rating: now.average },
        undated: {
          done: rows.filter((row) => isDone(row) && !row.finish_year).length,
          watching: rows.filter((row) => !isDone(row) && !row.start_year).length,
        },
        by_category: MEDIA_CATEGORIES.map((category) => {
          const list = now.list.filter((row) => row.category === category);
          const finished = list.filter((row) => row.status === 'Finished').length;
          const dnf = list.filter((row) => row.status === 'DNF').length;
          return { category, finished, dnf, watching: list.length - finished - dnf, total: list.length };
        }),
        stats: {
          genres: tally(now.done, (row) => orUnknown(row.genres), 30),
          countries: tally(now.done, (row) => orUnknown(row.countries), 30),
          rating_distribution: ratingDistribution(now.done),
          rating_by: {
            min_group: MIN_GROUP_FOR_AVERAGE,
            category: tally(now.done, (row) => [row.category], MEDIA_CATEGORIES.length),
            genre: tally(now.done, (row) => row.genres, 30).filter((row) => row.name !== UNKNOWN),
          },
        },
        comparison: {
          previous_year: selectedYear - 1,
          rows: [
            { label: 'Đã xem xong', ...compare(now.finished, before.finished) },
            { label: 'Bỏ dở', ...compare(now.dnf, before.dnf) },
            { label: 'Đang xem', ...compare(now.watching, before.watching) },
            { label: 'Điểm trung bình', ...compare(now.average, before.average) },
          ],
        },
        items: now.list
          .map(({ id, title, category, status, rating, cover_image, start_year, finish_year }) => ({ id, title, category, status, rating, cover_image, start_year, finish_year }))
          .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.title.localeCompare(b.title, 'vi')),
      };
    },
  };
}
