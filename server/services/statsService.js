import { splitList } from './readingsService.js';

export const MIN_GROUP_FOR_AVERAGE = 5;
const UNKNOWN = 'Chưa có';

const pct = (diff, base) => (base > 0 ? Math.round((diff / base) * 1000) / 10 : null);
const compare = (current, previous) => ({ current, previous, diff: Math.round((current - previous) * 10) / 10, pct: pct(current - previous, previous) });

function tally(reads, keysOf, { top = 12, metric = 'rating' } = {}) {
  const map = new Map();
  for (const read of reads) {
    for (const key of keysOf(read)) {
      const row = map.get(key) ?? { name: key, count: 0, rated: 0, sum: 0 };
      row.count += 1;
      if (read[metric]) {
        row.rated += 1;
        row.sum += read[metric];
      }
      map.set(key, row);
    }
  }
  return [...map.values()]
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'vi'))
    .slice(0, top)
    .map(({ name, count, rated, sum }) => ({
      name,
      count,
      rated,
      // Chỉ có trung bình khi nhóm có ít nhất 5 sách đã chấm điểm; dưới ngưỡng chỉ trả số lượng.
      average: rated >= MIN_GROUP_FOR_AVERAGE ? Math.round((sum / rated) * 100) / 100 : null,
    }));
}

const orUnknown = (list) => (list.length ? list : [UNKNOWN]);

/** Độ spicy của các lượt đọc sách có tag smut: phân bố 1–5 ớt và trung bình theo thể loại, format, tác giả. */
function spiceStats(reads) {
  const smut = reads.filter((read) => read.is_smut);
  const opts = { metric: 'spice' };
  return {
    count: smut.length,
    rated: smut.filter((read) => read.spice).length,
    distribution: [1, 2, 3, 4, 5, 0].map((level) => ({
      name: level ? `${level} ớt` : 'Chưa chấm',
      count: smut.filter((read) => (level ? Math.round(read.spice ?? 0) === level : !read.spice)).length,
    })),
    genre: tally(smut, (read) => orUnknown(read.tags.filter((tag) => String(tag).trim().toLowerCase() !== 'smut')), { top: 30, ...opts }).filter((row) => row.name !== UNKNOWN),
    format: tally(smut, (read) => [read.format || read.media_type || UNKNOWN], opts),
    author: tally(smut, (read) => orUnknown(splitList(read.author)), { top: 10, ...opts }),
  };
}
const lengthBucket = (pages) => (pages === null ? 'Chưa có số trang' : pages < 200 ? '< 200 trang' : pages < 400 ? '200–399' : pages < 600 ? '400–599' : '≥ 600 trang');
const LENGTH_ORDER = ['< 200 trang', '200–399', '400–599', '≥ 600 trang', 'Chưa có số trang'];

const RATING_STARS = [1, 2, 3, 4, 5, 0];
const ratingDistribution = (rows) =>
  RATING_STARS.map((star) => ({
    name: star ? `${star} sao` : 'Chưa chấm',
    count: rows.filter((read) => (star ? Math.round(read.rating ?? 0) === star : !read.rating)).length,
  }));
const SCOPES = ['Fiction', 'Nonfiction', 'Fanfiction'];

/** Genre, tác giả, đánh giá cho một nhóm lượt đọc; dùng cho bộ lọc Fiction/Nonfiction/Fanfiction ở dashboard. */
function scopeStats(rows) {
  return {
    count: rows.length,
    genres: tally(rows, (read) => orUnknown(read.tags), { top: 30 }),
    authors: tally(rows, (read) => orUnknown(splitList(read.author)), { top: 10 }),
    rating_distribution: ratingDistribution(rows),
    rating_by: {
      genre: tally(rows, (read) => orUnknown(read.tags), { top: 30 }).filter((row) => row.name !== UNKNOWN),
      format: tally(rows, (read) => [read.format || read.media_type || UNKNOWN]),
      author: tally(rows, (read) => orUnknown(splitList(read.author)), { top: 10 }),
    },
    spice: spiceStats(rows),
  };
}

