/**
 * Kịch bản nghiệm thu Phase 1, chạy với server ĐANG CHẠY (npm run dev).
 *   npm run check
 *   npm run check -- --base http://127.0.0.1:5000/api
 *
 * Script tự tạo item test riêng và xoá đi khi kết thúc, không đụng vào dữ liệu thật.
 * Các bước phụ thuộc dữ liệu seed sẽ được bỏ qua (SKIP) nếu chưa chạy "npm run db:seed".
 * Exit code: 0 nếu mọi bước PASS, 1 nếu có bước FAIL, 2 nếu không kết nối được server.
 */
import '../config/loadEnv.js';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const argBase = process.argv.indexOf('--base');
const BASE =
  argBase > -1 && process.argv[argBase + 1]
    ? process.argv[argBase + 1].replace(/\/$/, '')
    : `http://${process.env.HOST || '127.0.0.1'}:${process.env.PORT || 4317}/api`;

// --sandbox <thư mục tạm>: bật các bước Phase 2 có ghi file (sync vault, đổi storage). npm run verify tự truyền cờ này.
const argSandbox = process.argv.indexOf('--sandbox');
const SANDBOX = argSandbox > -1 ? process.argv[argSandbox + 1] : null;

const useColor = process.stdout.isTTY;
const paint = (code, text) => (useColor ? `\x1b[${code}m${text}\x1b[0m` : text);
const green = (t) => paint(32, t);
const red = (t) => paint(31, t);
const yellow = (t) => paint(33, t);
const dim = (t) => paint(2, t);

const results = { pass: 0, fail: 0, skip: 0 };
const TEST_TITLE = `__acceptance_${Date.now()}`;

class SkipError extends Error {}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

