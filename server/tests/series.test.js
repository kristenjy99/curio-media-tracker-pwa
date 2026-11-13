import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanSeriesName } from '../services/seriesService.js';
import { startTestServer } from './helpers.js';

test('series: tên link Obsidian được chuẩn hoá', () => {
  assert.equal(cleanSeriesName('[[Percy Jackson|PJ]]'), 'Percy Jackson');
  assert.equal(cleanSeriesName('  Harry   Potter '), 'Harry Potter');
});

test('series: gộp sách và media cùng tên, lưu thứ tự, chặn phần lạ', async () => {
  const s = await startTestServer();
  try {
    const b1 = (await s.api('POST', '/items', { title: 'Tập 2', main_category: 'Fiction', custom_fields: { series: '[[Witcher]]' } })).body;
    const b2 = (await s.api('POST', '/items', { title: 'Tập 1', main_category: 'Fiction', custom_fields: { series: ['witcher', 'Khác'] } })).body;
    const m1 = (await s.api('POST', '/media/items', { title: 'The Witcher', category: 'tv_series', series_name: 'Witcher' })).body;

    let list = (await s.api('GET', '/series')).body.data;
    const witcher = list.find((group) => group.key === 'witcher');
    assert.equal(witcher.entries.length, 3);
    assert.equal(witcher.book_count, 2);
    assert.equal(witcher.media_count, 1);
    assert.ok(list.some((group) => group.name === 'Khác'));

    const order = [{ source: 'media', id: m1.id }, { source: 'book', id: b2.id }, { source: 'book', id: b1.id }];
    const saved = await s.api('PUT', '/series/order', { name: 'Witcher', entries: order });
    assert.equal(saved.status, 200);
    assert.deepEqual(saved.body.data.entries.map((entry) => entry.title), ['The Witcher', 'Tập 1', 'Tập 2']);
    list = (await s.api('GET', '/series')).body.data;
    assert.deepEqual(list.find((group) => group.key === 'witcher').entries.map((entry) => entry.id), [m1.id, b2.id, b1.id]);

    assert.equal((await s.api('PUT', '/series/order', { name: 'Witcher', entries: [{ source: 'book', id: 999 }] })).status, 400);
    assert.equal((await s.api('PUT', '/series/order', { name: 'Không có', entries: [] })).status, 404);

    await s.api('PATCH', `/items/${b1.id}`, { creator_author: 'Andrzej Sapkowski, Người dịch A' });
    await s.api('PATCH', `/items/${b2.id}`, { creator_author: 'andrzej sapkowski' });
    const authors = (await s.api('GET', '/authors')).body.data;
    assert.equal(authors[0].books.length, 2);
    assert.deepEqual(authors[0].books[0].series, ['witcher', 'Khác']);
    assert.ok(authors.some((author) => author.name === 'Người dịch A'));
  } finally {
    await s.stop();
  }
});

test('facets: pairing lọc theo fandom, giá trị trường riêng và nền tảng', async () => {
  const s = await startTestServer();
  try {
    await s.api('POST', '/items', { title: 'A', main_category: 'Fanfiction', format: 'AO3', fandoms: ['HP'], pairings: ['Drarry'], custom_fields: { completion: 'Completed' } });
    await s.api('POST', '/items', { title: 'B', main_category: 'Fanfiction', format: 'AO3', fandoms: ['HP', 'BTS'], pairings: ['Wolfstar'], custom_fields: { completion: 'WIP' } });
    await s.api('POST', '/items', { title: 'C', main_category: 'Fanfiction', format: 'Wattpad', fandoms: ['BTS'], pairings: ['Taekook'] });

    const all = (await s.api('GET', '/items/pairings')).body.data.map((row) => row.value).sort();
    assert.deepEqual(all, ['Drarry', 'Taekook', 'Wolfstar']);
    const hp = (await s.api('GET', '/items/pairings?fandom=HP')).body.data.map((row) => row.value).sort();
    assert.deepEqual(hp, ['Drarry', 'Wolfstar']);
    const both = (await s.api('GET', '/items/pairings?fandom=hp&fandom=BTS')).body.data.map((row) => row.value);
    assert.deepEqual(both, ['Wolfstar']);

    const facets = (await s.api('GET', '/items/facets')).body;
    assert.deepEqual([...facets.custom_values.completion].sort(), ['Completed', 'WIP']);
    assert.equal(facets.formats.find((row) => row.value === 'AO3').count, 2);
  } finally {
    await s.stop();
  }
});

