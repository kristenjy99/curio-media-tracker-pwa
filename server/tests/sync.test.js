import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, test } from 'node:test';
import { renderMarkdown, splitMarkdown } from '../services/obsidian/markdown.js';
import { mergeCards, parseWithTemplate, renderWithTemplate, starsText } from '../services/obsidian/templates/codec.js';
import { DEFAULT_TEMPLATES } from '../services/obsidian/templates/defaults.js';
import { sanitizeFileName } from '../services/obsidian/vaultFs.js';
import { startTestServer } from './helpers.js';

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const fixture = (name) => fs.readFileSync(path.join(FIXTURES, name), 'utf8');
/** Note mẫu của người dùng chưa có Category; chèn vào như khi dùng template mới. */
const withCategory = (text, category) => text.replace(/^---\n/, `---\nCategory: ${category}\n`);

describe('markdown helpers', () => {
  test('render rồi split giữ nguyên body', () => {
    for (const body of ['', 'Một dòng', '\nBắt đầu bằng dòng trống', '# H1\n\n- a\n- b\n']) {
      const split = splitMarkdown(renderMarkdown({ title: 'X', tags: ['a'] }, body));
      assert.equal(split.body, body);
      assert.deepEqual(split.data, { title: 'X', tags: ['a'] });
    }
  });

  test('đọc được file CRLF có BOM; YAML lỗi bị báo rõ', () => {
    const split = splitMarkdown('﻿---\r\ntitle: A\r\nstart: 2026-01-02\r\n---\r\n\r\nNội dung\r\n');
    assert.deepEqual(split.data, { title: 'A', start: '2026-01-02' });
    assert.equal(split.body, 'Nội dung\n');
    assert.throws(() => splitMarkdown('---\ntitle: A\n'), /không có dòng "---" đóng/);
    assert.throws(() => splitMarkdown('---\ntitle: [A\n---\n'), /YAML không hợp lệ/);
  });

  test('tên file an toàn trên Windows và Obsidian', () => {
    assert.equal(sanitizeFileName('Re:Zero / Tập 1?'), 'Re Zero Tập 1');
    assert.equal(sanitizeFileName('[[Link]] #tag | ^x'), 'Link tag x');
    assert.equal(sanitizeFileName('CON'), 'CON_');
  });
});