function expectEqual(actual, expected, label) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${label}: mong đợi ${e}, nhận ${a}`);
}

function skip(reason) {
  throw new SkipError(reason);
}

async function api(method, path, body) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { status: response.status, body: json };
}

async function step(name, fn) {
  try {
    const notes = (await fn()) ?? [];
    results.pass += 1;
    console.log(`  ${green('PASS')}  ${name}`);
    for (const note of [].concat(notes)) console.log(dim(`        ${note}`));
  } catch (error) {
    if (error instanceof SkipError) {
      results.skip += 1;
      console.log(`  ${yellow('SKIP')}  ${name} ${dim(`(${error.message})`)}`);
    } else {
      results.fail += 1;
      console.log(`  ${red('FAIL')}  ${name}`);
      console.log(`        ${red(error.message)}`);
    }
  }
}

function section(title) {
  console.log(`\n${title}`);
}

async function main() {
  console.log(`Kiểm tra API tại ${BASE}`);

  try {
    await fetch(`${BASE}/health`);
  } catch {
    console.error(red(`\nKhông kết nối được ${BASE}. Hãy chạy "npm run dev" ở một terminal khác rồi thử lại.`));
    process.exit(2);
  }

  const state = {};

  section('1. Hệ thống');
  await step('GET /health trả 200 và status ok', async () => {
    const res = await api('GET', '/health');
    expectEqual(res.status, 200, 'HTTP status');
    expectEqual(res.body.status, 'ok', 'status');
  });
  await step('GET /system/info: schema v16, journal_mode delete', async () => {
    const res = await api('GET', '/system/info');
    expectEqual(res.status, 200, 'HTTP status');
    expectEqual(res.body.schema_version, 16, 'schema_version');
    expect(typeof res.body.journal_mode === 'string', 'thiếu journal_mode');
    const notes = [`storage: ${res.body.storage?.root}`];
    if (res.body.journal_mode !== 'delete') {
      notes.push(`lưu ý: journal_mode = ${res.body.journal_mode} (khuyến nghị "delete" khi storage nằm trong thư mục sync)`);
    }
    return notes;
  });
  await step('GET /media/health: DB media riêng, schema v8', async () => {
    const res = await api('GET', '/media/health');
    expectEqual(res.status, 200, 'HTTP status');
    expectEqual(res.body.ok, true, 'ok');
    expectEqual(res.body.schema_version, 8, 'schema_version của DB media');
    return [`thư mục media: ${res.body.directory}`];
  });
  await step('Route không tồn tại trả 404', async () => {
    expectEqual((await api('GET', '/khong-co-route')).status, 404, 'HTTP status');
  });
  await step('Body JSON hỏng trả 400 INVALID_JSON', async () => {
    const res = await api('POST', '/items', '{bad json');
    expectEqual(res.status, 400, 'HTTP status');
    expectEqual(res.body.error?.code, 'INVALID_JSON', 'error.code');
  });

  section('2. Dữ liệu seed');
  const seed = await api('GET', `/items?q=${encodeURIComponent('The Left Hand of Darkness')}`);
  const seedItem = seed.body?.data?.[0];
  await step('Item seed "The Left Hand of Darkness": 2 lượt đọc, reread_count 1, Finished', async () => {
    if (!seedItem) skip('chưa chạy npm run db:seed');
    const res = await api('GET', `/items/${seedItem.id}`);
    expectEqual(res.body.read_count, 2, 'read_count');
    expectEqual(res.body.reread_count, 1, 'reread_count');
    expectEqual(res.body.status, 'Finished', 'status');
    expectEqual(res.body.progress_percent, 100, 'progress_percent');
    expectEqual(res.body.library_cards.map((c) => c.read_number), [1, 2], 'read_number');
  });
  await step('Lọc read_year=2026 + tag=sci-fi tìm thấy item seed', async () => {
    if (!seedItem) skip('chưa chạy npm run db:seed');
    const res = await api('GET', '/items?read_year=2026&tag=sci-fi');
    expect(res.body.data.some((i) => i.id === seedItem.id), 'không thấy item seed trong kết quả');
  });

  section('3. Items');
  await step('Tạo item: tag được trim, khử trùng lặp, bỏ rỗng; default TBR', async () => {
    const res = await api('POST', '/items', {
      title: TEST_TITLE,
      creator_author: 'acceptance',
      media_type: 'Fanfic',
      main_category: 'Fanfiction',
      unit_type: 'chapters',
      total_units: 20,
      word_count: 95000,
      tags: ['Accept-Tag', 'accept-tag', '  angst ', ''],
      fandoms: ['Fandom X'],
      pairings: ['A/B'],
      tropes: ['found family'],
    });
    expectEqual(res.status, 201, 'HTTP status');
    state.itemId = res.body.id;
    expectEqual(res.body.tags, ['Accept-Tag', 'angst'], 'tags');
    expectEqual(res.body.status, 'TBR', 'status');
    expectEqual(res.body.current_unit, 0, 'current_unit');
    expectEqual(res.body.is_favorite, false, 'is_favorite');
  });

  const needItem = () => {
    if (!state.itemId) skip('bước tạo item đã thất bại');
  };

  await step('Thiếu title + category sai trả 400 kèm details', async () => {
    const res = await api('POST', '/items', { main_category: 'Poetry' });
    expectEqual(res.status, 400, 'HTTP status');
    const paths = res.body.error.details.map((d) => d.path.join('.'));
    expect(paths.includes('title') && paths.includes('main_category'), `details thiếu trường: ${paths}`);
  });
  await step('current_unit > total_units bị chặn', async () => {
    needItem();
    expectEqual((await api('PATCH', `/items/${state.itemId}`, { current_unit: 21 })).status, 400, 'HTTP status');
  });
  await step('PATCH body rỗng trả 400, id không tồn tại 404, id sai kiểu 400', async () => {
    needItem();
    expectEqual((await api('PATCH', `/items/${state.itemId}`, {})).status, 400, 'PATCH rỗng');
    expectEqual((await api('GET', '/items/999999999')).status, 404, 'id không tồn tại');
    expectEqual((await api('GET', '/items/abc')).status, 400, 'id sai kiểu');
  });
  await step('Lọc theo tag và từ khoá tìm thấy item test', async () => {
    needItem();
    const byTag = await api('GET', '/items?tag=accept-tag');
    expect(byTag.body.data.some((i) => i.id === state.itemId), 'lọc tag không thấy item');
    const byQ = await api('GET', `/items?q=${encodeURIComponent(TEST_TITLE)}`);
    expectEqual(byQ.body.total, 1, 'total theo q');
  });
  await step('Ký tự % trong từ khoá không bị hiểu là wildcard', async () => {
    const res = await api('GET', `/items?q=${encodeURIComponent('%%%__%%%')}`);
    expectEqual(res.status, 200, 'HTTP status');
    expectEqual(res.body.total, 0, 'total');
  });
  await step('Status không hợp lệ trong query trả 400', async () => {
    expectEqual((await api('GET', '/items?status=Paused')).status, 400, 'HTTP status');
  });
  await step('GET /tags có tag của item test', async () => {
    needItem();
    const res = await api('GET', '/tags');
    expect(res.body.data.some((t) => t.tag === 'Accept-Tag'), 'không thấy tag Accept-Tag');
  });

  section('4. Library cards + reading logs');
  await step('Thêm lượt đọc #1 chưa xong -> item chuyển Reading', async () => {
    needItem();
    const res = await api('POST', `/items/${state.itemId}/library-cards`, { start_date: '2026-10-01' });
    expectEqual(res.status, 201, 'HTTP status');
    expectEqual(res.body.read_number, 1, 'read_number');
    state.card1 = res.body.id;
    expectEqual((await api('GET', `/items/${state.itemId}`)).body.status, 'Reading', 'item.status');
  });
  await step('Log đọc với advance_progress -> current_unit 8, progress 40%', async () => {
    needItem();
    const res = await api('POST', '/reading-logs', {
      item_id: state.itemId,
      date: '2026-11-03',
      units_read: 8,
      minutes_spent: 45,
      advance_progress: true,
    });
    expectEqual(res.status, 201, 'HTTP status');
    expectEqual(res.body.item.current_unit, 8, 'current_unit');
    expectEqual(res.body.item.progress_percent, 40, 'progress_percent');
  });
  await step('Log vượt total_units được giới hạn ở total_units', async () => {
    needItem();
    const res = await api('POST', '/reading-logs', {
      item_id: state.itemId,
      date: '2026-11-03',
      units_read: 100,
      advance_progress: true,
    });
    expectEqual(res.body.item.current_unit, 20, 'current_unit');
    await api('PATCH', `/items/${state.itemId}`, { current_unit: 8 });
  });
  await step('Log rỗng trả 400, item không tồn tại trả 404', async () => {
    needItem();
    expectEqual((await api('POST', '/reading-logs', { item_id: state.itemId, date: '2026-11-03' })).status, 400, 'log rỗng');
    expectEqual(
      (await api('POST', '/reading-logs', { item_id: 999999999, date: '2026-11-03', units_read: 1 })).status,
      404,
      'item không tồn tại',
    );
  });
  await step('Lọc log theo item và khoảng ngày', async () => {
    needItem();
    const res = await api('GET', `/reading-logs?item_id=${state.itemId}&from=2026-11-03&to=2026-11-03`);
    expectEqual(res.body.total, 2, 'total');
    expectEqual((await api('GET', '/reading-logs?from=2026-11-04&to=2026-11-03')).status, 400, 'khoảng ngày ngược');
  });
  await step('Hoàn thành lượt #1 -> Finished, progress 100%, last_read_date đúng', async () => {
    if (!state.card1) skip('chưa tạo được lượt đọc #1');
    const res = await api('PATCH', `/library-cards/${state.card1}`, {
      finish_date: '2026-11-03',
      rating: 4.5,
      review_summary: 'Đọc lần đầu',
    });
    expectEqual(res.status, 200, 'HTTP status');
    const item = (await api('GET', `/items/${state.itemId}`)).body;
    expectEqual(item.status, 'Finished', 'status');
    expectEqual(item.progress_percent, 100, 'progress_percent');
    expectEqual(item.last_read_date, '2026-11-03', 'last_read_date');
  });
  await step('finish_date trước start_date bị chặn; ngày không tồn tại bị chặn', async () => {
    if (!state.card1) skip('chưa tạo được lượt đọc #1');
    expectEqual((await api('PATCH', `/library-cards/${state.card1}`, { finish_date: '2026-09-01' })).status, 400, 'finish < start');
    expectEqual(
      (await api('POST', `/items/${state.itemId}/library-cards`, { start_date: '2026-02-30' })).status,
      400,
      'ngày 30/02',
    );
  });
  await step('Re-read #2 -> Reading, current_unit 0, reread_count 1', async () => {
    needItem();
    const res = await api('POST', `/items/${state.itemId}/library-cards`, { start_date: '2026-11-04' });
    expectEqual(res.body.read_number, 2, 'read_number');
    state.card2 = res.body.id;
    const item = (await api('GET', `/items/${state.itemId}`)).body;
    expectEqual(item.status, 'Reading', 'status');
    expectEqual(item.current_unit, 0, 'current_unit');
    expectEqual(item.reread_count, 1, 'reread_count');
  });
  await step('Xoá lượt #1 -> lượt còn lại được đánh số lại thành #1', async () => {
    if (!state.card1 || !state.card2) skip('thiếu lượt đọc');
    expectEqual((await api('DELETE', `/library-cards/${state.card1}`)).status, 204, 'HTTP status');
    const list = (await api('GET', `/items/${state.itemId}/library-cards`)).body.data;
    expectEqual(list.map((c) => [c.id, c.read_number]), [[state.card2, 1]], 'danh sách lượt đọc');
  });

  section('5. Reading notes');
  await step('Item chưa có note trả về note rỗng (không phải 404)', async () => {
    needItem();
    const res = await api('GET', `/items/${state.itemId}/note`);
    expectEqual(res.status, 200, 'HTTP status');
    expectEqual(res.body.id, null, 'id');
    expectEqual(res.body.content_markdown, '', 'content_markdown');
  });
  await step('Upsert note: lần 2 chỉ gửi moodboard, markdown và playlist được giữ nguyên', async () => {
    needItem();
    const markdown = '# Cảm nhận\n\nChương 5 rất hay.';
    await api('PUT', `/items/${state.itemId}/note`, {
      content_markdown: markdown,
      playlist_links: [{ url: 'https://open.spotify.com/playlist/abc', platform: 'spotify' }],
    });
    const res = await api('PUT', `/items/${state.itemId}/note`, {
      moodboard_images: [{ src: 'https://example.com/mood-1.jpg', caption: 'mưa' }],
    });
    expectEqual(res.body.content_markdown, markdown, 'content_markdown');
    expectEqual(res.body.playlist_links.length, 1, 'số playlist');
    expectEqual(res.body.moodboard_images[0].src, 'https://example.com/mood-1.jpg', 'moodboard src');
  });
  await step('Playlist URL không phải http(s) bị chặn', async () => {
    needItem();
    const res = await api('PUT', `/items/${state.itemId}/note`, { playlist_links: [{ url: 'javascript:alert(1)' }] });
    expectEqual(res.status, 400, 'HTTP status');
  });

  section('6. Sync config');
  await step('Bật sync khi chưa có vault_path bị chặn; đường dẫn tương đối bị chặn', async () => {
    const current = (await api('GET', '/sync-config')).body;
    expectEqual((await api('PATCH', '/sync-config', { vault_path: 'relative/path' })).status, 400, 'đường dẫn tương đối');
    expectEqual(
      (await api('PATCH', '/sync-config', { vault_path: '/__khong_ton_tai__/vault' })).status,
      400,
      'thư mục không tồn tại',
    );
    if (current.vault_path) skip('đã có vault_path, bỏ qua để không đổi cấu hình thật');
    expectEqual((await api('PATCH', '/sync-config', { sync_enabled: true })).status, 400, 'bật sync khi chưa có vault');
  });

  section('7. Dọn dẹp');
  await step('Xoá item test -> 204; note và log bị xoá theo (cascade)', async () => {
    needItem();
    expectEqual((await api('DELETE', `/items/${state.itemId}`)).status, 204, 'HTTP status');
    expectEqual((await api('GET', `/items/${state.itemId}`)).status, 404, 'GET item sau khi xoá');
    expectEqual((await api('GET', `/reading-logs?item_id=${state.itemId}`)).body.total, 0, 'log còn sót');
    state.itemId = null;
  });

  await phase2ReadOnly();
  await phase3ReadOnly();
  await phase4Api();
  await phase5Api();
  if (SANDBOX) {
    await phase2Sandbox(SANDBOX);
    await phase3Sandbox();
  }
  else {
    section('10. Phase 2 – sync vault và đổi storage');
    await step('Kịch bản ghi file Phase 2', async () =>
      skip('chỉ chạy trong "npm run verify" để không đụng vào vault/dữ liệu thật'),
    );
  }

  return state;
}

function requestWithHost(hostHeader) {
  const url = new URL(`${BASE}/health`);
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: url.hostname, port: url.port, path: url.pathname, headers: { Host: hostHeader } },
      (res) => {
        res.resume();
        resolve(res.statusCode);
      },
    );
    req.on('error', reject);
    req.end();
  });
}

async function phase2ReadOnly() {
  section('8. Phase 2 – kiểm tra chỉ đọc');
  await step('GET /storage trả thư mục hiện tại và nguồn cấu hình', async () => {
    const res = await api('GET', '/storage');
    expectEqual(res.status, 200, 'HTTP status');
    expect(['env', 'config', 'default'].includes(res.body.source), `source lạ: ${res.body.source}`);
    return [`storage: ${res.body.current?.root} (nguồn: ${res.body.source})`];
  });
  await step('POST /storage/inspect thư mục hiện tại không ghi gì', async () => {
    const info = (await api('GET', '/storage')).body;
    const res = await api('POST', '/storage/inspect', { path: info.current.root });
    expectEqual(res.body.is_current, true, 'is_current');
    expectEqual(res.body.has_database, true, 'has_database');
  });
  await step('GET /fs/dirs liệt kê thư mục gốc', async () => {
    const res = await api('GET', '/fs/dirs');
    expectEqual(res.status, 200, 'HTTP status');
    expect(res.body.dirs.length > 0, 'không có thư mục nào');
  });
  await step('GET /sync/status', async () => {
    const res = await api('GET', '/sync/status');
    expectEqual(res.status, 200, 'HTTP status');
    return [`chế độ sync: ${res.body.sync_direction}`];
  });
  await step('Host lạ (DNS rebinding) bị chặn 403', async () => {
    const url = new URL(BASE);
    expectEqual(await requestWithHost(`evil.example:${url.port}`), 403, 'HTTP status');
    expectEqual(await requestWithHost(`localhost:${url.port}`), 200, 'localhost');
  });

  section('9. Phase 2.5 – template (chỉ đọc)');
  await step('Có đủ 4 template theo mẫu note của bạn', async () => {
    const res = await api('GET', '/templates');
    expectEqual(Object.keys(res.body.templates), ['Fiction', 'Nonfiction', 'Fanfiction', 'Visual/Comics'], 'thể loại');
    const keys = (category) => res.body.templates[category].properties.map((prop) => prop.key);
    for (const key of ['Author', 'Series', 'Genres', 'Status', 'Rating', 'Year', 'Date started', 'Date finished', 'Reads', 'Favorite?', 'Cover']) {
      expect(keys('Fiction').includes(key), `Fiction thiếu ${key}`);
    }
    for (const key of ['FIN?', 'Fandom', 'Ships', 'Ratings', 'Platform', 'Link', 'CoverUrl', 'Words']) {
      expect(keys('Fanfiction').includes(key), `Fanfiction thiếu ${key}`);
    }
  });
  await step('Xem trước file Fiction: link [[...]], sao, Finished đúng chính tả, lịch sử re-read', async () => {
    const res = await api('POST', '/templates/Fiction/preview', {});
    const text = String(res.body.raw ?? res.body);
    expect(/^Status:\n {2}- "\[\[Finished\]\]"$/m.test(text), 'Status không phải [[Finished]]');
    expect(/^Rating: "\[\[⭐⭐⭐⭐½\]\]"$/m.test(text), 'Rating không ở dạng sao');
    expect(/^Reads:\n {2}- "#1 · 2024-02-01 → 2024-02-20 · ⭐⭐⭐⭐"$/m.test(text), 'thiếu lịch sử re-read');
    expect(/## 🔖 Book Summary/.test(text), 'thiếu phần thân mẫu');
  });
}

const GOODREADS_SAMPLE = [
  'Book Id,Title,Author,Additional Authors,My Rating,Binding,Number of Pages,Year Published,Original Publication Year,Date Read,Bookshelves,Exclusive Shelf,My Review,Read Count',
  '1,__acceptance_import Mắt biếc,Nguyễn Nhật Ánh,,5,Paperback,300,2019,1990,2025/12/01,"van-hoc",read,Hay.,2',
  '2,__acceptance_import Deep Work,Cal Newport,,0,Kindle Edition,304,2016,2016,,"non-fiction",to-read,,0',
  '3,,Không tên,,0,,,,,,,to-read,,0',
].join('\n');

async function phase3ReadOnly() {
  section('Phase 3 – giao diện và import (chỉ đọc)');
  await step('Giao diện đã build được phục vụ ở trang chủ', async () => {
    const response = await fetch(BASE.replace(/\/api$/, '/'));
    const html = await response.text();
    if (!html.includes('<div id="root">')) skip('chưa build giao diện (npm run build)');
    expectEqual(response.status, 200, 'HTTP status');
    const deep = await fetch(BASE.replace(/\/api$/, '/settings/template'));
    expect((await deep.text()).includes('<div id="root">'), 'đường dẫn /settings/template không trả về giao diện');
  });
  await step('GET /obsidian/vaults đọc danh sách vault của Obsidian', async () => {
    const res = await api('GET', '/obsidian/vaults');
    expectEqual(res.status, 200, 'HTTP status');
    expect(Array.isArray(res.body.vaults), 'vaults không phải mảng');
    return [res.body.vaults.length ? `tìm thấy ${res.body.vaults.length} vault: ${res.body.vaults.map((vault) => vault.name).join(', ')}` : 'máy này chưa có vault Obsidian nào'];
  });
  await step('GET /settings có danh sách ngôn ngữ và giao diện', async () => {
    const res = await api('GET', '/settings');
    expectEqual(res.status, 200, 'HTTP status');
    expect(Array.isArray(res.body.languages), 'languages không phải mảng');
    for (const key of ['preset', 'display_font', 'body_font', 'font_size', 'background_opacity']) expect(key in res.body.appearance, `appearance thiếu ${key}`);
  });
  await step('GET /items/facets trả dữ liệu cho bộ lọc', async () => {
    const res = await api('GET', '/items/facets');
    expectEqual(res.status, 200, 'HTTP status');
    for (const key of ['total', 'categories', 'statuses', 'read_years', 'release_year_list', 'tags']) expect(key in res.body, `thiếu ${key}`);
  });
  await step('Import Goodreads: nhận cột, xem trước đúng, không ghi gì', async () => {
    const before = (await api('GET', '/items')).body.total;
    const analyzed = await api('POST', '/import/analyze', { source: 'goodreads', format: 'csv', content: GOODREADS_SAMPLE });
    expectEqual(analyzed.status, 200, 'analyze');
    expectEqual(analyzed.body.mapping['Exclusive Shelf'], 'status', 'mapping Exclusive Shelf');
    const preview = await api('POST', '/import/preview', { source: 'goodreads', format: 'csv', content: GOODREADS_SAMPLE, mapping: analyzed.body.mapping });
    expectEqual(preview.status, 200, 'preview');
    expectEqual([preview.body.valid, preview.body.invalid], [2, 1], 'số dòng hợp lệ/lỗi');
    expectEqual(preview.body.rows[0].reads, 2, 'Read Count');
    expectEqual(preview.body.rows[1].main_category, 'Nonfiction', 'kệ non-fiction');
    expectEqual((await api('GET', '/items')).body.total, before, 'preview không được ghi');
  });
}

async function phase3Sandbox() {
  section('Phase 3 – import thật (dữ liệu tạm)');
  await step('Import Goodreads tạo sách + lượt đọc; import lại thì bỏ qua sách trùng', async () => {
    const analyzed = (await api('POST', '/import/analyze', { source: 'goodreads', format: 'csv', content: GOODREADS_SAMPLE })).body;
    const input = { source: 'goodreads', format: 'csv', content: GOODREADS_SAMPLE, mapping: analyzed.mapping };
    const first = (await api('POST', '/import/commit', input)).body;
    expectEqual([first.created, first.failed], [2, 1], 'created/failed');
    const book = (await api('GET', `/items/${first.created_ids[0]}`)).body;
    expectEqual(book.library_cards.length, 2, 'số lượt đọc');
    expectEqual(book.library_cards[1].finish_date, '2025-12-01', 'Date Read');
    expectEqual(book.release_year, 1990, 'năm xuất bản gốc');
    const second = (await api('POST', '/import/commit', input)).body;
    expectEqual(second.skipped_duplicates, 2, 'bỏ qua trùng');
    for (const id of first.created_ids) await api('DELETE', `/items/${id}`);
  });

  await step('Import note Obsidian (.md): đoán Fanfiction theo template, lượt đọc chỉ có năm, giữ nội dung note', async () => {
    const files = [
      { path: 'Books/__acceptance_md Howl.md', content: '---\nAuthor:\n  - "[[Diana Wynne Jones]]"\nStatus:\n  - "[[Finshed]]"\nRating: "[[⭐⭐⭐⭐⭐]]"\nDate started: 2025-09-08\nDate finished: 2025-09-14\n---\n## Review\nHay.\n' },
      { path: 'Books/__acceptance_md Fic.md', content: '---\nAuthor: "[[anon]]"\nStatus: "[[Finshed]]"\nFandom: "[[LCK]]"\nShips:\n  - "[[A x B]]"\nYear:\n  - "[[2026]]"\n---\n' },
      { path: 'Books/.obsidian/workspace.md', content: '' },
    ];
    const preview = (await api('POST', '/import/markdown/preview', { files, default_category: 'Fiction' })).body;
    expectEqual(preview.total, 2, 'bỏ qua file trong .obsidian');
    const fic = preview.rows.find((row) => row.title === '__acceptance_md Fic');
    expectEqual([fic.category, fic.detected_by], ['Fanfiction', 'template'], 'đoán thể loại');
    const commit = (await api('POST', '/import/markdown/commit', { files, default_category: 'Fiction' })).body;
    expectEqual(commit.created, 2, 'created');
    const howl = (await api('GET', '/items?q=__acceptance_md%20Howl')).body.data[0];
    expectEqual([howl.status, howl.rating], ['Finished', 5], 'status/rating');
    expect((await api('GET', `/items/${howl.id}/note`)).body.content_markdown.includes('Hay.'), 'mất nội dung note');
    const ficItem = (await api('GET', `/items/${commit.created_ids.find((id) => id !== howl.id)}`)).body;
    expectEqual(ficItem.library_cards.map((card) => card.finish_year), [2026], 'lượt đọc theo năm');
    for (const id of commit.created_ids) await api('DELETE', `/items/${id}`);
  });

  await step('Cài đặt: sửa danh sách ngôn ngữ, đổi giao diện, ảnh nền, ngày review', async () => {
    const languages = (await api('PATCH', '/settings', { languages: ['Tiếng Việt', 'English', 'Tiếng Pháp'] })).body.languages;
    expectEqual(languages, ['Tiếng Việt', 'English', 'Tiếng Pháp'], 'languages');
    const appearance = (await api('PATCH', '/settings', { appearance: { preset: 'ocean', font_size: 17, display_font: 'lora', body_font: 'nunito' } })).body.appearance;
    expectEqual([appearance.preset, appearance.font_size, appearance.display_font], ['ocean', 17, 'lora'], 'appearance');
    expectEqual((await api('PATCH', '/settings', { appearance: { font_size: 99 } })).status, 400, 'cỡ chữ ngoài giới hạn');
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
    const bg = await (await fetch(`${BASE}/settings/background`, { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: png })).json();
    expect(/^\/media\/app\/background-\d+\.png$/.test(bg.appearance.background_image ?? ''), 'ảnh nền');
    const reset = (await api('POST', '/settings/appearance/reset')).body.appearance;
    expectEqual([reset.preset, reset.background_image], ['moss', null], 'khôi phục mặc định');
    const item = (await api('POST', '/items', { title: '__acceptance_review', main_category: 'Fanfiction', review_date: '2026-02-26', language: 'Tiếng Pháp' })).body;
    expectEqual(item.review_date, '2026-02-26', 'review_date');
    await api('DELETE', `/items/${item.id}`);
  });

  await step('Ảnh gáy + bìa: tải lên, phục vụ qua /media, chặn file không phải ảnh, xoá ảnh', async () => {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
    const item = (await api('POST', '/items', { title: '__acceptance_images', main_category: 'Fiction' })).body;
    const put = (kind, body) => fetch(`${BASE}/items/${item.id}/images/${kind}`, { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body });
    const spine = await (await put('spine', png)).json();
    expect(/^\/media\/items\/.+\/spine-\d+\.png$/.test(spine.spine_image ?? ''), `spine_image = ${spine.spine_image}`);
    const served = await fetch(BASE.replace(/\/api$/, '') + spine.spine_image);
    expectEqual(served.status, 200, 'GET ảnh');
    expectEqual((await put('cover', Buffer.from('<svg/> không phải ảnh'))).status, 400, 'chặn file lạ');
    expectEqual((await api('DELETE', `/items/${item.id}/images/spine`)).body.spine_image, null, 'xoá ảnh gáy');
    await api('DELETE', `/items/${item.id}`);
  });
}

const PNG_1PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

async function uploadNoteFile(itemId, kind, body, name) {
  const query = new URLSearchParams({ kind, ...(name ? { name } : {}) });
  const res = await fetch(`${BASE}/items/${itemId}/files?${query}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body });
  return { status: res.status, body: await res.json() };
}

