import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { parseDateRange, parseLooseDate, parseRating } from '../services/import/valueParsers.js';
import { startTestServer } from './helpers.js';

const GOODREADS_CSV = [
  'Book Id,Title,Author,Author l-f,Additional Authors,ISBN,ISBN13,My Rating,Average Rating,Publisher,Binding,Number of Pages,Year Published,Original Publication Year,Date Read,Date Added,Bookshelves,Bookshelves with positions,Exclusive Shelf,My Review,Spoiler,Private Notes,Read Count,Owned Copies',
  '6294,Howl\'s Moving Castle (Howl\'s Moving Castle #1),Diana Wynne Jones,"Jones, Diana Wynne",,="0064410345",="9780064410342",5,4.29,Greenwillow,Paperback,329,2001,1986,2025/09/14,2025/09/01,"fantasy, favorites","fantasy (#3), favorites (#1)",read,Rất thích.<br/>Đọc lại lần hai.,,,2,0',
  '228378911,How to Take Smart Notes,Sönke Ahrens,"Ahrens, Sönke",,="",="",0,4.1,,Kindle Edition,,2025,2017,,2026/05/25,"non-fiction, currently-reading","",currently-reading,,,,0,0',
  '1,Good Omens,Terry Pratchett,"Pratchett, Terry",Neil Gaiman,="",="",4,4.25,,Hardcover,412,2006,1990,2024/03/02,2024/01/01,,,read,,,,1,0',
  '2,,Không tên,,,="",="",0,0,,,,,,,,,,to-read,,,,0,0',
].join('\n');

const NOTION_CSV = [
  'Name,Author,Status,Rating,Genres,Category,Dates,Published,Favorite?,Ships,Fandom,Words,Cover',
  '"Tiếng lòng lặng thinh","kkmylivinglife (https://www.notion.so/kk-123), doranice_ (https://www.notion.so/do-456)",Finshed,⭐⭐⭐⭐⭐,"Angst, Yêu thầm",Fanfiction,"February 19, 2026 → February 26, 2026",,Yes,Faker x Doran,LCK,"12,500",https://img.wattpad.com/c.jpg',
  'Sapiens,Yuval Noah Harari,Reading,4.5,History,Non-fiction,"March 3, 2026",2011,No,,,,',
  'Lỗi ngày,Ai đó,Read,3,,Fiction,"31/02/2026 → 01/03/2026",,,,,,',
].join('\n');

describe('bộ đọc giá trị', () => {
  test('ngày nhiều dạng', () => {
    assert.equal(parseLooseDate('2025/09/14'), '2025-09-14');
    assert.equal(parseLooseDate('September 8, 2025'), '2025-09-08');
    assert.equal(parseLooseDate('8 Sep 2025'), '2025-09-08');
    assert.equal(parseLooseDate('14/09/2025'), '2025-09-14');
    assert.equal(parseLooseDate('09/14/2025'), '2025-09-14');
    assert.equal(parseLooseDate('8 tháng 9, 2025'), '2025-09-08');
    assert.equal(parseLooseDate('2025-09-14T10:00:00.000Z'), '2025-09-14');
    assert.throws(() => parseLooseDate('31/02/2026'), /không phải ngày hợp lệ/);
    assert.throws(() => parseLooseDate('hôm qua'), /Không đọc được ngày/);
    assert.deepEqual(parseDateRange('February 19, 2026 → February 26, 2026'), { start: '2026-02-19', finish: '2026-02-26' });
  });

  test('rating nhiều dạng', () => {
    assert.equal(parseRating('⭐⭐⭐⭐½'), 4.5);
    assert.equal(parseRating('★★★☆☆'), 3);
    assert.equal(parseRating('4,5'), 4.5);
    assert.equal(parseRating('8/10'), 4);
    assert.equal(parseRating('0'), null);
  });
});