test('authors: tách nhiều tác giả, gom sách và tính điểm trung bình', async () => {
  const s = await startTestServer();
  try {
    await s.api('POST', '/items', { title: 'Good Omens', main_category: 'Fiction', creator_author: 'Terry Pratchett, Neil Gaiman', rating: 5, release_year: 1990 });
    await s.api('POST', '/items', { title: 'Coraline', main_category: 'Fiction', creator_author: 'Neil Gaiman', rating: 4, release_year: 2002 });
    const list = (await s.api('GET', '/authors')).body.data;
    const neil = list.find((group) => group.name === 'Neil Gaiman');
    assert.deepEqual(neil.books.map((book) => book.title), ['Good Omens', 'Coraline']);
    assert.equal(neil.average_rating, 4.5);
    assert.ok(list.some((group) => group.name === 'Terry Pratchett'));
  } finally {
    await s.stop();
  }
});

test('kho fandom & cặp đôi, pairing theo từng fandom, độ spicy', async () => {
  const s = await startTestServer();
  try {
    await s.api('POST', '/items', { title: 'A', main_category: 'Fanfiction', fandoms: ['Harry Potter'], pairings: ['Draco x Harry'], tropes: ['Enemies to lovers'], tags: ['Smut'], spice_rating: 3.5 });
    await s.api('POST', '/items', { title: 'B', main_category: 'Fanfiction', fandoms: ['BTS'], pairings: ['Taekook'], tags: ['Fluff'], spice_rating: 2 });
    const map = (await s.api('GET', '/items/fandom-pairings')).body.data;
    assert.deepEqual(map['Harry Potter'], ['Draco x Harry']);
    assert.deepEqual((await s.api('GET', '/items/facets')).body.tropes.map((row) => row.value), ['Enemies to lovers']);

    const lib = [{ fandom: 'Harry Potter', pairings: ['Drarry', 'drarry', 'Wolfstar'] }];
    const saved = (await s.api('PATCH', '/settings', { fandom_library: lib })).body.fandom_library;
    assert.deepEqual(saved[0].pairings, ['Drarry', 'Wolfstar']);
    assert.equal((await s.api('PATCH', '/settings', { fandom_library: [...lib, { fandom: 'harry potter', pairings: [] }] })).status, 400);

    assert.equal((await s.api('PATCH', '/items/1', { spice_rating: 7 })).status, 400);
    const reads = await s.api('GET', '/dashboard?year=2026');
    assert.equal(reads.status, 200);
  } finally {
    await s.stop();
  }
});

test('facets: warnings, tropes và series đã nhập được dùng làm danh sách chọn', async () => {
  const s = await startTestServer();
  try {
    await s.api('POST', '/items', { title: 'A', main_category: 'Fiction', tropes: ['Enemies to lovers'], warnings: ['Violence'], custom_fields: { series: 'Witcher' } });
    await s.api('POST', '/items', { title: 'B', main_category: 'Nonfiction', tropes: ['enemies to lovers'] });
    await s.api('POST', '/items', { title: 'C', main_category: 'Fanfiction', warnings: ['Violence', 'Major character death'] });
    const facets = (await s.api('GET', '/items/facets')).body;
    assert.deepEqual(facets.warnings.map((row) => [row.value, row.count]), [['Violence', 2], ['Major character death', 1]]);
    assert.equal(facets.tropes[0].count, 2);
    assert.deepEqual(facets.custom_values.series, ['Witcher']);
  } finally {
    await s.stop();
  }
});
