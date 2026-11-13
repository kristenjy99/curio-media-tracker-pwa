import { SHORT_FANFIC, statsCategory } from './dashboardService.js';
import { isFinishedCard } from './libraryCardService.js';

export const splitList = (value) =>
  String(value ?? '')
    .split(/[,;]/)
    .map((part) => part.trim())
    .filter(Boolean);

/**
 * NGUỒN DỮ LIỆU CHUNG cho lịch, thống kê và mục tiêu: mỗi dòng = một lượt đọc (library_cards) gắn với sách.
 * Sách chưa TBR mà chưa có lượt nào (đường nhập cũ) được coi như có một lượt #1 chưa có ngày.
 *
 * Trạng thái lượt đọc:
 *  - dnf:      lượt mới nhất của sách có status DNF.
 *  - finished: có finish_date, hoặc chỉ biết năm (finish_year), hoặc là lượt mới nhất của sách Finished nhưng chưa ghi ngày.
 *  - reading:  còn lại.
 * Năm của lượt: năm của finish_date; không có thì finish_year; không có nữa thì null (không vào thống kê theo năm).
 * Điểm: rating của lượt, nếu trống thì lấy rating của sách. Số trang: total_units khi đơn vị là trang.
 */
export function createReadingsService({ db }) {
  const SQL_READS = `
    SELECT lc.id AS card_id, i.id AS item_id, COALESCE(lc.read_number, 1) AS read_number,
           lc.start_date, lc.finish_date, lc.finish_year, lc.rating AS card_rating,
           i.title, i.creator_author, i.cover_image, i.main_category, i.media_type, i.word_count, i.volume_count,
           i.format, i.language, i.release_year, i.rating AS item_rating, i.spice_rating, i.status, i.tags, i.fandoms, i.pairings, i.unit_type, i.total_units, i.from_tbr,
           COALESCE(lc.read_number = (SELECT MAX(x.read_number) FROM library_cards x WHERE x.item_id = i.id), 1) AS is_latest
    FROM items i LEFT JOIN library_cards lc ON lc.item_id = i.id
    WHERE lc.id IS NOT NULL OR i.status != 'TBR'
    ORDER BY lc.finish_date, i.id, lc.read_number
  `;
  const SQL_MINUTES = 'SELECT COALESCE(SUM(minutes_spent), 0) FROM reading_logs WHERE date BETWEEN ? AND ?';

  function toRead(row) {
    const isLatest = Boolean(row.is_latest);
    const dated = isFinishedCard(row);
    let state = 'reading';
    if (isLatest && row.status === 'DNF') state = 'dnf';
    else if (dated || (isLatest && row.status === 'Finished')) state = 'finished';
    const year = row.finish_date ? Number(row.finish_date.slice(0, 4)) : row.finish_year ?? null;
    const rating = row.card_rating || row.item_rating || null;
    const category = statsCategory(row);
    const list = (value) => { try { return JSON.parse(value ?? '[]'); } catch { return []; } };
    const tags = list(row.tags);
    return {
      card_id: row.card_id,
      item_id: row.item_id,
      read_number: row.read_number,
      is_reread: row.read_number > 1,
      state,
      start_date: row.start_date,
      finish_date: row.finish_date,
      year,
      title: row.title,
      author: row.creator_author,
      cover_image: row.cover_image,
      category,
      main_category: row.main_category,
      media_type: row.media_type,
      format: row.format,
      language: row.language,
      release_year: row.release_year,
      tags,
      fandoms: list(row.fandoms),
      pairings: list(row.pairings),
      rating,
      // Độ spicy chỉ tính cho sách có tag smut.
      is_smut: tags.some((tag) => String(tag).trim().toLowerCase() === 'smut'),
      spice: tags.some((tag) => String(tag).trim().toLowerCase() === 'smut') ? row.spice_rating ?? null : null,
      pages: row.unit_type === 'pages' && row.total_units > 0 ? row.total_units : null,
      from_tbr: Boolean(row.from_tbr),
      kpi: category !== SHORT_FANFIC,
    };
  }

  return {
    async all() {
      return (await db.all(SQL_READS)).map(toRead);
    },

    /** Lượt đã đọc xong tính vào KPI của một năm (loại fanfic ngắn theo quy tắc dashboard). */
    finishedInYear(year, reads) {
      return reads.filter((read) => read.state === 'finished' && read.kpi && read.year === year);
    },

    /** Tổng số sách, số trang, số giờ của một năm; kèm số bản ghi bị thiếu dữ liệu. */
    async yearTotals(year, reads) {
      const done = this.finishedInYear(year, reads);
      const withPages = done.filter((read) => read.pages !== null);
      const minutes = await db.get(SQL_MINUTES, [`${year}-01-01`, `${year}-12-31`], { pluck: true });
      return {
        books: done.length,
        pages: withPages.reduce((sum, read) => sum + read.pages, 0),
        pages_missing: done.length - withPages.length,
        hours: Math.round((minutes / 60) * 10) / 10,
      };
    },

    /** Dữ liệu cho lịch: mọi lượt có năm trùng, kèm các năm có dữ liệu và số lượt không có ngày. */
    async forCalendar(year, today) {
      const reads = await this.all();
      const years = [...new Set([...reads.filter((r) => r.year).map((r) => r.year), Number(today.slice(0, 4))])].sort((a, b) => b - a);
      return {
        year,
        years,
        reads: reads.filter((read) => read.year === year && read.state !== 'reading'),
        undated: {
          finished: reads.filter((r) => r.state === 'finished' && r.year === null).length,
          dnf: reads.filter((r) => r.state === 'dnf' && r.year === null).length,
        },
        rules: 'Mỗi lượt đọc (kể cả re-read) nằm ở ngày finish_date của lượt đó. Lượt chỉ biết năm hoặc không có ngày không đặt lên lịch được.',
      };
    },
  };
}