/** Phase 4 qua API: file của note, lượt đọc chỉ biết năm, log đọc trả lại tiến độ, trang chi tiết. Tự dọn item test. */
async function phase4Api() {
  section('Phase 4 – trang chi tiết, note, thẻ thư viện, log đọc');
  const s = {};
  await step('Trang /books/:id được phục vụ (SPA)', async () => {
    const res = await fetch(BASE.replace(/\/api$/, '') + '/books/1');
    if (res.status === 404) skip('chưa build giao diện');
    expectEqual(res.status, 200, 'HTTP status');
    expect((await res.text()).includes('<div id="root">'), 'không phải index.html');
  });
  await step('Note: tải ảnh moodboard + file đính kèm, lưu vào note; HTML tải về dạng attachment', async () => {
    s.item = (await api('POST', '/items', { title: '__acceptance_phase4', main_category: 'Fiction', total_units: 200, current_unit: 0 })).body;
    const mood = await uploadNoteFile(s.item.id, 'moodboard', PNG_1PX);
    if (mood.status === 409) skip('server không có thư mục lưu trữ');
    expectEqual(mood.status, 201, 'upload moodboard');
    expectEqual((await uploadNoteFile(s.item.id, 'moodboard', Buffer.from('không phải ảnh'))).status, 400, 'chặn file không phải ảnh');
    const html = await uploadNoteFile(s.item.id, 'attachment', Buffer.from('<script>alert(1)</script>'), 'trang.html');
    expectEqual(html.status, 201, 'upload file đính kèm');
    const served = await fetch(BASE.replace(/\/api$/, '') + html.body.src);
    expectEqual(served.headers.get('content-disposition'), 'attachment', 'Content-Disposition');
    const note = await api('PUT', `/items/${s.item.id}/note`, {
      moodboard_images: [{ src: mood.body.src, caption: 'mưa' }],
      attached_files: [html.body],
      character_images: [{ name: 'Sophie' }],
      playlist_links: [{ url: 'https://open.spotify.com/playlist/abc' }],
    });
    expectEqual(note.status, 200, 'PUT note');
    expectEqual(note.body.playlist_links[0].platform, 'spotify', 'tự nhận nền tảng');
    const removed = await api('PUT', `/items/${s.item.id}/note`, { attached_files: [] });
    expectEqual(removed.status, 200, 'bỏ file khỏi note');
    expect((await fetch(BASE.replace(/\/api$/, '') + html.body.src)).status !== 200, 'file đã bỏ khỏi note vẫn còn trên đĩa');
  });
  await step('Thẻ thư viện: lượt chỉ biết năm -> Đã đọc; xoá lượt re-read -> trạng thái theo lượt trước', async () => {
    if (!s.item) skip('chưa tạo item');
    await api('POST', `/items/${s.item.id}/library-cards`, { finish_year: 2019, rating: 4 });
    let item = (await api('GET', `/items/${s.item.id}`)).body;
    expectEqual(item.status, 'Finished', 'status sau lượt chỉ có năm');
    const reread = (await api('POST', `/items/${s.item.id}/library-cards`, { start_date: '2026-11-01' })).body;
    item = (await api('GET', `/items/${s.item.id}`)).body;
    expectEqual([item.status, item.current_unit, item.reread_count], ['Reading', 0, 1], 'sau khi thêm re-read');
    s.rereadId = reread.id;
  });
  await step('Log đọc: cộng vào tiến độ; sửa/xoá log thì tiến độ được trả lại đúng', async () => {
    if (!s.item) skip('chưa tạo item');
    const log = (await api('POST', '/reading-logs', { item_id: s.item.id, date: '2026-11-04', units_read: 50, minutes_spent: 30, advance_progress: true })).body;
    expectEqual([log.item.current_unit, log.log.progress_applied], [50, 50], 'sau khi ghi log');
    const edited = (await api('PATCH', `/reading-logs/${log.log.id}`, { units_read: 20 })).body;
    expectEqual(edited.item.current_unit, 20, 'sau khi sửa log');
    expectEqual((await api('DELETE', `/reading-logs/${log.log.id}`)).status, 204, 'xoá log');
    expectEqual((await api('GET', `/items/${s.item.id}`)).body.current_unit, 0, 'sau khi xoá log');
    expectEqual((await api('DELETE', `/library-cards/${s.rereadId}`)).status, 204, 'xoá lượt re-read');
    const item = (await api('GET', `/items/${s.item.id}`)).body;
    expectEqual([item.status, item.current_unit], ['Finished', 200], 'sau khi xoá lượt re-read');
  });
  if (s.item) await api('DELETE', `/items/${s.item.id}`);
}

