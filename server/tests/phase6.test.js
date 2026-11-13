import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { firstLetter, matchPlayers } from '../services/funService.js';
import { startTestServer } from './helpers.js';

const TODAY = '2026-11-05';
let t;
before(async () => { t = await startTestServer(); });
after(async () => { await t.stop(); });

const mk = async (over = {}) => (await t.api('POST', '/items', { title: 'Sách', main_category: 'Fiction', ...over })).body;
const card = async (id, body) => (await t.api('POST', `/items/${id}/library-cards`, body)).body;
const readings = async () => (await t.api('GET', `/readings?year=2026&today=${TODAY}`)).body;

describe('hàm thuần', () => {
  test('firstLetter bỏ dấu và xử lý Đ', () => {
    assert.equal(firstLetter('Đắc nhân tâm'), 'D');
    assert.equal(firstLetter('  Ánh sáng'), 'A');
    assert.equal(firstLetter('123'), null);
  });
  test('matchPlayers lấy người thắng vòng trước', () => {
    assert.deepEqual(matchPlayers([1, 2, 3, 4], { '0-0': 2 }, 1, 0), [2, null]);
    assert.deepEqual(matchPlayers([1, 2, 3, 4], {}, 0, 1), [3, 4]);
  });
});

describe('reading là nguồn chung', () => {
  test('sách Finished không có lượt đọc vẫn được sinh một lượt chưa có ngày', async () => {
    const item = await mk({ title: 'Không ngày', status: 'Finished' });
    const cards = (await t.api('GET', `/items/${item.id}/library-cards`)).body.data;
    assert.equal(cards.length, 1);
    assert.ok((await readings()).undated.finished >= 1);
  });

  test('re-read cùng ngày nằm đúng ngày, có đánh dấu; DNF có ngày vẫn là DNF', async () => {
    const a = await mk({ title: 'Đọc hai lần' });
    await card(a.id, { start_date: '2026-03-01', finish_date: '2026-03-10' });
    await card(a.id, { start_date: '2026-03-10', finish_date: '2026-03-10' });
    const d = await mk({ title: 'Bỏ dở', status: 'DNF' });
    const cardId = (await t.api('GET', `/items/${d.id}/library-cards`)).body.data[0].id;
    await t.api('PATCH', `/library-cards/${cardId}`, { finish_date: '2026-04-01' });
    assert.equal((await t.api('GET', `/items/${d.id}`)).body.status, 'DNF');

    const { reads } = await readings();
    const march = reads.filter((r) => r.item_id === a.id);
    assert.deepEqual(march.map((r) => [r.finish_date, r.is_reread, r.state]), [['2026-03-10', false, 'finished'], ['2026-03-10', true, 'finished']]);
    assert.equal(reads.find((r) => r.item_id === d.id).state, 'dnf');
  });
});

describe('thống kê', () => {
  test('trung bình chỉ hiện khi nhóm có ≥ 5 sách đã chấm; sách xuyên năm gán theo finish_date', async () => {
    for (let i = 0; i < 5; i += 1) {
      const item = await mk({ title: `X${i}`, tags: ['nhóm-đủ'], rating: 4, language: 'Tiếng Việt' });
      await card(item.id, { start_date: '2025-12-30', finish_date: '2026-01-02' });
    }
    for (let i = 0; i < 4; i += 1) {
      const item = await mk({ title: `Y${i}`, tags: ['nhóm-thiếu'], rating: 5 });
      await card(item.id, { finish_date: '2026-02-02' });
    }
    const { stats } = (await t.api('GET', `/dashboard?year=2026&today=${TODAY}`)).body;
    const find = (name) => stats.rating_by.genre.find((row) => row.name === name);
    assert.equal(find('nhóm-đủ').average, 4);
    assert.equal(find('nhóm-thiếu').average, null);
    assert.equal(find('nhóm-thiếu').count, 4);
    assert.equal((await t.api('GET', `/dashboard?year=2025&today=${TODAY}`)).body.stats.genres.rows.some((row) => row.name === 'nhóm-đủ'), false);
    assert.ok(stats.comparison.rows.find((row) => row.metric === 'books').pct === null, 'năm trước 0 sách thì không có phần trăm');
  });
});

describe('mục tiêu', () => {
  test('tính tiến độ, mức cần đạt và trạng thái', async () => {
    await t.api('PUT', '/goals', { year: 2026, metric: 'books', target: 100 });
    const goal = (await t.api('GET', `/goals?year=2026&today=${TODAY}`)).body.goals[0];
    assert.equal(goal.target, 100);
    assert.ok(goal.current >= 9);
    assert.equal(goal.status, 'behind');
    assert.ok(goal.per_month > 0 && goal.per_week > 0);
  });
});