describe('import API', () => {
  let ctx;
  before(async () => {
    ctx = await startTestServer();
  });
  after(() => ctx.stop());

  const goodreads = { source: 'goodreads', format: 'csv', content: GOODREADS_CSV };

  test('analyze Goodreads: nhận cột và gợi ý ánh xạ sẵn', async () => {
    const res = await ctx.api('POST', '/import/analyze', goodreads);
    assert.equal(res.status, 200);
    assert.equal(res.body.total_rows, 4);
    assert.equal(res.body.mapping.Title, 'title');
    assert.equal(res.body.mapping['Exclusive Shelf'], 'status');
    assert.equal(res.body.mapping['Date Read'], 'date_finished');
    assert.equal(res.body.mapping.ISBN, null);
    goodreads.mapping = res.body.mapping;
  });

  test('preview Goodreads: chuyển đúng, báo dòng lỗi', async () => {
    const res = await ctx.api('POST', '/import/preview', { ...goodreads, defaults: { main_category: 'Fiction' } });
    assert.equal(res.status, 200);
    assert.equal(res.body.total, 4);
    assert.equal(res.body.valid, 3);
    const [howl, notes, omens, empty] = res.body.rows;
    assert.equal(howl.status, 'Finished');
    assert.equal(howl.rating, 5);
    assert.equal(howl.reads, 2);
    assert.equal(notes.status, 'Reading');
    assert.equal(notes.main_category, 'Nonfiction', 'kệ "non-fiction" -> Nonfiction');
    assert.equal(notes.rating, null, 'My Rating 0 = chưa chấm');
    assert.equal(omens.creator_author, 'Terry Pratchett, Neil Gaiman');
    assert.deepEqual(empty.errors, ['Thiếu tiêu đề']);
  });

  test('commit Goodreads: tạo sách, lượt đọc, review, bỏ qua dòng lỗi', async () => {
    const res = await ctx.api('POST', '/import/commit', { ...goodreads, defaults: { main_category: 'Fiction' } });
    assert.equal(res.status, 200);
    assert.equal(res.body.created, 3);
    assert.equal(res.body.failed, 1);
    const howl = (await ctx.api('GET', `/items/${res.body.created_ids[0]}`)).body;
    assert.equal(howl.title, "Howl's Moving Castle (Howl's Moving Castle #1)");
    assert.equal(howl.release_year, 1986);
    assert.equal(howl.format, 'Paperback');
    assert.equal(howl.media_type, 'Book');
    assert.equal(howl.total_units, 329);
    assert.equal(howl.current_unit, 329);
    assert.deepEqual(howl.tags, ['fantasy', 'favorites']);
    assert.equal(howl.library_cards.length, 2);
    assert.equal(howl.library_cards[1].finish_date, '2025-09-14');
    assert.equal(howl.library_cards[1].review_summary, 'Rất thích.\nĐọc lại lần hai.');
    const notes = (await ctx.api('GET', `/items/${res.body.created_ids[1]}`)).body;
    assert.equal(notes.media_type, 'Ebook');
    assert.deepEqual(notes.tags, ['non-fiction']);
  });

  test('import lại cùng file: phát hiện trùng và bỏ qua', async () => {
    const preview = await ctx.api('POST', '/import/preview', goodreads);
    assert.equal(preview.body.duplicates, 3);
    assert.ok(preview.body.rows[0].duplicate.id);
    const commit = await ctx.api('POST', '/import/commit', goodreads);
    assert.equal(commit.body.created, 0);
    assert.equal(commit.body.skipped_duplicates, 3);
  });

  test('Notion CSV: gợi ý ánh xạ theo tên cột, bỏ link notion.so, khoảng ngày, Finshed', async () => {
    const analyzed = (await ctx.api('POST', '/import/analyze', { source: 'notion', format: 'csv', content: NOTION_CSV })).body;
    assert.deepEqual(analyzed.mapping, {
      Name: 'title',
      Author: 'creator_author',
      Status: 'status',
      Rating: 'rating',
      Genres: 'tags',
      Category: 'main_category',
      Dates: 'date_range',
      Published: 'release_year',
      'Favorite?': 'is_favorite',
      Ships: 'pairings',
      Fandom: 'fandoms',
      Words: 'word_count',
      Cover: 'cover_image',
    });
    const input = { source: 'notion', format: 'csv', content: NOTION_CSV, mapping: analyzed.mapping };
    const preview = (await ctx.api('POST', '/import/preview', input)).body;
    assert.equal(preview.valid, 2);
    assert.match(preview.rows[2].errors.join(), /không phải ngày hợp lệ/);

    const commit = (await ctx.api('POST', '/import/commit', input)).body;
    assert.equal(commit.created, 2);
    const fic = (await ctx.api('GET', `/items/${commit.created_ids[0]}`)).body;
    assert.equal(fic.creator_author, 'kkmylivinglife, doranice_');
    assert.equal(fic.main_category, 'Fanfiction');
    assert.equal(fic.media_type, 'Fanfic');
    assert.equal(fic.status, 'Finished');
    assert.equal(fic.rating, 5);
    assert.equal(fic.word_count, 12500);
    assert.equal(fic.is_favorite, true);
    assert.deepEqual(fic.pairings, ['Faker x Doran']);
    assert.deepEqual(
      fic.library_cards.map((card) => [card.start_date, card.finish_date]),
      [['2026-02-19', '2026-02-26']],
    );
    const sapiens = (await ctx.api('GET', `/items/${commit.created_ids[1]}`)).body;
    assert.equal(sapiens.main_category, 'Nonfiction');
    assert.equal(sapiens.library_cards[0].start_date, '2026-03-03');
  });

  test('JSON (mảng object, kiểu Notion API rút gọn) + trường riêng', async () => {
    const content = JSON.stringify([
      { Title: 'Fic JSON', Category: 'Fanfiction', Tags: ['A', 'B'], Link: 'https://ao3.org/1', Series: 'PJ1' },
    ]);
    const analyzed = (await ctx.api('POST', '/import/analyze', { source: 'generic', format: 'json', content })).body;
    assert.equal(analyzed.mapping.Link, 'custom:link');
    const commit = (await ctx.api('POST', '/import/commit', { source: 'generic', format: 'json', content, mapping: analyzed.mapping })).body;
    const item = (await ctx.api('GET', `/items/${commit.created_ids[0]}`)).body;
    assert.deepEqual(item.tags, ['A', 'B']);
    assert.deepEqual(item.custom_fields, { link: 'https://ao3.org/1', series: 'PJ1' });
  });

  test('ánh xạ thiếu cột Tiêu đề hoặc file hỏng bị chặn', async () => {
    const noTitle = await ctx.api('POST', '/import/preview', { ...goodreads, mapping: { Author: 'creator_author' } });
    assert.equal(noTitle.status, 400);
    const badJson = await ctx.api('POST', '/import/analyze', { source: 'generic', format: 'json', content: '{oops' });
    assert.equal(badJson.status, 400);
  });

  test('facets cho bộ lọc', async () => {
    const res = await ctx.api('GET', '/items/facets');
    assert.equal(res.status, 200);
    assert.equal(res.body.total, 6);
    assert.equal(res.body.categories.Fanfiction, 2);
    assert.deepEqual(res.body.read_years, [2026, 2025, 2024]);
    assert.deepEqual(res.body.release_years, { min: 1986, max: 2017 });
  });
});
