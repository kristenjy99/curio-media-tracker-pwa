import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, test } from 'node:test';
import { getStoragePaths, ensureStorageLayout } from '../config/storage.js';
import { detectImageType } from '../services/imageService.js';
import { discoverVaults } from '../services/obsidian/vaultDiscovery.js';
import { startTestServer } from './helpers.js';

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
// PNG 1x1 hợp lệ.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

describe('nhận dạng ảnh', () => {
  test('theo chữ ký file, không theo đuôi', () => {
    assert.equal(detectImageType(PNG), 'png');
    assert.equal(detectImageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])), 'jpg');
    assert.equal(detectImageType(Buffer.from('RIFF0000WEBPVP8 ')), 'webp');
    assert.equal(detectImageType(Buffer.from('<html>không phải ảnh</html>')), null);
  });
});

describe('tìm vault Obsidian', () => {
  test('đọc obsidian.json, đánh dấu vault đang mở và vault còn tồn tại', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-obs-'));
    const vaultA = path.join(dir, 'Vault A');
    fs.mkdirSync(path.join(vaultA, '.obsidian'), { recursive: true });
    const config = path.join(dir, 'obsidian.json');
    fs.writeFileSync(
      config,
      JSON.stringify({ vaults: { a: { path: vaultA, ts: 1700000000000, open: true }, b: { path: path.join(dir, 'Đã xoá'), ts: 1800000000000 } } }),
    );
    const { vaults } = discoverVaults([config, path.join(dir, 'không-có.json')]);
    assert.equal(vaults.length, 2);
    assert.deepEqual(
      vaults.map((vault) => [vault.name, vault.open, vault.exists, vault.is_vault]),
      [
        ['Vault A', true, true, true],
        ['Đã xoá', false, false, false],
      ],
    );
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('ảnh bìa và gáy sách', () => {
  let ctx;
  let storage;
  before(async () => {
    storage = ensureStorageLayout(getStoragePaths(fs.mkdtempSync(path.join(os.tmpdir(), 'rt-media-'))));
    ctx = await startTestServer({ storagePaths: storage });
  });
  after(async () => {
    await ctx.stop();
    fs.rmSync(storage.root, { recursive: true, force: true });
  });

  const put = (id, kind, body, type = 'image/png') =>
    fetch(`${ctx.baseUrl}/items/${id}/images/${kind}`, { method: 'PUT', headers: { 'Content-Type': type }, body }).then(async (r) => ({ status: r.status, body: await r.json() }));

  test('tải ảnh gáy + bìa, ảnh được phục vụ qua /media, thay ảnh thì xoá file cũ', async () => {
    const item = (await ctx.api('POST', '/items', { title: 'Có ảnh', main_category: 'Fiction' })).body;
    const spine = await put(item.id, 'spine', PNG);
    assert.equal(spine.status, 200);
    assert.match(spine.body.spine_image, new RegExp(`^/media/items/${item.sync_uid}/spine-\\d+\\.png$`));
    const served = await fetch(ctx.baseUrl.replace('/api', '') + spine.body.spine_image);
    assert.equal(served.status, 200);
    assert.equal(Buffer.from(await served.arrayBuffer()).equals(PNG), true);

    const cover = await put(item.id, 'cover', PNG);
    assert.match(cover.body.cover_image, /\/cover-\d+\.png$/);
    await new Promise((resolve) => setTimeout(resolve, 5));
    const replaced = await put(item.id, 'cover', PNG);
    const dir = path.join(storage.uploadsDir, 'items', item.sync_uid);
    assert.deepEqual(fs.readdirSync(dir).sort(), [path.basename(replaced.body.cover_image), path.basename(spine.body.spine_image)].sort());

    const removed = await ctx.api('DELETE', `/items/${item.id}/images/spine`);
    assert.equal(removed.body.spine_image, null);
    assert.equal(fs.readdirSync(dir).length, 1);

    await ctx.api('DELETE', `/items/${item.id}`);
    assert.equal(fs.existsSync(dir), false, 'xoá sách thì xoá thư mục ảnh');
  });

  test('file không phải ảnh hoặc loại ảnh sai bị chặn', async () => {
    const item = (await ctx.api('POST', '/items', { title: 'X', main_category: 'Fiction' })).body;
    assert.equal((await put(item.id, 'cover', Buffer.from('<svg onload=alert(1)>'), 'image/svg+xml')).status, 400);
    assert.equal((await put(item.id, 'back', PNG)).status, 400);
    assert.equal((await put(99999, 'cover', PNG)).status, 404);
  });

  test('/media không cho thoát ra ngoài thư mục uploads', async () => {
    fs.writeFileSync(path.join(storage.root, 'secret.txt'), 'bí mật');
    const res = await fetch(ctx.baseUrl.replace('/api', '') + '/media/..%2Fsecret.txt');
    assert.notEqual(res.status, 200);
  });
});

describe('import file markdown từ Obsidian', () => {
  let ctx;
  const files = fs.readdirSync(FIXTURES).map((name) => ({ path: `Books/${name}`, content: fs.readFileSync(path.join(FIXTURES, name), 'utf8') }));
  before(async () => {
    ctx = await startTestServer();
  });
  after(() => ctx.stop());

  test('xem trước 3 note mẫu: đoán thể loại, đọc đúng dữ liệu, không ghi gì', async () => {
    const res = await ctx.api('POST', '/import/markdown/preview', {
      files: [...files, { path: 'Books/.obsidian/x.md', content: '' }, { path: 'Books/ảnh.png', content: '' }],
      default_category: 'Fiction',
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.total, 3);
    assert.equal(res.body.skipped_files, 2);
    const byTitle = Object.fromEntries(res.body.rows.map((row) => [row.title, row]));
    assert.equal(byTitle["Howl's moving castle"].category, 'Fiction');
    assert.equal(byTitle["Howl's moving castle"].detected_by, 'default');
    assert.equal(byTitle['tiếng lòng lặng thinh'].category, 'Fanfiction');
    assert.equal(byTitle['tiếng lòng lặng thinh'].detected_by, 'template');
    assert.equal(byTitle['How to Take Smart Notes'].status, 'Reading');
    assert.ok(res.body.rows.every((row) => row.errors.length === 0), JSON.stringify(res.body.rows));
    assert.equal((await ctx.api('GET', '/items')).body.total, 0);
  });

  test('nhập: chọn tay thể loại Nonfiction cho Smart Notes; lượt đọc theo ngày và theo năm; giữ nội dung note', async () => {
    const res = await ctx.api('POST', '/import/markdown/commit', {
      files,
      default_category: 'Fiction',
      overrides: { 'Books/How to Take Smart Notes.md': 'Nonfiction' },
    });
    assert.equal(res.body.created, 3);
    const all = (await ctx.api('GET', '/items?sort=title&order=asc')).body.data;
    const [notes, howl, fic] = all;
    assert.equal(notes.main_category, 'Nonfiction');

    const howlDetail = (await ctx.api('GET', `/items/${howl.id}`)).body;
    assert.equal(howlDetail.status, 'Finished');
    assert.equal(howlDetail.rating, 5);
    assert.deepEqual(howlDetail.custom_fields, { series: ['Land of Ingary'] });
    assert.equal(howlDetail.review_date, '2025-09-15');
    assert.deepEqual(howlDetail.library_cards.map((card) => [card.start_date, card.finish_date]), [['2025-09-08', '2025-09-14']]);
    const howlNote = (await ctx.api('GET', `/items/${howl.id}/note`)).body;
    assert.match(howlNote.content_markdown, /^!\[\[howl moving castle moodboard\.jpg\|938\]\]/);

    const ficDetail = (await ctx.api('GET', `/items/${fic.id}`)).body;
    assert.equal(ficDetail.main_category, 'Fanfiction');
    assert.equal(ficDetail.media_type, 'Fanfic');
    assert.deepEqual(ficDetail.library_cards.map((card) => [card.finish_date, card.finish_year]), [[null, 2026]], 'chỉ có Year: [[2026]]');
    assert.deepEqual((await ctx.api('GET', '/items/facets')).body.read_years, [2026, 2025]);
    assert.equal((await ctx.api('GET', '/items?read_year=2026')).body.total, 2);

    const preview = await ctx.api('POST', '/templates/Fanfiction/preview', { item_id: fic.id });
    assert.match(preview.body, /^Reads:\n {2}- "#1 · năm 2026"$/m);
  });

  test('nhập lại cùng thư mục: bỏ qua sách đã có; file lỗi được báo', async () => {
    const res = await ctx.api('POST', '/import/markdown/commit', {
      files: [...files, { path: 'Books/Lỗi.md', content: '---\nRating: [chưa đóng\n---\n' }],
      default_category: 'Fiction',
    });
    assert.equal(res.body.created, 0);
    assert.equal(res.body.skipped_duplicates, 3);
    assert.equal(res.body.failed, 1);
    assert.match(res.body.failures[0].errors[0], /YAML/);
  });
});