describe('challenge, yêu thích, bracket, TBR', () => {
  test('A–Z kiểm tra chữ cái; một sách vào nhiều challenge nhưng một lần trong mỗi challenge', async () => {
    const alpha = await mk({ title: 'Alpha' });
    const zed = await mk({ title: 'Zed' });
    const az = (await t.api('POST', '/challenges', { name: 'A-Z', type: 'az' })).body;
    const bingo = (await t.api('POST', '/challenges', { name: 'Bingo', type: 'bingo', size: 3 })).body;
    assert.equal(az.slots.length, 26);
    assert.equal(bingo.slots.length, 9);
    assert.ok((await t.api('PATCH', `/challenge-slots/${az.slots[0].id}`, { item_id: zed.id })).status >= 400);
    assert.equal((await t.api('PATCH', `/challenge-slots/${az.slots[0].id}`, { item_id: alpha.id })).status, 200);
    assert.equal((await t.api('PATCH', `/challenge-slots/${bingo.slots[0].id}`, { item_id: alpha.id })).status, 200);
    assert.equal((await t.api('PATCH', `/challenge-slots/${bingo.slots[1].id}`, { item_id: alpha.id })).status, 409);
  });

  test('yêu thích tháng tối đa 3 sách', async () => {
    const ids = [];
    for (let i = 0; i < 4; i += 1) {
      const book = await mk({ title: `F${i}`, status: 'Finished' });
      await card(book.id, { finish_date: '2026-05-10' });
      ids.push(book.id);
    }
    assert.ok((await t.api('PUT', '/favorites/2026/5', { item_ids: ids })).status >= 400);
    const ok = await t.api('PUT', '/favorites/2026/5', { item_ids: ids.slice(0, 3) });
    assert.equal(ok.body.months[4].books.length, 3);
  });

  test('yêu thích tháng chỉ nhận sách có ngày đọc xong trong tháng; ít hơn 3 sách vẫn vào bracket', async () => {
    const inMay = await mk({ title: 'Đọc tháng 5', status: 'Finished' });
    await card(inMay.id, { finish_date: '2026-05-20' });
    const inJune = await mk({ title: 'Đọc tháng 6', status: 'Finished' });
    await card(inJune.id, { finish_date: '2026-06-02' });
    assert.ok((await t.api('PUT', '/favorites/2026/5', { item_ids: [inJune.id] })).status >= 400);
    assert.equal((await t.api('PUT', '/favorites/2026/5', { item_ids: [inMay.id] })).status, 200);
    const candidates = (await t.api('GET', '/brackets/candidates/2026')).body.data;
    assert.ok(candidates.some((book) => book.id === inMay.id));
  });

  test('Nonfiction News/Research Paper thuộc nhóm riêng như fanfic ngắn, không vào KPI', async () => {
    for (const media_type of ['News', 'Research Paper']) {
      const created = await t.api('POST', '/items', { title: media_type, main_category: 'Nonfiction', media_type, status: 'Finished' });
      assert.equal(created.status, 201);
      await card(created.body.id, { finish_date: '2026-03-01' });
    }
    const stats = (await t.api('GET', `/dashboard?year=2026&today=${TODAY}`)).body;
    assert.ok(stats.by_category.find((row) => row.category === 'Fanfic ngắn').total >= 2);
  });

  test('import lỗi: include_invalid tạo sách riêng có import_issues', async () => {
    const csv = 'Title,Status,Rating\nOK,Finished,4\nBad rating,Finished,abc\n,Reading,3\n';
    const mapping = { Title: 'title', Status: 'status', Rating: 'rating' };
    const body = { source: 'generic', format: 'csv', content: csv, mapping, defaults: { main_category: 'Fiction' } };
    const skip = (await t.api('POST', '/import/commit', body)).body;
    assert.equal(skip.failed, 2);
    const kept = (await t.api('POST', '/import/commit', { ...body, include_invalid: true, skip_duplicates: false })).body;
    assert.equal(kept.with_issues, 2);
    const flagged = (await t.api('GET', '/items?needs_review=true')).body;
    assert.equal(flagged.total, 2);
    assert.ok(flagged.data.every((book) => book.import_issues.length > 0));
    const cleared = await t.api('PATCH', `/items/${flagged.data[0].id}`, { import_issues: null });
    assert.equal(cleared.body.import_issues, null);
  });

  test('bracket: chọn người thắng, sửa kết quả sớm thì xoá kết quả sau', async () => {
    const ids = [];
    for (let i = 0; i < 4; i += 1) ids.push((await mk({ title: `B${i}` })).id);
    const b = (await t.api('POST', '/brackets', { name: 'Test', year: 2026, size: 4, item_ids: ids })).body;
    const pick = (round, match, item_id) => t.api('PUT', `/brackets/${b.id}/pick`, { round, match, item_id });
    assert.ok((await pick(0, 0, ids[2])).status >= 400);
    await pick(0, 0, ids[0]);
    await pick(0, 1, ids[3]);
    const final = await pick(1, 0, ids[0]);
    assert.equal(final.body.champion, ids[0]);
    const changed = await pick(0, 0, ids[1]);
    assert.equal(changed.body.champion, null);
  });

  test('TBR → đang đọc tạo lượt mới và ghi nhận from_tbr', async () => {
    const book = await mk({ title: 'Chờ đọc', status: 'TBR', ownership: 'wishlist', release_date: '2027-01-01' });
    assert.equal(book.ownership, 'wishlist');
    const started = await t.api('POST', `/items/${book.id}/start-reading`, { date: TODAY });
    assert.equal(started.body.status, 'Reading');
    assert.equal(started.body.from_tbr, 1);
    assert.ok((await t.api('POST', `/items/${book.id}/start-reading`, {})).status >= 400);
  });
});