/** Phase 5 qua API: dashboard (KPI, quy tắc nhóm, streak, heatmap) và warnings. Dùng năm 2098 để không lẫn dữ liệu thật; tự dọn item test. */
async function phase5Api() {
  section('Phase 5 – dashboard và warnings');
  const created = [];
  const make = async (body) => {
    const res = await api('POST', '/items', { ...body, title: `__acceptance_p5_${body.title}` });
    expectEqual(res.status, 201, `tạo ${body.title}`);
    created.push(res.body.id);
    return res.body;
  };
  await step('Trang /dashboard được phục vụ (SPA)', async () => {
    const res = await fetch(BASE.replace(/\/api$/, '') + '/dashboard');
    if (res.status === 404) skip('chưa build giao diện');
    expectEqual(res.status, 200, 'HTTP status');
    expect((await res.text()).includes('<div id="root">'), 'không phải index.html');
  });
  await step('Dashboard: First-read/Re-read, lượt chỉ biết năm, fanfic ≤ 80.000 chữ ở nhóm riêng, comics > 60 volume vào Visual/Comics', async () => {
    const novel = await make({ title: 'novel', main_category: 'Fiction', warnings: ['Violence'] });
    const shortFic = await make({ title: 'short', main_category: 'Fanfiction', media_type: 'Fanfic', word_count: 80000 });
    const longFic = await make({ title: 'long', main_category: 'Fanfiction', media_type: 'Fanfic', word_count: 80001 });
    const manga = await make({ title: 'manga', main_category: 'Fiction', media_type: 'Manga', volume_count: 61 });
    const card = (item, body) => api('POST', `/items/${item.id}/library-cards`, body);
    await card(novel, { start_date: '2098-01-02', finish_date: '2098-01-10' });
    await card(novel, { start_date: '2098-05-01', finish_date: '2098-05-09' });
    await card(shortFic, { finish_date: '2098-02-02' });
    await card(longFic, { finish_year: 2098 });
    await card(manga, { finish_date: '2098-03-03' });
    await card(manga, { start_date: '2098-04-01' });
    const res = await api('GET', '/dashboard?year=2098&today=2098-06-10');
    expectEqual(res.status, 200, 'HTTP status');
    expectEqual(res.body.totals, { first_read: 3, re_read: 1, total: 4 }, 'totals');
    expectEqual(res.body.short_fanfic, { first_read: 1, re_read: 0, total: 1 }, 'short_fanfic');
    const by = Object.fromEntries(res.body.by_category.map((row) => [row.category, row.total]));
    expectEqual([by.Fiction, by.Fanfiction, by['Visual/Comics'], by['Fanfic ngắn']], [2, 1, 1, 1], 'theo category');
    expect(res.body.years.includes(2098), 'danh sách năm thiếu 2098');
  });
  await step('Sách tạo sẵn trạng thái Finished: lượt đọc nhập sau điền vào lượt rỗng, vẫn là First-read', async () => {
    const item = await make({ title: 'finished_first', main_category: 'Nonfiction', status: 'Finished' });
    expectEqual((await api('GET', `/items/${item.id}`)).body.read_count, 1, 'lượt đọc tự tạo khi đánh dấu Finished');
    const card = await api('POST', `/items/${item.id}/library-cards`, { start_date: '2097-01-02', finish_date: '2097-01-20' });
    expectEqual(card.status, 201, 'tạo lượt đọc');
    expectEqual(card.body.read_number, 1, 'read_number của lượt đọc thật');
    const detail = (await api('GET', `/items/${item.id}`)).body;
    expectEqual(detail.read_count, 1, 'không sinh thêm lượt đọc rỗng');
    expectEqual(detail.reread_count, 0, 'reread_count');
    const dash = (await api('GET', '/dashboard?year=2097&today=2097-06-10')).body;
    expectEqual(dash.totals, { first_read: 1, re_read: 0, total: 1 }, 'totals năm 2097');
  });

  await step('Dashboard: streak tính từ reading_logs, đứt khi bỏ ngày; heatmap có tổng log và phút theo ngày', async () => {
    if (!created.length) skip('chưa tạo item');
    const log = (date, minutes) => api('POST', '/reading-logs', { item_id: created[0], date, units_read: 5, minutes_spent: minutes });
    for (const [date, minutes] of [['2098-06-08', 10], ['2098-06-09', 20], ['2098-06-10', 30]]) await log(date, minutes);
    await log('2098-06-10', 15);
    const live = (await api('GET', '/dashboard?year=2098&today=2098-06-10')).body;
    expectEqual(live.streak.current, 3, 'streak hiện tại');
    expectEqual(live.streak.active_today, true, 'đã ghi log hôm nay');
    const day = live.heatmap.days.find((entry) => entry.date === '2098-06-10');
    expectEqual([day.logs, day.units, day.minutes], [2, 10, 45], 'ô ngày 2098-06-10');
    const grace = (await api('GET', '/dashboard?year=2098&today=2098-06-11')).body;
    expectEqual([grace.streak.current, grace.streak.active_today], [3, false], 'hôm nay chưa ghi vẫn giữ chuỗi');
    const broken = (await api('GET', '/dashboard?year=2098&today=2098-06-13')).body;
    expectEqual(broken.streak.current, 0, 'đứt chuỗi sau 2 ngày không ghi');
    expectEqual((await api('GET', '/dashboard?year=abc')).status, 400, 'year sai');
  });
  await step('Warnings: lưu cho Fiction, trả về dạng danh sách, xoá được; item cũ mặc định rỗng', async () => {
    if (!created.length) skip('chưa tạo item');
    const item = (await api('GET', `/items/${created[0]}`)).body;
    expectEqual(item.warnings, ['Violence'], 'warnings khi tạo');
    const patched = await api('PATCH', `/items/${created[0]}`, { warnings: ['Major character death', 'Self-harm', ' Violence '] });
    expectEqual(patched.body.warnings, ['Major character death', 'Self-harm', 'Violence'], 'warnings sau khi sửa');
    expectEqual((await api('PATCH', `/items/${created[0]}`, { warnings: [] })).body.warnings, [], 'xoá warnings');
    expectEqual((await api('GET', `/items/${created[1]}`)).body.warnings, [], 'mặc định rỗng');
  });
  for (const id of created) await api('DELETE', `/items/${id}`);
}