describe('template codec với 3 note mẫu', () => {
  test('sao: 5 -> ⭐⭐⭐⭐⭐, 4.5 -> ⭐⭐⭐⭐½, 0 -> rỗng', () => {
    assert.equal(starsText(5), '⭐⭐⭐⭐⭐');
    assert.equal(starsText(4.5), '⭐⭐⭐⭐½');
    assert.equal(starsText(0), null);
  });

  test('Howl (Fiction): đọc đúng tác giả, genres, status sai chính tả, sao, ngày, trường riêng', () => {
    const { data, body } = splitMarkdown(withCategory(fixture("Howl's moving castle.md"), 'Fiction'));
    const parsed = parseWithTemplate({ data, body, template: DEFAULT_TEMPLATES.Fiction, fallbackTitle: "Howl's moving castle" });
    assert.equal(parsed.item.title, "Howl's moving castle");
    assert.equal(parsed.item.creator_author, 'Diana Wynne Jones');
    assert.deepEqual(parsed.item.tags, ['Fantasy', 'Romance', 'Magic', 'Humour']);
    assert.equal(parsed.item.status, 'Finished', '"[[Finshed]]" được hiểu là Finished');
    assert.equal(parsed.item.rating, 5);
    assert.equal(parsed.item.release_year, 1986);
    assert.equal(parsed.item.format, 'Ebook');
    assert.equal(parsed.item.is_favorite, true);
    assert.match(parsed.item.cover_image, /^https:\/\/m\.media-amazon\.com/);
    assert.deepEqual(parsed.customFields, { series: ['Land of Ingary'] });
    assert.equal(parsed.item.review_date, '2025-09-15');
    assert.deepEqual(parsed.latest, { start_date: '2025-09-08', finish_date: '2025-09-14' });
    assert.deepEqual(parsed.extra, {});
    assert.ok(parsed.note.content_markdown.startsWith('![[howl moving castle moodboard.jpg|938]]'));
  });

  test('Tiếng lòng lặng thinh (Fanfiction): 2 tác giả, FIN?, fandom, ships, Ratings dạng list, platform', () => {
    const { data, body } = splitMarkdown(withCategory(fixture('tiếng lòng lặng thinh.md'), 'Fanfiction'));
    const parsed = parseWithTemplate({ data, body, template: DEFAULT_TEMPLATES.Fanfiction, fallbackTitle: 'tiếng lòng lặng thinh' });
    assert.equal(parsed.item.creator_author, 'kkmylivinglife, doranice_');
    assert.equal(parsed.item.status, 'Finished');
    assert.deepEqual(parsed.item.fandoms, ['LCK']);
    assert.deepEqual(parsed.item.pairings, ['Faker x Doran']);
    assert.equal(parsed.item.total_units, 2, '"Chapters: \\"2\\"" là chuỗi nhưng vẫn đọc thành số');
    assert.equal(parsed.item.rating, 5);
    assert.equal(parsed.item.format, 'Wattpad');
    assert.equal(parsed.item.language, 'Tiếng Việt');
    assert.equal(parsed.item.tags.length, 8);
    assert.equal(parsed.customFields.completion, 'Đã hoàn thành');
    assert.deepEqual(parsed.customFields.series, []);
    assert.match(parsed.customFields.link, /^https:\/\/www\.wattpad\.com/);
  });

  test('How to Take Smart Notes (Nonfiction): đang đọc, chưa có rating, mới có ngày bắt đầu', () => {
    const { data, body } = splitMarkdown(withCategory(fixture('How to Take Smart Notes.md'), 'Nonfiction'));
    const parsed = parseWithTemplate({ data, body, template: DEFAULT_TEMPLATES.Nonfiction, fallbackTitle: 'How to Take Smart Notes' });
    assert.equal(parsed.item.creator_author, 'Sönke Ahrens');
    assert.equal(parsed.item.status, 'Reading');
    assert.equal(parsed.item.rating, null);
    assert.equal(parsed.item.is_favorite, false);
    assert.equal(parsed.item.language, 'English');
    assert.deepEqual(mergeCards([], parsed), [{ start_date: '2026-05-25', finish_date: null, rating: null, review_summary: null }]);
  });

  test('ghi ra file: đúng thứ tự property của mẫu, bọc [[...]], status viết đúng chính tả, có lịch sử re-read', () => {
    const item = {
      sync_uid: 'uid-1',
      title: "Howl's Moving Castle",
      creator_author: 'Diana Wynne Jones',
      main_category: 'Fiction',
      status: 'Finished',
      rating: 5,
      release_year: 1986,
      format: 'Ebook',
      tags: ['Fantasy', 'Romance'],
      is_favorite: true,
      cover_image: 'https://example.com/c.jpg',
      review_date: '2025-09-15',
      custom_fields: { series: 'Land of Ingary' },
      obsidian_extra: {},
    };
    const cards = [
      { read_number: 1, start_date: '2024-02-01', finish_date: '2024-02-20', rating: 4 },
      { read_number: 2, start_date: '2025-09-08', finish_date: '2025-09-14', rating: 5 },
    ];
    const { data, body } = renderWithTemplate({ item, cards, note: null, template: DEFAULT_TEMPLATES.Fiction });
    assert.deepEqual(Object.keys(data), [
      'rt_id', 'Category', 'Author', 'Series', 'Genres', 'Status', 'Rating', 'Published', 'Format', 'Year',
      'Date started', 'Date finished', 'Reads', 'Favorite?', 'Cover', 'Review date',
    ]);
    assert.deepEqual(data.Author, ['[[Diana Wynne Jones]]']);
    assert.deepEqual(data.Status, ['[[Finished]]']);
    assert.equal(data.Rating, '[[⭐⭐⭐⭐⭐]]');
    assert.deepEqual(data.Year, ['[[2024]]', '[[2025]]']);
    assert.equal(data['Date started'], '2025-09-08');
    assert.deepEqual(data.Reads, ['#1 · 2024-02-01 → 2024-02-20 · ⭐⭐⭐⭐', '#2 · 2025-09-08 → 2025-09-14 · ⭐⭐⭐⭐⭐']);
    assert.equal(data['Favorite?'], true);
    assert.equal(body, DEFAULT_TEMPLATES.Fiction.body_template, 'chưa có note thì dùng phần thân mẫu');

    const text = renderMarkdown(data, body);
    assert.match(text, /^Status:\n {2}- "\[\[Finished\]\]"$/m);
    const back = parseWithTemplate({ ...splitMarkdown(text), template: DEFAULT_TEMPLATES.Fiction, fallbackTitle: 'x' });
    assert.equal(back.note.content_markdown, '', 'phần thân mẫu không bị nhập thành note');
    assert.deepEqual(
      mergeCards([], back).map(({ start_date, finish_date, rating }) => [start_date, finish_date, rating]),
      [['2024-02-01', '2024-02-20', 4], ['2025-09-08', '2025-09-14', 5]],
    );
  });
});

