import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ensureStorageLayout, getStoragePaths } from '../config/storage.js';
import { foldText } from '../services/quoteService.js';
import { titleKey } from '../services/itemService.js';
import { startTestServer } from './helpers.js';

/** Patch 6: quotes & highlights, cảnh báo trùng tên sách, lọc theo tác giả. */

test('quotes: thêm, sửa, xoá; danh sách kèm sách nguồn và tác giả', async () => {
  const s = await startTestServer();
  try {
    const book = (await s.api('POST', '/items', { title: 'Rừng Na Uy', creator_author: 'Haruki Murakami', main_category: 'Fiction' })).body;
    const created = await s.api('POST', '/quotes', { item_id: book.id, content: '  Đừng thương hại bản thân.  ', location: 'tr. 42', note: '' });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.content, 'Đừng thương hại bản thân.');
    assert.equal(created.body.kind, 'quote');
    assert.equal(created.body.note, null, 'ghi chú rỗng lưu là null');
    assert.equal(created.body.item_title, 'Rừng Na Uy');
    assert.equal(created.body.item_author, 'Haruki Murakami');
    assert.match(await s.db.get('SELECT sync_uid FROM quotes WHERE id = ?', [created.body.id], { pluck: true }), /^[0-9a-f-]{36}$/);

    const patched = await s.api('PATCH', `/quotes/${created.body.id}`, { kind: 'highlight', note: 'Đoạn mở đầu chương 3' });
    assert.equal(patched.status, 200);
    assert.equal(patched.body.kind, 'highlight');
    assert.equal(patched.body.location, 'tr. 42', 'trường không gửi giữ nguyên');

    assert.equal((await s.api('POST', '/quotes', { item_id: book.id, content: '   ' })).status, 400);
    assert.equal((await s.api('POST', '/quotes', { item_id: 9999, content: 'x' })).status, 404);
    assert.equal((await s.api('PATCH', `/quotes/${created.body.id}`, {})).status, 400);

    const list = await s.api('GET', `/quotes?item_id=${book.id}`);
    assert.equal(list.body.total, 1);
    assert.deepEqual(list.body.counts, { quote: 0, highlight: 1 });

    assert.equal((await s.api('DELETE', `/quotes/${created.body.id}`)).status, 204);
    assert.equal((await s.api('DELETE', `/quotes/${created.body.id}`)).status, 404);
    assert.equal(await s.db.get("SELECT COUNT(*) FROM sync_deletions WHERE table_name = 'quotes'", [], { pluck: true }), 1, 'xoá quote ghi dấu cho đồng bộ Drive');
  } finally {
    await s.stop();
  }
});

test('quotes: tìm không phân biệt hoa thường và dấu, tìm cả theo tên sách/tác giả; xoá sách xoá quotes', async () => {
  const s = await startTestServer();
  try {
    const a = (await s.api('POST', '/items', { title: 'Rừng Na Uy', creator_author: 'Haruki Murakami', main_category: 'Fiction' })).body;
    const b = (await s.api('POST', '/items', { title: 'Nhà giả kim', creator_author: 'Paulo Coelho', main_category: 'Fiction' })).body;
    await s.api('POST', '/quotes', { item_id: a.id, content: 'Thời gian trôi qua như nước.' });
    await s.api('POST', '/quotes', { item_id: b.id, content: 'Khi bạn khao khát một điều gì đó...', kind: 'highlight' });
    await s.api('POST', '/quotes', { item_id: b.id, content: 'Đường đời là của bạn.', note: 'thích câu này' });

    const search = async (query) => (await s.api('GET', `/quotes?q=${encodeURIComponent(query)}`)).body;
    assert.equal((await search('THOI GIAN')).total, 1);
    assert.equal((await search('duong doi')).data[0].item_title, 'Nhà giả kim');
    assert.equal((await search('coelho')).total, 2, 'tìm theo tác giả');
    assert.equal((await search('rừng na')).total, 1, 'tìm theo tên sách');
    assert.equal((await search('thích')).total, 1, 'tìm trong ghi chú');
    assert.equal((await search('coelho khao')).total, 1, 'nhiều từ thì phải khớp đủ');
    assert.equal((await search('không có')).total, 0);
    assert.equal((await s.api('GET', '/quotes?kind=highlight')).body.total, 1);
    assert.equal(foldText('  Đường   ĐỜI '), 'duong doi');

    assert.equal((await s.api('DELETE', `/items/${b.id}`)).status, 204);
    const after = (await s.api('GET', '/quotes')).body;
    assert.equal(after.total, 1);
    assert.deepEqual(after.counts, { quote: 1, highlight: 0 });
  } finally {
    await s.stop();
  }
});