/** Phase 4 trong vault tạm: ảnh được chép vào _attachments, note nhúng gallery ở cuối. */
async function phase4Sandbox({ folder, readFile, sync, only }) {
  section('13. Phase 4 – ảnh sang Obsidian (vault tạm)');
  const s = {};
  await step('Bìa + moodboard + nhân vật được chép vào _attachments/<tên note>, Cover là link vault, gallery nhúng cuối note', async () => {
    s.item = (await api('POST', '/items', { title: 'Sách có ảnh', main_category: 'Fiction' })).body;
    await fetch(`${BASE}/items/${s.item.id}/images/cover`, { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: PNG_1PX });
    const mood = (await uploadNoteFile(s.item.id, 'moodboard', PNG_1PX)).body;
    const hero = (await uploadNoteFile(s.item.id, 'character', PNG_1PX)).body;
    await api('PUT', `/items/${s.item.id}/note`, {
      content_markdown: 'Review ngắn.',
      moodboard_images: [{ src: mood.src }],
      character_images: [{ name: 'Nhân vật A', src: hero.src, caption: 'chú thích' }],
    });
    const report = await sync();
    const media = only(report, 'sync_media')[0];
    expect(media, 'không có sync_media');
    expectEqual([media.path, media.copy], ['_attachments/Sách có ảnh', 3], 'thư mục + số file chép');
    const dir = path.join(folder, '_attachments', 'Sách có ảnh');
    expectEqual(fs.readdirSync(dir).length, 3, 'số file trong _attachments');
    const text = readFile('Fiction/Sách có ảnh.md');
    expect(/^Cover: "\[\[Reading Tracker\/_attachments\/Sách có ảnh\/cover-\d+\.png\]\]"$/m.test(text), 'Cover chưa là link vault');
    expect(text.includes('%% rt-gallery') && text.includes('## 🖼️ Moodboard') && text.includes('### Nhân vật A'), 'thiếu mục gallery');
    expect(!text.includes('/media/'), 'còn đường dẫn /media trong file');
    expectEqual((await sync()).actions.filter((action) => action.action !== 'ignored'), [], 'sync lần hai');
    s.mood = mood;
    return [`ví dụ: ${path.join('_attachments', 'Sách có ảnh')}`];
  });
  await step('Bỏ ảnh trong app -> file trong vault vào .trash; xoá sách -> thư mục ảnh vào .trash', async () => {
    if (!s.item) skip('chưa tạo item');
    await api('PUT', `/items/${s.item.id}/note`, { moodboard_images: [] });
    const media = only(await sync(), 'sync_media')[0];
    expectEqual(media?.remove, 1, 'số file bỏ');
    await api('DELETE', `/items/${s.item.id}`);
    const report = await sync();
    expect(only(report, 'trash_media').length === 1, 'không có trash_media');
    expectEqual(fs.existsSync(path.join(folder, '_attachments', 'Sách có ảnh')), false, 'thư mục ảnh còn ở chỗ cũ');
  });
}

