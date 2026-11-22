import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { ensureStorageLayout, getStoragePaths } from '../config/storage.js';
import { openDatabase } from '../db/connection.js';
import { migrations } from '../db/migrations/index.js';
import { runMigrations } from '../db/migrator.js';
import { GALLERY_END, GALLERY_START } from '../services/obsidian/mediaLinks.js';
import { splitMarkdown } from '../services/obsidian/markdown.js';
import { startTestServer } from './helpers.js';

// PNG 1x1 hợp lệ.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAAABJRU5ErkJggg==', 'base64');

async function startWithStorage() {
  const storage = ensureStorageLayout(getStoragePaths(fs.mkdtempSync(path.join(os.tmpdir(), 'rt-p4-'))));
  const ctx = await startTestServer({ storagePaths: storage });
  const upload = async (itemId, kind, body, name) => {
    const query = new URLSearchParams({ kind, ...(name ? { name } : {}) });
    const res = await fetch(`${ctx.baseUrl}/items/${itemId}/files?${query}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body });
    return { status: res.status, body: await res.json() };
  };
  const putImage = (id, kind, body) =>
    fetch(`${ctx.baseUrl}/items/${id}/images/${kind}`, { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body }).then((r) => r.json());
  const media = (src) => fetch(ctx.baseUrl.replace('/api', '') + src);
  return {
    ctx,
    storage,
    upload,
    putImage,
    media,
    async stop() {
      await ctx.stop();
      fs.rmSync(storage.root, { recursive: true, force: true });
    },
  };
}

describe('migration 007: gộp moodboard/playlist/file đính kèm vào note', () => {
  test('dữ liệu cũ ở items chuyển sang reading_notes, không trùng, cột cũ bị bỏ', () => {
    // Migration chạy đồng bộ trên handle better-sqlite3 gốc (db.raw), xem server/db/async.js.
    const { db: handle } = openDatabase(':memory:');
    const db = handle.raw;
    db.pragma('user_version = 0');
    for (const table of ['quotes', 'series_positions', 'brackets', 'challenge_slots', 'challenges', 'monthly_favorites', 'goals', 'app_settings', 'obsidian_templates', 'sync_tombstones', 'sync_deletions', 'reading_logs', 'reading_notes', 'library_cards', 'items', 'obsidian_sync_config']) {
      db.exec(`DROP TABLE IF EXISTS ${table}`);
    }
    db.exec('DROP TRIGGER IF EXISTS trg_items_tombstone');
    runMigrations(db, migrations.filter((migration) => migration.version <= 6));
    db.prepare(
      `INSERT INTO items (title, main_category, moodboard_urls, playlist_url, file_links) VALUES
        ('A', 'Fiction', '["https://a/1.jpg","https://a/2.jpg"]', 'https://open.spotify.com/playlist/x', '[{"name":"PDF","url":"https://a/f.pdf"}]'),
        ('B', 'Fiction', '["https://a/1.jpg"]', 'https://youtu.be/q', '[]'),
        ('C', 'Fiction', '[]', NULL, '[]')`,
    ).run();
    db.prepare(`INSERT INTO reading_notes (item_id, content_markdown, moodboard_images, playlist_links) VALUES (2, 'ghi chú', '[{"src":"https://a/1.jpg","caption":"giữ"}]', '[{"url":"https://youtu.be/q"}]')`).run();
    runMigrations(db);

    const notes = Object.fromEntries(
      db.prepare('SELECT i.title, n.* FROM reading_notes n JOIN items i ON i.id = n.item_id').all().map((row) => [row.title, row]),
    );
    assert.deepEqual(JSON.parse(notes.A.moodboard_images), [{ src: 'https://a/1.jpg' }, { src: 'https://a/2.jpg' }]);
    assert.deepEqual(JSON.parse(notes.A.playlist_links), [{ url: 'https://open.spotify.com/playlist/x' }]);
    assert.deepEqual(JSON.parse(notes.A.attached_files), [{ name: 'PDF', src: 'https://a/f.pdf' }]);
    assert.deepEqual(JSON.parse(notes.B.moodboard_images), [{ src: 'https://a/1.jpg', caption: 'giữ' }], 'ảnh đã có trong note không bị thêm lần hai');
    assert.deepEqual(JSON.parse(notes.B.playlist_links), [{ url: 'https://youtu.be/q' }]);
    assert.equal(notes.B.content_markdown, 'ghi chú');
    assert.equal(notes.C, undefined, 'sách không có dữ liệu cũ không bị tạo note');
    const columns = db.prepare("SELECT name FROM pragma_table_info('items')").pluck().all();
    for (const gone of ['moodboard_urls', 'playlist_url', 'file_links']) assert.ok(!columns.includes(gone), gone);
    assert.ok(columns.includes('obsidian_media_dir'));
    db.close();
  });
});

describe('file của note: tải lên, phục vụ, dọn file khi bỏ khỏi note', () => {
  let h;
  let item;
  before(async () => {
    h = await startWithStorage();
    item = (await h.ctx.api('POST', '/items', { title: 'Có moodboard', main_category: 'Fiction' })).body;
  });
  after(() => h.stop());

  test('ảnh moodboard: kiểm tra theo nội dung file; file đính kèm giữ tên gốc', async () => {
    const mood = await h.upload(item.id, 'moodboard', PNG);
    assert.equal(mood.status, 201);
    assert.match(mood.body.src, new RegExp(`^/media/items/${item.sync_uid}/moodboard-\\w+\\.png$`));
    assert.equal(mood.body.mime_type, 'image/png');
    assert.equal((await h.media(mood.body.src)).status, 200);

    assert.equal((await h.upload(item.id, 'moodboard', Buffer.from('<svg onload=alert(1)>'))).status, 400, 'không phải ảnh');
    assert.equal((await h.upload(item.id, 'banner', PNG)).status, 400, 'loại file sai');
    assert.equal((await h.upload(99999, 'moodboard', PNG)).status, 404);

    const pdf = await h.upload(item.id, 'attachment', Buffer.from('%PDF-1.4 nội dung'), 'Bản đồ: Ingary?.PDF');
    assert.equal(pdf.status, 201);
    assert.equal(pdf.body.name, 'Bản đồ Ingary.pdf');
    assert.equal(pdf.body.mime_type, 'application/pdf');
    const served = await h.media(pdf.body.src);
    assert.equal(served.status, 200);
    assert.equal(served.headers.get('content-disposition'), null, 'PDF mở được trong trình duyệt');

    const html = await h.upload(item.id, 'attachment', Buffer.from('<script>alert(1)</script>'), 'trang.html');
    const servedHtml = await h.media(html.body.src);
    assert.equal(servedHtml.headers.get('content-disposition'), 'attachment', 'HTML luôn tải xuống, không chạy trên origin của app');
    assert.equal(servedHtml.headers.get('x-content-type-options'), 'nosniff');

    const saved = await h.ctx.api('PUT', `/items/${item.id}/note`, {
      moodboard_images: [{ src: mood.body.src, caption: 'mưa' }],
      attached_files: [pdf.body, html.body],
      character_images: [{ name: 'Sophie', src: null, caption: 'nhân vật chính' }],
    });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    h.state = { mood: mood.body, pdf: pdf.body, html: html.body };
  });

  test('bỏ ảnh/file khỏi note thì file trên đĩa bị xoá; link javascript: bị chặn', async () => {
    const { mood, pdf, html } = h.state;
    const saved = await h.ctx.api('PUT', `/items/${item.id}/note`, { moodboard_images: [], attached_files: [pdf] });
    assert.equal(saved.status, 200);
    assert.notEqual((await h.media(mood.src)).status, 200, 'ảnh moodboard đã xoá');
    assert.notEqual((await h.media(html.src)).status, 200, 'file đính kèm đã xoá');
    assert.equal((await h.media(pdf.src)).status, 200, 'file còn trong note vẫn còn');
    const bad = await h.ctx.api('PUT', `/items/${item.id}/note`, { attached_files: [{ name: 'x', src: 'javascript:alert(1)' }] });
    assert.equal(bad.status, 400);
    const otherItem = await h.ctx.api('PUT', `/items/${item.id}/note`, { moodboard_images: [{ src: '/media/app/background-1.png' }] });
    assert.equal(otherItem.status, 200);
    await h.ctx.api('PUT', `/items/${item.id}/note`, { moodboard_images: [] });
  });

  test('playlist tự nhận nền tảng', async () => {
    const saved = await h.ctx.api('PUT', `/items/${item.id}/note`, {
      playlist_links: [{ url: 'https://open.spotify.com/playlist/37i9dQZF1DX' }, { url: 'https://www.youtube.com/watch?v=abc' }, { url: 'https://example.com/x' }],
    });
    assert.deepEqual(saved.body.playlist_links.map((link) => link.platform), ['spotify', 'youtube', 'other']);
  });
});

describe('lượt đọc: lượt chỉ biết năm, sửa, xoá lượt mới nhất', () => {
  let ctx;
  before(async () => {
    ctx = await startTestServer();
  });
  after(() => ctx.stop());

  test('thêm lượt chỉ biết năm -> sách là Đã đọc; có ngày thì bỏ finish_year', async () => {
    const item = (await ctx.api('POST', '/items', { title: 'Đọc hồi nhỏ', main_category: 'Fiction', total_units: 300 })).body;
    const card = await ctx.api('POST', `/items/${item.id}/library-cards`, { finish_year: 2015, rating: 4 });
    assert.equal(card.status, 201);
    let detail = (await ctx.api('GET', `/items/${item.id}`)).body;
    assert.equal(detail.status, 'Finished');
    assert.equal(detail.current_unit, 300);

    const dated = await ctx.api('PATCH', `/library-cards/${card.body.id}`, { start_date: '2015-06-01', finish_date: '2015-06-20' });
    assert.equal(dated.body.finish_year, null);
    const backToYear = await ctx.api('PATCH', `/library-cards/${card.body.id}`, { start_date: null, finish_date: null, finish_year: 2016 });
    assert.equal(backToYear.body.finish_year, 2016);
    detail = (await ctx.api('GET', `/items/${item.id}`)).body;
    assert.equal(detail.status, 'Finished');
  });

  test('re-read rồi xoá lượt re-read -> trạng thái theo lượt trước; số thứ tự liên tục', async () => {
    const item = (await ctx.api('POST', '/items', { title: 'Re-read', main_category: 'Fiction', total_units: 100 })).body;
    await ctx.api('POST', `/items/${item.id}/library-cards`, { start_date: '2024-01-01', finish_date: '2024-01-10' });
    const second = await ctx.api('POST', `/items/${item.id}/library-cards`, { start_date: '2026-11-01' });
    let detail = (await ctx.api('GET', `/items/${item.id}`)).body;
    assert.equal(detail.status, 'Reading');
    assert.equal(detail.current_unit, 0);
    assert.equal(detail.reread_count, 1);

    assert.equal((await ctx.api('DELETE', `/library-cards/${second.body.id}`)).status, 204);
    detail = (await ctx.api('GET', `/items/${item.id}`)).body;
    assert.equal(detail.status, 'Finished');
    assert.equal(detail.current_unit, 100);
    assert.deepEqual(detail.library_cards.map((card) => card.read_number), [1]);
  });
});

describe('log đọc hằng ngày: tiến độ được trả lại khi sửa/xoá log', () => {
  let ctx;
  let item;
  before(async () => {
    ctx = await startTestServer();
    item = (await ctx.api('POST', '/items', { title: 'Log', main_category: 'Fiction', total_units: 100, current_unit: 10 })).body;
  });
  after(() => ctx.stop());

  test('cộng, sửa, xoá', async () => {
    const created = await ctx.api('POST', '/reading-logs', { item_id: item.id, date: '2026-11-04', units_read: 30, minutes_spent: 40, advance_progress: true });
    assert.equal(created.status, 201);
    assert.equal(created.body.item.current_unit, 40);
    assert.equal(created.body.log.progress_applied, 30);

    const capped = await ctx.api('POST', '/reading-logs', { item_id: item.id, date: '2026-11-05', units_read: 80, advance_progress: true });
    assert.equal(capped.body.item.current_unit, 100);
    assert.equal(capped.body.log.progress_applied, 60, 'chỉ cộng tới tổng số trang');

    const edited = await ctx.api('PATCH', `/reading-logs/${created.body.log.id}`, { units_read: 20 });
    assert.equal(edited.status, 200);
    assert.equal(edited.body.item.current_unit, 90, 'trả 30, cộng lại 20');
    assert.equal(edited.body.log.progress_applied, 20);

    assert.equal((await ctx.api('DELETE', `/reading-logs/${capped.body.log.id}`)).status, 204);
    assert.equal((await ctx.api('GET', `/items/${item.id}`)).body.current_unit, 30);

    const minutesOnly = await ctx.api('POST', '/reading-logs', { item_id: item.id, date: '2026-11-05', minutes_spent: 15, advance_progress: true });
    assert.equal(minutesOnly.body.log.progress_applied, 0);
    assert.equal((await ctx.api('DELETE', `/reading-logs/${minutesOnly.body.log.id}`)).status, 204);
    assert.equal((await ctx.api('GET', `/items/${item.id}`)).body.current_unit, 30);
  });
});

describe('sync ảnh sang vault Obsidian', () => {
  let h;
  let vault;
  let folder;
  let item;
  const read = (rel) => fs.readFileSync(path.join(folder, rel), 'utf8');
  const sync = async (query = '') => {
    const res = await h.ctx.api('POST', `/sync/run${query}`);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    return res.body;
  };

  before(async () => {
    h = await startWithStorage();
    vault = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-vault-media-'));
    fs.mkdirSync(path.join(vault, '.obsidian'));
    folder = path.join(vault, 'Reading Tracker');
    await h.ctx.api('PATCH', '/sync-config', { vault_path: vault, sync_enabled: true });
    item = (await h.ctx.api('POST', '/items', { title: "Howl's Moving Castle", creator_author: 'Diana Wynne Jones', main_category: 'Fiction' })).body;
  });
  after(async () => {
    await h.stop();
    fs.rmSync(vault, { recursive: true, force: true });
  });

  test('bìa + moodboard + nhân vật + ảnh trong nội dung + đính kèm: chép vào _attachments/<tên note>, ghi link vault, nhúng cuối note', async () => {
    const cover = await h.putImage(item.id, 'cover', PNG);
    const mood = (await h.upload(item.id, 'moodboard', PNG)).body;
    const sophie = (await h.upload(item.id, 'character', PNG)).body;
    const inline = (await h.upload(item.id, 'inline', PNG)).body;
    const map = (await h.upload(item.id, 'attachment', Buffer.from('%PDF-1.4'), 'Bản đồ.pdf')).body;
    await h.ctx.api('PUT', `/items/${item.id}/note`, {
      content_markdown: `## Review\n\nCảnh lâu đài:\n\n![lâu đài](${inline.src})\n`,
      moodboard_images: [{ src: mood.src, caption: 'mưa ở Ingary' }, { src: 'https://example.com/ngoai.jpg' }],
      character_images: [{ name: 'Sophie', src: sophie.src, caption: 'Bị biến thành bà lão' }, { name: 'Calcifer' }],
      attached_files: [map, { name: 'Wiki', src: 'https://example.com/wiki' }],
      playlist_links: [{ url: 'https://open.spotify.com/playlist/abc', title: 'Ghibli' }],
    });

    const dry = await sync('?dry_run=true');
    const plannedMedia = dry.actions.find((action) => action.action === 'sync_media');
    assert.equal(plannedMedia.path, "_attachments/Howl's Moving Castle");
    assert.equal(plannedMedia.copy, 5);
    assert.equal(fs.existsSync(path.join(folder, '_attachments')), false, 'dry-run không chép gì');

    await sync();
    const dir = path.join(folder, '_attachments', "Howl's Moving Castle");
    const copied = fs.readdirSync(dir).sort();
    assert.deepEqual(copied, ['Bản đồ.pdf', path.basename(cover.cover_image), path.basename(inline.src), path.basename(mood.src), path.basename(sophie.src)].sort());
    assert.ok(fs.readFileSync(path.join(dir, path.basename(mood.src))).equals(PNG));

    const text = read("Fiction/Howl's Moving Castle.md");
    const { data, body } = splitMarkdown(text);
    const vaultDir = "Reading Tracker/_attachments/Howl's Moving Castle";
    assert.equal(data.Cover, `[[${vaultDir}/${path.basename(cover.cover_image)}]]`);
    assert.ok(body.includes(`![[${vaultDir}/${path.basename(inline.src)}|lâu đài]]`), 'ảnh trong nội dung thành embed Obsidian');
    assert.ok(!body.includes('/media/'), 'không còn đường dẫn nội bộ của app');
    assert.ok(body.includes(GALLERY_START) && body.trimEnd().endsWith(GALLERY_END));
    assert.ok(body.includes(`![[${vaultDir}/${path.basename(mood.src)}|360]]\n*mưa ở Ingary*`));
    assert.ok(body.includes('![](https://example.com/ngoai.jpg)'));
    assert.ok(body.includes(`### Sophie\n![[${vaultDir}/${path.basename(sophie.src)}|200]]\nBị biến thành bà lão`));
    assert.ok(body.includes('### Calcifer'));
    assert.ok(body.includes(`- [[${vaultDir}/Bản đồ.pdf|Bản đồ.pdf]]`));
    assert.ok(body.includes('- [Wiki](https://example.com/wiki)'));
    assert.ok(body.includes('- [Ghibli](https://open.spotify.com/playlist/abc)'));

    const again = await sync();
    assert.equal(again.actions.filter((action) => action.action !== 'ignored').length, 0, JSON.stringify(again.actions));
    h.state = { mood, sophie, dir };
  });

  test('ảnh bị xoá trong vault -> chép lại; bỏ ảnh trong app -> file trong vault vào .trash', async () => {
    const { mood, sophie, dir } = h.state;
    fs.rmSync(path.join(dir, path.basename(sophie.src)));
    const restored = await sync();
    assert.equal(restored.actions.find((action) => action.action === 'sync_media').copy, 1);
    assert.ok(fs.existsSync(path.join(dir, path.basename(sophie.src))));

    await h.ctx.api('PUT', `/items/${item.id}/note`, { moodboard_images: [] });
    const report = await sync();
    assert.ok(report.actions.some((action) => action.action === 'write_file'));
    assert.equal(report.actions.find((action) => action.action === 'sync_media').remove, 1);
    assert.equal(fs.existsSync(path.join(dir, path.basename(mood.src))), false);
    const trashed = fs.readdirSync(path.join(folder, '.trash', '_attachments', "Howl's Moving Castle"));
    assert.equal(trashed.length, 1);
    assert.ok(!read("Fiction/Howl's Moving Castle.md").includes('Moodboard'));
  });

  test('đổi tiêu đề: thư mục ảnh giữ nguyên như tên file note', async () => {
    await h.ctx.api('PATCH', `/items/${item.id}`, { title: 'Lâu đài bay của pháp sư Howl' });
    await sync();
    assert.ok(fs.existsSync(path.join(folder, '_attachments', "Howl's Moving Castle")));
    assert.ok(read("Fiction/Howl's Moving Castle.md").includes("_attachments/Howl's Moving Castle/"));
  });

  test('hai sách trùng tên ở hai thể loại -> hai thư mục ảnh khác nhau', async () => {
    const twin = (await h.ctx.api('POST', '/items', { title: "Howl's Moving Castle", main_category: 'Visual/Comics' })).body;
    await h.putImage(twin.id, 'cover', PNG);
    const report = await sync();
    const media = report.actions.find((action) => action.action === 'sync_media' && action.item_id === twin.id);
    assert.equal(media.path, "_attachments/Howl's Moving Castle (2)");
    h.state.twin = twin;
  });

  test('xoá sách -> note và thư mục ảnh vào .trash', async () => {
    assert.equal((await h.ctx.api('DELETE', `/items/${h.state.twin.id}`)).status, 204);
    const report = await sync();
    assert.ok(report.actions.some((action) => action.action === 'trash_media'));
    assert.ok(report.actions.some((action) => action.action === 'trash_file'));
    assert.equal(fs.existsSync(path.join(folder, '_attachments', "Howl's Moving Castle (2)")), false);
  });

  test('hai chiều: mục gallery không bị nhập vào nội dung note, link vault đổi về file của app', async () => {
    await h.ctx.api('PATCH', '/sync-config', { sync_direction: 'two_way' });
    const rel = "Fiction/Howl's Moving Castle.md";
    const before = (await h.ctx.api('GET', `/items/${item.id}/note`)).body;
    const edited = read(rel).replace('Cảnh lâu đài:', 'Cảnh lâu đài (sửa trong Obsidian):');
    fs.writeFileSync(path.join(folder, rel), edited);
    const future = new Date(Date.now() + 60_000);
    fs.utimesSync(path.join(folder, rel), future, future);
    const report = await sync();
    assert.ok(report.actions.some((action) => action.action === 'import_file'), JSON.stringify(report.actions));
    const after = (await h.ctx.api('GET', `/items/${item.id}/note`)).body;
    assert.equal(after.content_markdown, before.content_markdown.replace('Cảnh lâu đài:', 'Cảnh lâu đài (sửa trong Obsidian):'));
    assert.ok(!after.content_markdown.includes('rt-gallery'));
    assert.equal(after.character_images.length, 2, 'gallery trong app giữ nguyên');
    const detail = (await h.ctx.api('GET', `/items/${item.id}`)).body;
    assert.match(detail.cover_image, /^\/media\/items\//, 'Cover đọc từ file vẫn là ảnh trong app');
    const next = await sync();
    assert.equal(next.actions.filter((action) => action.action !== 'ignored').length, 0, JSON.stringify(next.actions));
  });

  test('file .md trong _attachments không bị coi là note', async () => {
    fs.writeFileSync(path.join(folder, '_attachments', 'ghi chú.md'), '---\nCategory: Fiction\n---\n');
    const report = await sync('?dry_run=true');
    assert.ok(!report.actions.some((action) => action.path.includes('ghi chú.md')));
  });
});