test('trùng tên sách: không phân biệt hoa thường, dấu câu, khoảng trắng; bỏ qua sách đang sửa', async () => {
  const s = await startTestServer();
  try {
    const dune = (await s.api('POST', '/items', { title: 'Dune: Xứ Cát', creator_author: 'Frank Herbert', main_category: 'Fiction' })).body;
    await s.api('POST', '/items', { title: 'dune  xứ cát!', creator_author: 'Khác', main_category: 'Fanfiction' });
    const check = async (query) => (await s.api('GET', `/items/title-check?${query}`)).body.data;

    const matches = await check(`title=${encodeURIComponent('  DUNE - xứ cát ')}`);
    assert.equal(matches.length, 2);
    assert.deepEqual(Object.keys(matches[0]).sort(), ['creator_author', 'id', 'main_category', 'release_year', 'status', 'title']);
    assert.equal(matches[0].creator_author, 'Frank Herbert');
    assert.equal((await check(`title=${encodeURIComponent('Dune xu cat')}`)).length, 0, 'vẫn phân biệt dấu tiếng Việt');
    assert.equal((await check(`title=${encodeURIComponent('Dune: Xứ Cát')}&exclude_id=${dune.id}`)).length, 1);
    assert.equal((await check(`title=${encodeURIComponent('!!!')}`)).length, 0);
    assert.equal((await s.api('GET', '/items/title-check')).status, 400);
    assert.equal(titleKey('Harry Potter: Hòn đá   Phù thủy'), titleKey('harry potter hòn đá phù thuỷ'));
    // Dấu thanh kiểu cũ/kiểu mới là một; có dấu và không dấu vẫn khác nhau.
    for (const [a, b] of [['Hòa bình', 'Hoà bình'], ['Thủy hử', 'THUỶ HỬ'], ['Khóa học', 'khoá học'], ['Quý', 'Qúy']]) assert.equal(titleKey(a), titleKey(b), `${a} / ${b}`);
    assert.notEqual(titleKey('Hòa bình'), titleKey('Hoa bình'));
    assert.notEqual(titleKey('Mẹ'), titleKey('Me'));
    await s.api('POST', '/items', { title: 'Chiến tranh và hoà bình', main_category: 'Fiction' });
    assert.equal((await check(`title=${encodeURIComponent('chiến tranh và hòa bình')}`)).length, 1, 'gõ kiểu bỏ dấu khác vẫn nhận ra trùng');
  } finally {
    await s.stop();
  }
});

test('lọc kệ sách theo tác giả: tách dấu phẩy, không phân biệt hoa thường, nhiều tác giả là OR; facet có số theo thể loại', async () => {
  const s = await startTestServer();
  try {
    await s.api('POST', '/items', { title: 'Good Omens', creator_author: 'Terry Pratchett, Neil Gaiman', main_category: 'Fiction' });
    await s.api('POST', '/items', { title: 'Coraline', creator_author: 'neil gaiman', main_category: 'Fiction' });
    await s.api('POST', '/items', { title: 'Sandman fic', creator_author: 'Neil Gaiman', main_category: 'Fanfiction' });
    await s.api('POST', '/items', { title: 'Mort', creator_author: 'Terry Pratchett', main_category: 'Fiction' });
    await s.api('POST', '/items', { title: 'Vô danh', main_category: 'Fiction' });
    const titles = async (query) => (await s.api('GET', `/items?${query}&sort=title&order=asc`)).body.data.map((item) => item.title);

    assert.deepEqual(await titles('author=Neil%20Gaiman'), ['Coraline', 'Good Omens', 'Sandman fic']);
    assert.deepEqual(await titles('author=Neil%20Gaiman&main_category=Fiction'), ['Coraline', 'Good Omens']);
    assert.deepEqual(await titles('author=Terry%20Pratchett&author=neil%20gaiman&main_category=Fiction'), ['Coraline', 'Good Omens', 'Mort']);
    assert.deepEqual(await titles('author=Không%20ai'), []);

    const facets = (await s.api('GET', '/items/facets')).body;
    const neil = facets.authors.find((entry) => entry.value.toLowerCase() === 'neil gaiman');
    assert.equal(neil.count, 3);
    assert.deepEqual(neil.categories, { Fiction: 2, Fanfiction: 1 });
    assert.equal(facets.authors.length, 2);
  } finally {
    await s.stop();
  }
});