async function phase2Sandbox(sandbox) {
  const vault = path.join(sandbox, 'vault');
  const folder = path.join(vault, 'Reading Tracker');
  const readFile = (rel) => fs.readFileSync(path.join(folder, rel), 'utf8');
  const writeFile = (rel, text, mtime) => {
    const target = path.join(folder, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, text, 'utf8');
    if (mtime) fs.utimesSync(target, mtime, mtime);
  };
  const sync = async (query = '') => {
    const res = await api('POST', `/sync/run${query}`);
    expectEqual(res.status, 200, `POST /sync/run${query} ${JSON.stringify(res.body)}`);
    return res.body;
  };
  const only = (report, type) => report.actions.filter((action) => action.action === type);
  const s = {};

  section('10. Sync một chiều app -> Obsidian (vault tạm)');
  await step('Cấu hình vault, bật sync; mặc định là một chiều', async () => {
    fs.mkdirSync(path.join(vault, '.obsidian'), { recursive: true });
    const res = await api('PATCH', '/sync-config', { vault_path: vault, sync_enabled: true });
    expectEqual(res.status, 200, 'HTTP status');
    expectEqual(res.body.vault_detected, true, 'vault_detected');
    expectEqual(res.body.sync_direction, 'app_to_obsidian', 'sync_direction');
  });
  await step('Dry-run: liệt kê file sẽ tạo, không ghi gì', async () => {
    s.total = (await api('GET', '/items')).body.total;
    const report = await sync('?dry_run=true');
    expectEqual(report.counts.create_file, s.total, 'create_file');
    expectEqual(fs.existsSync(folder), false, 'thư mục sync đã bị tạo');
  });
  await step('Sync tạo 1 file .md cho mỗi sách, chia thư mục theo thể loại, theo template của thể loại', async () => {
    const report = await sync();
    expectEqual(report.counts.create_file, s.total, 'create_file');
    const folders = fs.readdirSync(folder).filter((name) => !name.startsWith('.')).sort();
    expectEqual(folders, ['Comics', 'Fanfiction', 'Fiction', 'Nonfiction'], 'thư mục thể loại');
    s.file = 'Fiction/The Left Hand of Darkness.md';
    const text = readFile(s.file);
    expect(/^---\nrt_id: [0-9a-f-]{36}\nCategory: Fiction\nAuthor:\n {2}- "\[\[Ursula K\. Le Guin\]\]"$/m.test(text), 'frontmatter không đúng template Fiction');
    expect(/^Reads:\n {2}- "#1 · 2024-02-01 → 2024-02-20 · ⭐⭐⭐⭐½"\n {2}- "#2 · 2026-10-05 → 2026-10-25 · ⭐⭐⭐⭐⭐"$/m.test(text), 'thiếu lịch sử re-read');
    expect(/^Year:\n {2}- "\[\[2024\]\]"\n {2}- "\[\[2026\]\]"$/m.test(text), 'Year chưa đúng');
    const fic = `Fanfiction/${fs.readdirSync(path.join(folder, 'Fanfiction')).find((name) => name.startsWith('Sample Long Fic'))}`;
    expect(/^Ships:\n {2}- "\[\[A\/B\]\]"$/m.test(readFile(fic)), 'file fanfic chưa theo template Fanfiction');
    return [`ví dụ: ${s.file}`];
  });
  await step('Sync lần hai không có thay đổi', async () => {
    expectEqual((await sync()).actions, [], 'actions');
  });
  await step('Sửa file trong Obsidian -> app ghi đè, bản Obsidian lưu thành .conflict.md', async () => {
    const original = readFile(s.file);
    const ratingLine = original.match(/^Rating: .*$/m)[0];
    const edited = original.replace(ratingLine, 'Rating: "[[⭐]]"');
    writeFile(s.file, edited);
    const [overwrite] = only(await sync(), 'overwrite_external_edit');
    expect(overwrite, 'không có overwrite_external_edit');
    expectEqual(readFile(overwrite.conflict_path), edited, 'nội dung bản backup');
    expect(readFile(s.file).includes(ratingLine), 'file chưa được ghi lại từ app');
    return [`backup: ${overwrite.conflict_path}`];
  });
  await step('Đổi thể loại trong app -> file chuyển sang thư mục mới, giữ tên file', async () => {
    const item = (await api('GET', '/items?q=Atomic')).body.data[0];
    await api('PATCH', `/items/${item.id}`, { main_category: 'Fiction' });
    const [moved] = only(await sync(), 'move_file');
    expectEqual([moved?.from, moved?.path], ['Nonfiction/Atomic Habits.md', 'Fiction/Atomic Habits.md'], 'from/path');
    expect(fs.existsSync(path.join(folder, 'Fiction', 'Atomic Habits.md')), 'không thấy file ở thư mục mới');
    await api('PATCH', `/items/${item.id}`, { main_category: 'Nonfiction' });
    await sync();
  });
  await step('File không do app tạo bị bỏ qua, không bị sửa', async () => {
    const foreign = '---\nCategory: Fiction\n---\nghi chú riêng\n';
    writeFile('Ghi chú riêng.md', foreign);
    const report = await sync();
    expect(only(report, 'ignored').some((action) => action.path === 'Ghi chú riêng.md'), 'file lạ không được báo ignored');
    expectEqual(readFile('Ghi chú riêng.md'), foreign, 'file lạ bị sửa');
    fs.rmSync(path.join(folder, 'Ghi chú riêng.md'));
  });
  await step('Sửa template (đổi tên property, thêm trường riêng) -> file được ghi lại', async () => {
    const base = (await api('GET', '/templates/Fiction')).body;
    const properties = base.properties
      .map((prop) => (prop.key === 'Genres' ? { ...prop, key: 'Thể loại' } : prop))
      .concat([{ key: 'Mood', field: 'custom:mood', format: 'text', link: true, list: true }]);
    expectEqual((await api('PUT', '/templates/Fiction', { properties, body_template: base.body_template })).status, 200, 'PUT template');
    const report = await sync();
    expect(only(report, 'write_file').length >= 1, 'không có file nào được ghi lại');
    const text = readFile(s.file);
    expect(/^Thể loại:\n {2}- "\[\[sci-fi\]\]"/m.test(text), 'chưa đổi tên property');
    expect(/^Mood:$/m.test(text), 'chưa có property Mood');
    await api('POST', '/templates/Fiction/reset');
    await sync();
  });
  await step('Xoá sách trong app -> file vào .trash; xoá file trong vault -> tạo lại', async () => {
    const created = (await api('POST', '/items', { title: 'Sách sẽ xoá', main_category: 'Nonfiction' })).body;
    await sync();
    await api('DELETE', `/items/${created.id}`);
    const [trashed] = only(await sync(), 'trash_file');
    expect(trashed && fs.existsSync(path.join(folder, trashed.trash_path)), 'không thấy file trong .trash');
    fs.rmSync(path.join(folder, s.file));
    expect(only(await sync(), 'recreate_file').length === 1, 'file không được tạo lại');
  });

  section('11. Sync hai chiều (tuỳ chọn, vault tạm)');
  await step('Bật two_way: note viết trong Obsidian được nhập thành sách', async () => {
    await api('PATCH', '/sync-config', { sync_direction: 'two_way' });
    writeFile('Sách viết tay.md', '---\nCategory: Fanfiction\nAuthor: "[[Tôi]]"\nStatus: "[[Finshed]]"\nShips:\n  - "[[A x B]]"\n---\n\nGhi chú.\n');
    const created = only(await sync(), 'import_new').find((action) => action.path === 'Sách viết tay.md');
    expect(created, 'không có import_new');
    const item = (await api('GET', `/items/${created.item_id}`)).body;
    expectEqual(item.status, 'Finished', 'status');
    expectEqual(item.pairings, ['A x B'], 'pairings');
    expect(/^---\nrt_id: /.test(readFile('Sách viết tay.md')), 'file chưa được gắn rt_id');
    await api('DELETE', `/items/${created.item_id}`);
    await api('PATCH', '/sync-config', { sync_direction: 'app_to_obsidian' });
    await sync();
  });

  await phase4Sandbox({ vault, folder, readFile, sync, only });

  section('12. Đổi thư mục lưu trữ (thư mục tạm)');
  await step('Copy dữ liệu sang thư mục mới, app chuyển DB không cần restart', async () => {
    const before = (await api('GET', '/items')).body.total;
    const target = path.join(sandbox, 'storage-moved');
    const res = await api('PUT', '/storage', { path: target, mode: 'copy' });
    expectEqual(res.status, 200, `PUT /storage ${JSON.stringify(res.body)}`);
    expectEqual((await api('GET', '/system/info')).body.storage.root, target, 'storage.root');
    expectEqual((await api('GET', '/items')).body.total, before, 'số item sau khi chuyển');
    expectEqual((await api('GET', '/sync-config')).body.vault_path, vault, 'cấu hình vault đi theo DB');
    expectEqual(only(await sync(), 'write_file'), [], 'sync sau khi chuyển');
  });
  await step('Thư mục đích đã có DB thì copy bị chặn', async () => {
    const res = await api('PUT', '/storage', { path: path.join(sandbox, 'storage-moved'), mode: 'copy' });
    expect(res.status === 400 || res.status === 409, `status ${res.status}`);
  });
}

let finalState = {};
try {
  finalState = await main();
} finally {
  // Nếu script dừng giữa chừng thì vẫn cố xoá item test để không để lại rác.
  if (finalState?.itemId) await api('DELETE', `/items/${finalState.itemId}`).catch(() => {});
  const leftovers = await api('GET', `/items?q=${encodeURIComponent('__acceptance_')}`).catch(() => null);
  for (const item of leftovers?.body?.data ?? []) await api('DELETE', `/items/${item.id}`).catch(() => {});
}

const total = results.pass + results.fail + results.skip;
const summary = `${results.pass}/${total} PASS, ${results.fail} FAIL, ${results.skip} SKIP`;
console.log(`\n${results.fail === 0 ? green(`KẾT QUẢ: ${summary}`) : red(`KẾT QUẢ: ${summary}`)}`);
process.exit(results.fail === 0 ? 0 : 1);