describe('bổ sung: import trái tim, ghép trạng thái lạ, lọc fandom/pairing/rating', () => {
  let ctx;
  before(async () => {
    ctx = await startTestServer();
  });
  after(() => ctx.stop());

  const note = (status, extra = '') => `---\nCategory: Fanfiction\nAuthor: "[[A]]"\nStatus: "[[${status}]]"\n${extra}---\n\nNội dung.\n`;

  test('note có trái tim -> yêu thích; trạng thái lạ được hỏi, chọn xong thì nhập và nhớ cho lần sau', async () => {
    const files = [
      { path: 'Fic một.md', content: note('📖 Đang đọc dở', 'Favorite?: "❤️"\n') },
      { path: 'Fic hai 💖.md', content: note('Finished') },
      { path: 'Fic ba.md', content: note('📖 đang đọc dở') },
    ];
    const preview = (await ctx.api('POST', '/import/markdown/preview', { files })).body;
    assert.deepEqual(preview.unknown_statuses, [{ value: '📖 Đang đọc dở', count: 1 }, { value: '📖 đang đọc dở', count: 1 }]);
    assert.deepEqual(preview.rows.map((row) => [row.is_favorite, row.errors.length]), [[true, 0], [true, 0], [false, 0]]);

    const blocked = (await ctx.api('POST', '/import/markdown/commit', { files })).body;
    assert.equal(blocked.created, 1, 'note có trạng thái chưa ghép bị bỏ qua');

    const mapped = { '📖 Đang đọc dở': 'Reading', '📖 đang đọc dở': 'Reading' };
    const again = (await ctx.api('POST', '/import/markdown/preview', { files, status_map: mapped })).body;
    assert.deepEqual(again.unknown_statuses, []);
    assert.equal(again.rows[0].status, 'Reading');
    const done = (await ctx.api('POST', '/import/markdown/commit', { files, status_map: mapped })).body;
    assert.equal(done.created, 2);

    const remembered = (await ctx.api('POST', '/import/markdown/preview', { files: [{ path: 'Fic bốn.md', content: note('Đang đọc dở') }] })).body;
    assert.deepEqual(remembered.unknown_statuses, [], 'bỏ emoji, không phân biệt hoa thường; đã nhớ từ lần trước');
    assert.equal(remembered.rows[0].status, 'Reading');
    assert.deepEqual((await ctx.api('GET', '/settings')).body.status_aliases, { 'đang đọc dở': 'Reading' });
  });

  test('lọc theo fandom, pairing, rating, yêu thích; facets có fandom và pairing', async () => {
    await ctx.api('POST', '/items', { title: 'F1', main_category: 'Fanfiction', fandoms: ['LCK'], pairings: ['Faker x Doran'], rating: 5, is_favorite: true });
    await ctx.api('POST', '/items', { title: 'F2', main_category: 'Fanfiction', fandoms: ['LCK'], pairings: ['Zeus x Oner'], rating: 3 });
    await ctx.api('POST', '/items', { title: 'F3', main_category: 'Fanfiction', fandoms: ['HP'] });
    const titles = async (query) => (await ctx.api('GET', `/items?main_category=Fanfiction&${query}&sort=title&order=asc`)).body.data.map((item) => item.title).filter((t) => /^F\d$/.test(t));
    assert.deepEqual(await titles('fandom=LCK'), ['F1', 'F2']);
    assert.deepEqual(await titles(`pairing=${encodeURIComponent('Zeus x Oner')}`), ['F2']);
    assert.deepEqual(await titles('rating_min=4'), ['F1']);
    assert.deepEqual(await titles('unrated=true'), ['F3']);
    assert.deepEqual(await titles('is_favorite=true'), ['F1']);
    const facets = (await ctx.api('GET', '/items/facets')).body;
    assert.deepEqual(facets.fandoms.find((entry) => entry.value === 'LCK'), { value: 'LCK', count: 2 });
    assert.ok(facets.pairings.some((entry) => entry.value === 'Faker x Doran'));
  });
});
