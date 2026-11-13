import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { computeStreak, statsCategory } from '../services/dashboardService.js';
import { startTestServer } from './helpers.js';

describe('quy tắc nhóm thống kê', () => {
  test('fanfic ≤ 80.000 chữ vào nhóm riêng, còn lại là Fanfiction', () => {
    assert.equal(statsCategory({ main_category: 'Fanfiction', word_count: 80000 }), 'Fanfic ngắn');
    assert.equal(statsCategory({ main_category: 'Fanfiction', word_count: 80001 }), 'Fanfiction');
    assert.equal(statsCategory({ main_category: 'Fanfiction', word_count: null }), 'Fanfiction');
  });

  test('truyện tranh > 60 volume ghi nhầm Fiction vẫn thuộc Visual/Comics', () => {
    assert.equal(statsCategory({ main_category: 'Fiction', media_type: 'Manga', volume_count: 61 }), 'Visual/Comics');
    assert.equal(statsCategory({ main_category: 'Fiction', media_type: 'Manga', volume_count: 60 }), 'Fiction');
    assert.equal(statsCategory({ main_category: 'Fiction', media_type: 'Book', volume_count: 99 }), 'Fiction');
    assert.equal(statsCategory({ main_category: 'Visual/Comics', media_type: 'Manga', volume_count: 5 }), 'Visual/Comics');
  });
});

describe('streak', () => {
  test('chuỗi còn sống khi hôm nay hoặc hôm qua có log', () => {
    const dates = ['2026-10-01', '2026-10-02', '2026-11-03', '2026-11-04'];
    assert.deepEqual(computeStreak(dates, '2026-11-05'), { current: 2, longest: 2, last_read_date: '2026-11-04', active_today: false, alive: true });
    assert.equal(computeStreak([...dates, '2026-11-05'], '2026-11-05').current, 3);
  });

  test('đứt chuỗi khi bỏ qua một ngày, qua tháng và năm vẫn liên tục', () => {
    assert.equal(computeStreak(['2026-11-01', '2026-11-02'], '2026-11-05').current, 0);
    const wrap = computeStreak(['2025-12-30', '2025-12-31', '2026-01-01'], '2026-01-01');
    assert.equal(wrap.current, 3);
    assert.equal(wrap.longest, 3);
    assert.equal(computeStreak([], '2026-11-05').current, 0);
  });
});

describe('GET /api/dashboard và warnings', () => {
  let ctx;
  const ids = {};
  before(async () => {
    ctx = await startTestServer();
    const make = async (key, body) => {
      const res = await ctx.api('POST', '/items', body);
      assert.equal(res.status, 201, JSON.stringify(res.body));
      ids[key] = res.body.id;
    };
    await make('novel', { title: 'Tiểu thuyết', main_category: 'Fiction', status: 'Finished' });
    await make('nonfic', { title: 'Sách kỹ năng', main_category: 'Nonfiction' });
    await make('shortfic', { title: 'Oneshot', main_category: 'Fanfiction', media_type: 'Fanfic', word_count: 12000 });
    await make('longfic', { title: 'Fic dài', main_category: 'Fanfiction', media_type: 'Fanfic', word_count: 250000 });
    await make('manga', { title: 'Manga dài', main_category: 'Fiction', media_type: 'Manga', volume_count: 100 });
    const card = (key, body) => ctx.api('POST', `/items/${ids[key]}/library-cards`, body);
    await card('novel', { start_date: '2026-02-01', finish_date: '2026-02-10' });
    await card('novel', { start_date: '2026-06-01', finish_date: '2026-06-09' });
    await card('novel', { finish_year: 2025 });
    await card('nonfic', { finish_date: '2026-03-03' });
    await card('nonfic', { start_date: '2026-09-01' });
    await card('shortfic', { finish_date: '2026-04-04' });
    await card('longfic', { finish_year: 2026 });
    await card('manga', { finish_date: '2026-05-05' });
    const log = (key, date, units, minutes) => ctx.api('POST', '/reading-logs', { item_id: ids[key], date, units_read: units, minutes_spent: minutes });
    for (const date of ['2026-11-02', '2026-11-03', '2026-11-04']) await log('novel', date, 10, 20);
    await log('nonfic', '2026-11-04', 5, 10);
    await log('novel', '2026-10-20', 4, 8);
  });
  after(() => ctx.stop());

  test('đếm First-read và Re-read theo năm, lượt chỉ biết năm tính vào năm đó', async () => {
    const res = await ctx.api('GET', '/dashboard?year=2026&today=2026-11-05');
    assert.equal(res.status, 200);
    // novel: lượt 1 (2/2026), lượt 2 (6/2026, re-read), lượt 3 (2025, không tính); nonfic: 1 lượt xong; longfic: year-only 2026; manga: 1.
    assert.deepEqual(res.body.totals, { first_read: 4, re_read: 1, total: 5 });
    assert.deepEqual(res.body.short_fanfic, { first_read: 1, re_read: 0, total: 1 });
    const byCategory = Object.fromEntries(res.body.by_category.map((row) => [row.category, row]));
    assert.equal(byCategory.Fiction.total, 2);
    assert.equal(byCategory.Fiction.re_read, 1);
    assert.equal(byCategory.Nonfiction.total, 1);
    assert.equal(byCategory.Fanfiction.total, 1);
    assert.equal(byCategory['Visual/Comics'].total, 1);
    assert.equal(byCategory['Fanfic ngắn'].total, 1);
    assert.ok(res.body.years.includes(2025) && res.body.years.includes(2026));
  });

  test('năm 2025 chỉ có lượt chỉ biết năm', async () => {
    const res = await ctx.api('GET', '/dashboard?year=2025&today=2026-11-05');
    assert.deepEqual(res.body.totals, { first_read: 0, re_read: 1, total: 1 });
  });

  test('streak và heatmap lấy từ reading_logs', async () => {
    const res = await ctx.api('GET', '/dashboard?year=2026&today=2026-11-05');
    assert.equal(res.body.streak.current, 3);
    assert.equal(res.body.streak.longest, 3);
    const day = res.body.heatmap.days.find((entry) => entry.date === '2026-11-04');
    assert.deepEqual(day, { date: '2026-11-04', logs: 2, units: 15, minutes: 30 });
    assert.equal(res.body.heatmap.active_days, 4);
  });

  test('query sai bị từ chối', async () => {
    assert.equal((await ctx.api('GET', '/dashboard?year=abc')).status, 400);
  });

  test('warnings lưu và trả về dạng danh sách', async () => {
    const created = await ctx.api('POST', '/items', { title: 'Có cảnh báo', main_category: 'Fanfiction', warnings: ['Major character death', 'Angst'] });
    assert.deepEqual(created.body.warnings, ['Major character death', 'Angst']);
    const patched = await ctx.api('PATCH', `/items/${created.body.id}`, { warnings: [] });
    assert.deepEqual(patched.body.warnings, []);
    const plain = await ctx.api('GET', `/items/${ids.novel}`);
    assert.deepEqual(plain.body.warnings, []);
  });
});