async function device() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-quotes-'));
  const storagePaths = getStoragePaths(root);
  ensureStorageLayout(storagePaths);
  return startTestServer({ storagePaths });
}

async function sync(s, drive) {
  const applied = await s.api('POST', '/drive-sync/apply', { remote: drive.snapshot, mode: 'merge', device: 'test' });
  assert.equal(applied.status, 200, JSON.stringify(applied.body));
  drive.snapshot = JSON.parse(JSON.stringify(applied.body.snapshot));
  const base = Object.fromEntries(Object.entries(drive.snapshot.units).map(([key, unit]) => [key, unit.hash]));
  assert.equal((await s.api('POST', '/drive-sync/commit', { base })).status, 200);
  return applied.body;
}

test('đồng bộ Drive: quotes đi theo sách, sửa/xoá quote lan sang máy kia, đồng bộ lặp lại không đẩy qua lại', async () => {
  const [a, b] = [await device(), await device()];
  const drive = { snapshot: null };
  try {
    const plain = (await a.api('POST', '/items', { title: 'Không quote', main_category: 'Fiction' })).body;
    const book = (await a.api('POST', '/items', { title: 'Có quote', main_category: 'Fiction' })).body;
    const quote = (await a.api('POST', '/quotes', { item_id: book.id, content: 'Câu thứ nhất', location: 'ch. 1' })).body;
    const quoteUid = await a.db.get('SELECT sync_uid FROM quotes WHERE id = ?', [quote.id], { pluck: true });
    await a.api('POST', '/quotes', { item_id: book.id, content: 'Câu thứ hai', kind: 'highlight' });
    await sync(a, drive);
    assert.ok(!('quotes' in drive.snapshot.units[`book:${plain.sync_uid}`].data), 'sách không có quote giữ nguyên dữ liệu đơn vị như trước');

    await sync(b, drive);
    const copy = await b.db.get('SELECT id FROM items WHERE sync_uid = ?', [book.sync_uid]);
    const onB = (await b.api('GET', `/quotes?item_id=${copy.id}`)).body.data;
    assert.deepEqual(onB.map((row) => row.content).sort(), ['Câu thứ hai', 'Câu thứ nhất']);

    // B sửa một quote, xoá quote kia; A nhận đủ.
    const first = onB.find((row) => row.content === 'Câu thứ nhất');
    const second = onB.find((row) => row.content === 'Câu thứ hai');
    await b.api('PATCH', `/quotes/${first.id}`, { content: 'Câu thứ nhất (đã sửa)' });
    await b.api('DELETE', `/quotes/${second.id}`);
    await sync(b, drive);
    await sync(a, drive);
    const onA = (await a.api('GET', `/quotes?item_id=${book.id}`)).body.data;
    assert.deepEqual(onA.map((row) => row.content), ['Câu thứ nhất (đã sửa)']);
    assert.equal(await a.db.get('SELECT sync_uid FROM quotes', [], { pluck: true }), quoteUid, 'quote giữ định danh qua hai máy');
    assert.equal(onA[0].location, 'ch. 1');

    for (const s of [a, b, a]) {
      const again = await sync(s, drive);
      assert.equal(again.stats.pulled, 0);
      assert.equal(again.stats.pushed, 0);
    }
  } finally {
    await a.stop();
    await b.stop();
  }
});