describe('template API', () => {
  let ctx;
  before(async () => {
    ctx = await startTestServer();
  });
  after(async () => ctx.stop());

  test('liệt kê 4 template mặc định và danh mục trường', async () => {
    const res = await ctx.api('GET', '/templates');
    assert.equal(res.status, 200);
    assert.deepEqual(Object.keys(res.body.templates), ['Fiction', 'Nonfiction', 'Fanfiction', 'Visual/Comics']);
    assert.equal(res.body.templates.Fanfiction.is_default, true);
    assert.ok(res.body.catalog.fields.some((field) => field.field === 'reads'));
    const comics = await ctx.api('GET', `/templates/${encodeURIComponent('Visual/Comics')}`);
    assert.equal(comics.status, 200);
    assert.ok(comics.body.properties.some((prop) => prop.key === 'Volumes'));
  });

  test('template sai bị chặn, báo đúng dòng', async () => {
    const base = (await ctx.api('GET', '/templates/Fiction')).body;
    const cases = [
      [[...base.properties, { key: 'author', field: 'custom:x', format: 'text' }], /Trùng tên/],
      [[...base.properties, { key: 'rt_id', field: 'custom:y', format: 'text' }], /property hệ thống/],
      [base.properties.filter((prop) => prop.field !== 'main_category'), /Thể loại chính/],
      [[...base.properties, { key: 'Sao', field: 'title', format: 'stars' }], /chỉ dùng được/],
      [[...base.properties, { key: 'Ngày', field: 'custom:d', format: 'date', link: true }], /không bọc/],
      [[...base.properties, { key: 'Bad', field: 'custom:Có Dấu', format: 'text' }], /a-z/],
    ];
    for (const [properties, pattern] of cases) {
      const res = await ctx.api('PUT', '/templates/Fiction', { properties, body_template: '' });
      assert.equal(res.status, 400);
      assert.match(JSON.stringify(res.body.error.details), pattern);
    }
  });

  test('sửa template: đổi tên, xoá, thêm trường riêng; xem trước; khôi phục mặc định', async () => {
    const base = (await ctx.api('GET', '/templates/Fiction')).body;
    const properties = base.properties
      .filter((prop) => prop.key !== 'Series')
      .map((prop) => (prop.key === 'Author' ? { ...prop, key: 'Tác giả' } : prop))
      .concat([{ key: 'Mood', field: 'custom:mood', format: 'text', link: true, list: true }]);
    const saved = await ctx.api('PUT', '/templates/Fiction', { properties, body_template: '## Cảm nhận\n' });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.is_default, false);

    const preview = await ctx.api('POST', '/templates/Fiction/preview', {});
    assert.match(preview.body, /^Tác giả:\n {2}- "\[\[Tác giả A\]\]"\n {2}- "\[\[Tác giả B\]\]"$/m);
    assert.doesNotMatch(preview.body, /^Series:/m);
    assert.match(preview.body, /^Mood:$/m);
    assert.match(preview.body, /## Cảm nhận/);

    const draft = await ctx.api('POST', '/templates/Fiction/preview', { template: { properties: base.properties, body_template: '' } });
    assert.match(draft.body, /^Author:/m, 'xem trước bản nháp chưa lưu');

    const reset = await ctx.api('POST', '/templates/Fiction/reset');
    assert.equal(reset.body.is_default, true);
    assert.ok(reset.body.properties.some((prop) => prop.key === 'Series'));
  });

  test('item lưu được trường riêng; tên trường sai bị chặn', async () => {
    const ok = await ctx.api('POST', '/items', {
      title: 'X',
      main_category: 'Fanfiction',
      custom_fields: { completion: 'Đã hoàn thành', series: ['A', 'B'] },
    });
    assert.equal(ok.status, 201);
    assert.deepEqual(ok.body.custom_fields, { completion: 'Đã hoàn thành', series: ['A', 'B'] });
    const bad = await ctx.api('POST', '/items', { title: 'Y', main_category: 'Fiction', custom_fields: { 'Có dấu': 1 } });
    assert.equal(bad.status, 400);
  });
});