export function createStatsService(context) {
  return {
    async compute(year, reads, today) {
      const { readings, goals } = context.services;
      const done = readings.finishedInYear(year, reads);
      const previousYear = year - 1;
      const totals = await readings.yearTotals(year, reads);
      const previousTotals = await readings.yearTotals(previousYear, reads);

      const yearReads = reads.filter((read) => read.year === year && read.kpi);
      const dnfYear = yearReads.filter((read) => read.state === 'dnf').length;
      const allDnf = reads.filter((read) => read.state === 'dnf').length;
      const allEnded = reads.filter((read) => read.state === 'dnf' || read.state === 'finished').length;

      const genreRows = tally(done, (read) => orUnknown(read.tags), { top: 30 });
      const decade = (read) => (read.release_year ? `${Math.floor(read.release_year / 10) * 10}s` : UNKNOWN);
      const lengths = tally(done, (read) => [lengthBucket(read.pages)]);

      return {
        year,
        counted_reads: done.length,
        basis:
          'Nguồn: các lượt đọc đã xong (finish_date hoặc finish_year) trong năm; re-read tính là một lượt riêng; sách xuyên năm gán theo finish_date; fanfic ngắn (≤ 80.000 chữ) và Nonfiction dạng News/Research Paper không tính, giống KPI phía trên.',
        genres: {
          rows: genreRows,
          rule: 'Mỗi sách có thể có nhiều genre/tag nên được đếm một lần cho từng genre: tổng các phần có thể lớn hơn số sách. Sách không có tag vào nhóm "Chưa có".',
          assignments: done.reduce((sum, read) => sum + Math.max(read.tags.length, 1), 0),
        },
        by_scope: Object.fromEntries(SCOPES.map((scope) => [scope, scopeStats(done.filter((read) => read.category === scope))])),
        fanfic: (() => {
          const fanfic = done.filter((read) => read.category === 'Fanfiction');
          return {
            count: fanfic.length,
            fandoms: tally(fanfic, (read) => orUnknown(read.fandoms), { top: 15 }),
            pairings: tally(fanfic, (read) => orUnknown(read.pairings), { top: 15 }),
            rule: 'Chỉ tính fanfic đã đọc xong trong năm và không thuộc nhóm fanfic ngắn. Mỗi fic có thể có nhiều fandom/pairing nên được đếm cho từng cái.',
          };
        })(),
        categories: tally(done, (read) => [read.category]),
        authors: tally(done, (read) => orUnknown(splitList(read.author)), { top: 10 }),
        languages: tally(done, (read) => orUnknown(splitList(read.language))),
        release_decades: tally(done, (read) => [decade(read)], { top: 40 }).sort((a, b) => a.name.localeCompare(b.name)),
        lengths: LENGTH_ORDER.map((name) => ({ name, count: lengths.find((row) => row.name === name)?.count ?? 0 })),
        rating_distribution: [1, 2, 3, 4, 5, 0].map((star) => ({
          name: star ? `${star} sao` : 'Chưa chấm',
          count: done.filter((read) => (star ? Math.round(read.rating ?? 0) === star : !read.rating)).length,
        })),
        rating_by: {
          min_group: MIN_GROUP_FOR_AVERAGE,
          rule: 'Trung bình chỉ hiện khi nhóm có ít nhất 5 sách đã chấm điểm; dưới ngưỡng chỉ hiện số lượng. Điểm lấy theo lượt đọc, thiếu thì theo điểm của sách.',
          genre: genreRows.filter((row) => row.name !== UNKNOWN),
          format: tally(done, (read) => [read.format || read.media_type || UNKNOWN]),
          author: tally(done, (read) => orUnknown(splitList(read.author)), { top: 10 }),
        },
        spice: spiceStats(done),
        behavior: {
          dnf: {
            year_dnf: dnfYear,
            year_finished: done.length,
            year_rate: dnfYear + done.length ? pct(dnfYear, dnfYear + done.length) : null,
            all_time_dnf: allDnf,
            all_time_rate: allEnded ? pct(allDnf, allEnded) : null,
            rule: 'Tỉ lệ năm = DNF có finish_date trong năm / (DNF + đã xong trong năm). Tỉ lệ toàn thời gian tính cả DNF chưa có ngày.',
          },
          tbr_to_read: {
            count: done.filter((read) => read.from_tbr && read.read_number === 1).length,
            rule: 'Sách đọc xong trong năm mà đã chuyển từ TBR (chỉ ghi nhận từ khi có tính năng này).',
          },
          rereads: done.filter((read) => read.is_reread).length,
        },
        comparison: {
          previous_year: previousYear,
          rows: [
            { metric: 'books', label: 'Số sách', ...compare(totals.books, previousTotals.books) },
            { metric: 'pages', label: 'Số trang', ...compare(totals.pages, previousTotals.pages) },
            { metric: 'hours', label: 'Số giờ', ...compare(totals.hours, previousTotals.hours) },
          ],
        },
        vs_goal: (await goals.list(year, today, reads)).goals.map((goal) => ({
          metric: goal.metric,
          target: goal.target,
          current: goal.current,
          diff: Math.round((goal.current - goal.target) * 10) / 10,
          pct: pct(goal.current - goal.target, goal.target),
        })),
        data_quality: {
          pages_missing: totals.pages_missing,
          no_rating: done.filter((read) => !read.rating).length,
          no_genre: done.filter((read) => read.tags.length === 0).length,
          no_language: done.filter((read) => !read.language).length,
          no_release_year: done.filter((read) => !read.release_year).length,
          undated_finished: reads.filter((read) => read.state === 'finished' && read.year === null).length,
          note: 'Bản ghi thiếu dữ liệu vẫn được đếm số sách nhưng nằm ở nhóm "Chưa có"/không cộng vào số trang; lượt không có năm không nằm trong năm nào.',
        },
        totals,
      };
    },
  };
}
