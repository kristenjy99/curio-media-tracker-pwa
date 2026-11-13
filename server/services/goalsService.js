import { NotFoundError } from '../utils/errors.js';

const METRICS = { books: 'sách', pages: 'trang', hours: 'giờ' };
const DAY = 86_400_000;
const round1 = (n) => Math.round(n * 10) / 10;

export function createGoalsService(context) {
  const { db } = context;
  const SQL_LIST = "SELECT * FROM goals WHERE year = ? ORDER BY CASE metric WHEN 'books' THEN 0 WHEN 'pages' THEN 1 ELSE 2 END";
  const SQL_UPSERT = `
    INSERT INTO goals (year, metric, target) VALUES (@year, @metric, @target)
    ON CONFLICT(year, metric) DO UPDATE SET target = excluded.target, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  `;

  /**
   * Tiến độ một mục tiêu. Mức cần đạt = phần còn lại chia cho thời gian còn lại (tính cả hôm nay).
   * Kế hoạch tuyến tính: đáng lẽ đã đạt target × (số ngày đã qua / số ngày của năm).
   * Trạng thái: ahead (vượt kế hoạch), on_track (chênh dưới 1% mục tiêu), behind; năm đã qua: done/missed; năm tương lai: not_started.
   */
  function progress(goal, current, year, today) {
    const todayYear = Number(today.slice(0, 4));
    const start = Date.UTC(year, 0, 1);
    const daysInYear = (Date.UTC(year + 1, 0, 1) - start) / DAY;
    const [y, m, d] = today.split('-').map(Number);
    const dayOfYear = year < todayYear ? daysInYear : year > todayYear ? 0 : (Date.UTC(y, m - 1, d) - start) / DAY + 1;
    const daysLeft = Math.max(daysInYear - dayOfYear + (year === todayYear ? 1 : 0), 0);
    const remaining = Math.max(goal.target - current, 0);
    const expected = (goal.target * dayOfYear) / daysInYear;
    const gap = current - expected;
    let status;
    if (year < todayYear) status = current >= goal.target ? 'done' : 'missed';
    else if (year > todayYear) status = 'not_started';
    else if (current >= goal.target) status = 'done';
    else status = Math.abs(gap) <= goal.target * 0.01 ? 'on_track' : gap > 0 ? 'ahead' : 'behind';
    return {
      id: goal.id,
      metric: goal.metric,
      unit: METRICS[goal.metric],
      target: goal.target,
      current,
      percent: Math.min(Math.round((current / goal.target) * 1000) / 10, 999),
      remaining: round1(remaining),
      expected: round1(expected),
      gap: round1(gap),
      status,
      per_month: daysLeft > 0 && remaining > 0 ? round1(remaining / (daysLeft / (daysInYear / 12))) : 0,
      per_week: daysLeft > 0 && remaining > 0 ? round1(remaining / (daysLeft / 7)) : 0,
    };
  }

  return {
    async list(year, today = new Date().toISOString().slice(0, 10), reads = null) {
      const readings = reads ?? (await context.services.readings.all());
      const totals = await context.services.readings.yearTotals(year, readings);
      const goals = await db.all(SQL_LIST, [year]);
      return {
        year,
        totals,
        goals: goals.map((goal) => progress(goal, totals[goal.metric], year, today)),
        rules: {
          books: 'Số lượt đọc đã xong trong năm theo finish_date (gồm re-read, không gồm fanfic ngắn).',
          pages: 'Tổng số trang của các lượt đã xong; sách không có số trang (đơn vị khác trang) không cộng, được đếm riêng ở "thiếu số trang".',
          hours: 'Tổng phút trong nhật ký đọc của năm chia 60.',
        },
      };
    },

    async set(year, metric, target) {
      await db.run(SQL_UPSERT, { year, metric, target });
    },

    async remove(id) {
      if ((await db.run('DELETE FROM goals WHERE id = ?', [id])).changes === 0) throw new NotFoundError('Goal', id);
    },
  };
}