function vaultHarness() {
  const h = {};
  h.setup = async (direction) => {
    h.ctx = await startTestServer();
    h.vault = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-vault-'));
    fs.mkdirSync(path.join(h.vault, '.obsidian'));
    h.folder = path.join(h.vault, 'Reading Tracker');
    const res = await h.ctx.api('PATCH', '/sync-config', { vault_path: h.vault, sync_enabled: true, ...(direction ? { sync_direction: direction } : {}) });
    assert.equal(res.status, 200);
  };
  h.teardown = async () => {
    await h.ctx.stop();
    fs.rmSync(h.vault, { recursive: true, force: true });
  };
  h.read = (rel) => fs.readFileSync(path.join(h.folder, rel), 'utf8');
  h.write = (rel, text, mtime) => {
    const target = path.join(h.folder, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, text, 'utf8');
    if (mtime) fs.utimesSync(target, mtime, mtime);
  };
  h.sync = async (query = '') => {
    const res = await h.ctx.api('POST', `/sync/run${query}`);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    return res.body;
  };
  h.only = (report, type) => report.actions.filter((action) => action.action === type);
  return h;
}

describe('sync một chiều app -> Obsidian (mặc định)', () => {
  const h = vaultHarness();
  let howl;
  before(() => h.setup());
  after(() => h.teardown());

  test('chưa bật sync thì không chạy được', async () => {
    await h.ctx.api('PATCH', '/sync-config', { sync_enabled: false });
    assert.equal((await h.ctx.api('POST', '/sync/run')).status, 400);
    await h.ctx.api('PATCH', '/sync-config', { sync_enabled: true });
  });

  test('dry-run không ghi gì; sync tạo file theo template, có re-read và phần thân mẫu', async () => {
    howl = (
      await h.ctx.api('POST', '/items', {
        title: "Howl's Moving Castle",
        creator_author: 'Diana Wynne Jones',
        main_category: 'Fiction',
        status: 'Finished',
        rating: 5,
        tags: ['Fantasy'],
        custom_fields: { series: 'Land of Ingary' },
      })
    ).body;
    await h.ctx.api('POST', `/items/${howl.id}/library-cards`, { start_date: '2024-02-01', finish_date: '2024-02-20', rating: 4 });
    await h.ctx.api('POST', `/items/${howl.id}/library-cards`, { start_date: '2025-09-08', finish_date: '2025-09-14', rating: 5 });

    const dry = await h.sync('?dry_run=true');
    assert.equal(dry.direction, 'app_to_obsidian');
    assert.equal(dry.counts.create_file, 1);
    assert.equal(fs.existsSync(h.folder), false);

    const report = await h.sync();
    assert.equal(report.counts.create_file, 1);
    const { data, body } = splitMarkdown(h.read("Fiction/Howl's Moving Castle.md"));
    assert.equal(data.rt_id, howl.sync_uid);
    assert.equal(data.Category, 'Fiction');
    assert.deepEqual(data.Series, ['[[Land of Ingary]]']);
    assert.deepEqual(data.Year, ['[[2024]]', '[[2025]]']);
    assert.equal(data.Reads.length, 2);
    assert.equal(data['Date finished'], '2025-09-14');
    assert.equal(body, DEFAULT_TEMPLATES.Fiction.body_template);
    assert.deepEqual((await h.sync()).actions, []);
  });

  test('sửa file trong Obsidian -> app ghi đè, bản Obsidian được giữ thành .conflict.md, DB không đổi', async () => {
    const edited = h.read("Fiction/Howl's Moving Castle.md").replace('[[⭐⭐⭐⭐⭐]]', '[[⭐]]');
    h.write("Fiction/Howl's Moving Castle.md", edited);
    const report = await h.sync();
    const [overwrite] = h.only(report, 'overwrite_external_edit');
    assert.match(overwrite.conflict_path, /^Fiction\/Howl's Moving Castle\.conflict-\d{8}-\d{6}\.md$/);
    assert.equal(h.read(overwrite.conflict_path), edited);
    assert.match(h.read("Fiction/Howl's Moving Castle.md"), /\[\[⭐⭐⭐⭐⭐\]\]/);
    assert.equal((await h.ctx.api('GET', `/items/${howl.id}`)).body.rating, 5);
  });

  test('file lạ trong thư mục sync bị bỏ qua, không bị đụng tới', async () => {
    const foreign = '---\nCategory: Fiction\nAuthor: X\n---\nghi chú riêng\n';
    h.write('Ghi chú riêng.md', foreign);
    const report = await h.sync();
    assert.equal(h.only(report, 'ignored')[0].path, 'Ghi chú riêng.md');
    assert.equal(h.read('Ghi chú riêng.md'), foreign);
    assert.equal((await h.ctx.api('GET', '/items')).body.total, 1);
  });

  test('note viết trong app thay cho phần thân mẫu; sửa template -> file được ghi lại', async () => {
    await h.ctx.api('PUT', `/items/${howl.id}/note`, { content_markdown: '## 🔖 Book Summary\nSophie...' });
    const base = (await h.ctx.api('GET', '/templates/Fiction')).body;
    await h.ctx.api('PUT', '/templates/Fiction', {
      properties: base.properties.map((prop) => (prop.key === 'Genres' ? { ...prop, key: 'Thể loại' } : prop)),
      body_template: base.body_template,
    });
    const report = await h.sync();
    assert.equal(h.only(report, 'write_file').length, 1);
    const { data, body } = splitMarkdown(h.read("Fiction/Howl's Moving Castle.md"));
    assert.deepEqual(data['Thể loại'], ['[[Fantasy]]']);
    assert.equal(data.Genres, undefined);
    assert.equal(body, '## 🔖 Book Summary\nSophie...');
  });

  test('xoá file trong Obsidian -> tạo lại; xoá sách trong app -> file vào .trash', async () => {
    fs.rmSync(path.join(h.folder, 'Fiction', "Howl's Moving Castle.md"));
    assert.equal(h.only(await h.sync(), 'recreate_file').length, 1);
    await h.ctx.api('DELETE', `/items/${howl.id}`);
    const [trashed] = h.only(await h.sync(), 'trash_file');
    assert.match(trashed.trash_path, /^\.trash\/Howl's Moving Castle \(\d{8}-\d{6}\)\.md$/);
    assert.equal(fs.existsSync(path.join(h.folder, 'Fiction', "Howl's Moving Castle.md")), false);
  });
});

describe('sync hai chiều (tuỳ chọn)', () => {
  const h = vaultHarness();
  before(() => h.setup('two_way'));
  after(() => h.teardown());

  test('note mẫu của người dùng (thêm Category) được nhập thành sách, gắn rt_id, giữ nguyên nội dung', async () => {
    const original = withCategory(fixture('tiếng lòng lặng thinh.md'), 'Fanfiction');
    h.write('tiếng lòng lặng thinh.md', original);
    const report = await h.sync();
    const [created] = h.only(report, 'import_new');
    assert.ok(created, JSON.stringify(report.actions));
    const item = (await h.ctx.api('GET', `/items/${created.item_id}`)).body;
    assert.equal(item.title, 'tiếng lòng lặng thinh');
    assert.deepEqual(item.pairings, ['Faker x Doran']);
    assert.equal(item.custom_fields.completion, 'Đã hoàn thành');
    const text = h.read('tiếng lòng lặng thinh.md');
    assert.equal(text, `---\nrt_id: ${item.sync_uid}\n${original.slice(4)}`);
    assert.deepEqual((await h.sync()).actions, []);
  });

  test('file thiếu Category bị bỏ qua kèm lý do', async () => {
    h.write('Howl.md', fixture("Howl's moving castle.md"));
    const [skipped] = h.only(await h.sync(), 'skip');
    assert.match(skipped.reason, /Category/);
    fs.rmSync(path.join(h.folder, 'Howl.md'));
  });

  test('sửa trong Obsidian (Date finished, sao) -> cập nhật lượt đọc mới nhất và rating', async () => {
    const id = (await h.ctx.api('GET', '/items')).body.data[0].id;
    const text = h.read('tiếng lòng lặng thinh.md')
      .replace(/^Ratings:\n {2}- "\[\[⭐⭐⭐⭐⭐\]\]"$/m, 'Ratings:\n  - "[[⭐⭐⭐½]]"')
      .replace(/^Status: .*$/m, 'Status: "[[Finshed]]"\nDate started: 2026-02-20\nDate finished: 2026-02-26');
    h.write('tiếng lòng lặng thinh.md', text);
    assert.equal(h.only(await h.sync(), 'import_file').length, 1);
    const item = (await h.ctx.api('GET', `/items/${id}`)).body;
    assert.equal(item.rating, 3.5);
    assert.equal(item.status, 'Finished');
    assert.deepEqual(
      item.library_cards.map((card) => [card.start_date, card.finish_date]),
      [['2026-02-20', '2026-02-26']],
    );
  });

  test('conflict: file sửa sau thắng, bản app lưu thành .conflict.md', async () => {
    const id = (await h.ctx.api('GET', '/items')).body.data[0].id;
    await h.ctx.api('PATCH', `/items/${id}`, { language: 'English' });
    await h.sync();
    await h.ctx.api('PATCH', `/items/${id}`, { word_count: 9000 });
    h.write('tiếng lòng lặng thinh.md', h.read('tiếng lòng lặng thinh.md').replace(/^Chapters: .*$/m, 'Chapters: 3'), new Date(Date.now() + 60_000));
    const [conflict] = h.only(await h.sync(), 'conflict');
    assert.equal(conflict.winner, 'file');
    const item = (await h.ctx.api('GET', `/items/${id}`)).body;
    assert.equal(item.total_units, 3);
    assert.equal(item.word_count, null, 'sửa word_count của app thua');
    assert.equal(splitMarkdown(h.read(conflict.conflict_path)).data.Words, 9000);
  });

  test('đổi tên file trong Obsidian -> app theo dõi đường dẫn mới', async () => {
    fs.renameSync(path.join(h.folder, 'tiếng lòng lặng thinh.md'), path.join(h.folder, 'Faran - Tiếng lòng.md'));
    const [moved] = h.only(await h.sync(), 'track_move');
    assert.equal(moved.path, 'Faran - Tiếng lòng.md');
  });
});

describe('sync một chiều: chia thư mục theo thể loại', () => {
  const h = vaultHarness();
  before(() => h.setup());
  after(() => h.teardown());

  test('mỗi thể loại một thư mục; đổi thể loại thì file chuyển thư mục; thư mục trống bị dọn', async () => {
    const make = (title, category) => h.ctx.api('POST', '/items', { title, main_category: category }).then((res) => res.body);
    const fic = await make('Fic A', 'Fanfiction');
    await make('Novel B', 'Fiction');
    await make('Notes C', 'Nonfiction');
    await make('Manga D', 'Visual/Comics');
    const first = await h.sync();
    assert.deepEqual(
      h.only(first, 'create_file').map((action) => action.path).sort(),
      ['Comics/Manga D.md', 'Fanfiction/Fic A.md', 'Fiction/Novel B.md', 'Nonfiction/Notes C.md'],
    );
    assert.deepEqual((await h.sync()).actions, []);

    await h.ctx.api('PATCH', `/items/${fic.id}`, { main_category: 'Fiction' });
    const [moved] = h.only(await h.sync(), 'move_file');
    assert.deepEqual([moved.from, moved.path], ['Fanfiction/Fic A.md', 'Fiction/Fic A.md']);
    assert.ok(fs.existsSync(path.join(h.folder, 'Fiction', 'Fic A.md')));
    assert.equal(fs.existsSync(path.join(h.folder, 'Fanfiction')), false, 'thư mục Fanfiction trống bị dọn');
    assert.match(h.read('Fiction/Fic A.md'), /^Category: Fiction$/m);
    assert.deepEqual((await h.sync()).actions, []);
  });

  test('file sync từ trước (nằm ở gốc) được chuyển vào thư mục; trùng tên thì thêm số', async () => {
    await h.ctx.api('PATCH', '/sync-config', { category_folders: false });
    const old = (await h.ctx.api('POST', '/items', { title: 'Novel B', main_category: 'Fiction', creator_author: 'Khác' })).body;
    const created = h.only(await h.sync(), 'move_file');
    assert.equal(created.length, 4, 'tắt chia thư mục thì đưa hết về gốc');
    assert.ok(fs.existsSync(path.join(h.folder, 'Novel B (2).md')) || fs.existsSync(path.join(h.folder, 'Novel B.md')));
    await h.ctx.api('PATCH', '/sync-config', { category_folders: true });
    const report = await h.sync();
    const paths = h.only(report, 'move_file').map((action) => action.path).sort();
    assert.ok(paths.includes('Fiction/Novel B.md') && paths.includes('Fiction/Novel B (2).md'), JSON.stringify(paths));
    assert.equal((await h.ctx.api('GET', `/items/${old.id}`)).body.obsidian_path.startsWith('Fiction/'), true);
  });

  test('sửa file trong Obsidian rồi đổi thể loại: bản Obsidian được giữ ở thư mục mới', async () => {
    const item = (await h.ctx.api('GET', '/items?q=Manga')).body.data[0];
    h.write('Comics/Manga D.md', `${h.read('Comics/Manga D.md')}\nghi chú viết tay\n`);
    await h.ctx.api('PATCH', `/items/${item.id}`, { main_category: 'Fiction' });
    const [moved] = h.only(await h.sync(), 'move_file');
    assert.match(moved.conflict_path, /^Fiction\/Manga D\.conflict-\d{8}-\d{6}\.md$/);
    assert.match(h.read(moved.conflict_path), /ghi chú viết tay/);
  });

  test('đổi tên thư mục; tên không hợp lệ hoặc trùng bị chặn', async () => {
    assert.equal((await h.ctx.api('PATCH', '/sync-config', { folder_names: { Fiction: 'Tiểu/thuyết' } })).status, 400);
    assert.equal((await h.ctx.api('PATCH', '/sync-config', { folder_names: { Fiction: 'Sách', Nonfiction: 'sách' } })).status, 400);
    const res = await h.ctx.api('PATCH', '/sync-config', { folder_names: { Fiction: 'Tiểu thuyết' } });
    assert.equal(res.body.folder_names.Fiction, 'Tiểu thuyết');
    assert.equal(res.body.folder_names.Fanfiction, 'Fanfiction');
    const report = await h.sync();
    assert.ok(h.only(report, 'move_file').every((action) => action.path.startsWith('Tiểu thuyết/')));
    // Chỉ còn lại file backup .conflict ở thư mục cũ; app không tự chuyển hay xoá bản backup.
    assert.ok(fs.readdirSync(path.join(h.folder, 'Fiction')).every((name) => /\.conflict-\d{8}-\d{6}\.md$/.test(name)));
  });
});
