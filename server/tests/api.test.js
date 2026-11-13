import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import os from 'node:os';
import { startTestServer } from './helpers.js';

let ctx;
before(async () => {
  ctx = await startTestServer();
});
after(async () => {
  await ctx.stop();
});

const fanfic = {
  title: 'Long Fic',
  creator_author: 'writer',
  media_type: 'Fanfic',
  main_category: 'Fanfiction',
  unit_type: 'chapters',
  total_units: 40,
  word_count: 120000,
  tags: ['Slow-Burn', 'slow-burn', '  angst  ', ''],
  fandoms: ['Fandom X'],
  pairings: ['A/B'],
  tropes: ['enemies to lovers'],
};

describe('items', () => {
  let itemId;

  test('health check', async () => {
    const res = await ctx.api('GET', '/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'ok');
  });

  test('tạo item: chuẩn hoá tags, áp default của DB', async () => {
    const res = await ctx.api('POST', '/items', fanfic);
    assert.equal(res.status, 201);
    itemId = res.body.id;
    assert.deepEqual(res.body.tags, ['Slow-Burn', 'angst']);
    assert.equal(res.body.status, 'TBR');
    assert.equal(res.body.current_unit, 0);
    assert.equal(res.body.is_favorite, false);
    assert.equal(res.body.read_count, 0);
    assert.equal(res.body.progress_percent, 0);
  });

  test('validation: thiếu title / category sai trả 400', async () => {
    const missing = await ctx.api('POST', '/items', { main_category: 'Fiction' });
    assert.equal(missing.status, 400);
    assert.equal(missing.body.error.code, 'VALIDATION_ERROR');
    const badCategory = await ctx.api('POST', '/items', { title: 'X', main_category: 'Poetry' });
    assert.equal(badCategory.status, 400);
  });

  test('current_unit vượt total_units bị chặn', async () => {
    const res = await ctx.api('PATCH', `/items/${itemId}`, { current_unit: 41 });
    assert.equal(res.status, 400);
  });

  test('PATCH cập nhật tiến độ và progress_percent', async () => {
    const res = await ctx.api('PATCH', `/items/${itemId}`, { current_unit: 10, is_favorite: true });
    assert.equal(res.status, 200);
    assert.equal(res.body.progress_percent, 25);
    assert.equal(res.body.is_favorite, true);
  });

  test('PATCH body rỗng trả 400, id không tồn tại trả 404', async () => {
    assert.equal((await ctx.api('PATCH', `/items/${itemId}`, {})).status, 400);
    assert.equal((await ctx.api('GET', '/items/99999')).status, 404);
    assert.equal((await ctx.api('GET', '/items/abc')).status, 400);
  });

  test('list: filter theo category, tag, q, favorite', async () => {
    await ctx.api('POST', '/items', {
      title: 'Atomic Habits',
      main_category: 'Nonfiction',
      release_year: 2018,
      tags: ['self-help'],
      topics: ['habits'],
    });
    await ctx.api('POST', '/items', { title: '100% Pure_Test', main_category: 'Fiction', release_year: 2020 });

    const byCategory = await ctx.api('GET', '/items?main_category=Fanfiction,Nonfiction');
    assert.equal(byCategory.body.total, 2);

    const byTag = await ctx.api('GET', '/items?tag=slow-burn');
    assert.equal(byTag.body.total, 1);
    assert.equal(byTag.body.data[0].id, itemId);

    const byQuery = await ctx.api('GET', '/items?q=atomic');
    assert.equal(byQuery.body.total, 1);

    // Ký tự % và _ trong từ khoá phải được escape, không thành wildcard.
    const escaped = await ctx.api('GET', `/items?q=${encodeURIComponent('100%')}`);
    assert.equal(escaped.body.total, 1);
    const wildcard = await ctx.api('GET', `/items?q=${encodeURIComponent('%')}`);
    assert.equal(wildcard.body.total, 1);

    const favorites = await ctx.api('GET', '/items?is_favorite=true');
    assert.equal(favorites.body.total, 1);

    const byYearRange = await ctx.api('GET', '/items?release_year_from=2019&sort=title&order=asc');
    assert.equal(byYearRange.body.total, 1);

    const invalid = await ctx.api('GET', '/items?status=Paused');
    assert.equal(invalid.status, 400);
  });

  test('tags endpoint đếm theo tần suất', async () => {
    const res = await ctx.api('GET', '/tags');
    assert.equal(res.status, 200);
    assert.ok(res.body.data.some((row) => row.tag === 'Slow-Burn' && row.count === 1));
  });

  describe('library cards', () => {
    let firstCard;
    let secondCard;

    test('thêm lượt đọc #1 chưa xong -> item chuyển Reading', async () => {
      const res = await ctx.api('POST', `/items/${itemId}/library-cards`, { start_date: '2025-01-01' });
      assert.equal(res.status, 201);
      firstCard = res.body;
      assert.equal(firstCard.read_number, 1);
      const item = await ctx.api('GET', `/items/${itemId}`);
      assert.equal(item.body.status, 'Reading');
      assert.equal(item.body.current_unit, 10);
    });

    test('hoàn thành lượt mới nhất -> item Finished, progress 100%', async () => {
      const res = await ctx.api('PATCH', `/library-cards/${firstCard.id}`, { finish_date: '2025-01-15', rating: 4 });
      assert.equal(res.status, 200);
      const item = await ctx.api('GET', `/items/${itemId}`);
      assert.equal(item.body.status, 'Finished');
      assert.equal(item.body.progress_percent, 100);
      assert.equal(item.body.last_read_date, '2025-01-15');
    });

    test('finish_date trước start_date bị chặn', async () => {
      const res = await ctx.api('PATCH', `/library-cards/${firstCard.id}`, { finish_date: '2024-12-31' });
      assert.equal(res.status, 400);
      const invalidDate = await ctx.api('POST', `/items/${itemId}/library-cards`, { start_date: '2025-02-30' });
      assert.equal(invalidDate.status, 400);
    });

    test('re-read #2 reset tiến độ, reread_count = 1', async () => {
      const res = await ctx.api('POST', `/items/${itemId}/library-cards`, { start_date: '2026-10-01' });
      secondCard = res.body;
      assert.equal(secondCard.read_number, 2);
      const item = await ctx.api('GET', `/items/${itemId}`);
      assert.equal(item.body.status, 'Reading');
      assert.equal(item.body.current_unit, 0);
      assert.equal(item.body.reread_count, 1);
      assert.equal(item.body.library_cards.length, 2);
    });

    test('lọc theo năm đọc', async () => {
      assert.equal((await ctx.api('GET', '/items?read_year=2025')).body.total, 1);
      assert.equal((await ctx.api('GET', '/items?read_year=2026')).body.total, 1);
      assert.equal((await ctx.api('GET', '/items?read_year=2024')).body.total, 0);
    });

    test('xoá lượt #1 -> lượt còn lại được đánh số lại thành #1', async () => {
      await ctx.api('POST', `/items/${itemId}/library-cards`, { start_date: '2026-11-01' });
      const del = await ctx.api('DELETE', `/library-cards/${firstCard.id}`);
      assert.equal(del.status, 204);
      const list = await ctx.api('GET', `/items/${itemId}/library-cards`);
      assert.deepEqual(
        list.body.data.map((card) => card.read_number),
        [1, 2],
      );
      assert.equal(list.body.data[0].id, secondCard.id);
    });
  });

  describe('reading notes', () => {
    test('item chưa có note trả về note rỗng', async () => {
      const res = await ctx.api('GET', `/items/${itemId}/note`);
      assert.equal(res.status, 200);
      assert.equal(res.body.id, null);
      assert.equal(res.body.content_markdown, '');
    });

    test('upsert giữ lại trường không gửi lên', async () => {
      const first = await ctx.api('PUT', `/items/${itemId}/note`, {
        content_markdown: '# Ghi chú\n\nChương 3 rất hay.',
        playlist_links: [{ url: 'https://open.spotify.com/playlist/abc', platform: 'spotify' }],
      });
      assert.equal(first.status, 200);
      const second = await ctx.api('PUT', `/items/${itemId}/note`, {
        moodboard_images: [{ src: 'https://example.com/mood-1.jpg', caption: 'mưa' }],
      });
      assert.equal(second.body.content_markdown, '# Ghi chú\n\nChương 3 rất hay.');
      assert.equal(second.body.playlist_links.length, 1);
      assert.equal(second.body.moodboard_images[0].src, 'https://example.com/mood-1.jpg');
    });

    test('playlist URL không phải http(s) bị chặn', async () => {
      const res = await ctx.api('PUT', `/items/${itemId}/note`, {
        playlist_links: [{ url: 'javascript:alert(1)' }],
      });
      assert.equal(res.status, 400);
    });
  });

  describe('reading logs', () => {
    test('advance_progress cộng dồn và giới hạn theo total_units', async () => {
      const first = await ctx.api('POST', '/reading-logs', {
        item_id: itemId,
        date: '2026-11-02',
        units_read: 15,
        minutes_spent: 30,
        advance_progress: true,
      });
      assert.equal(first.status, 201);
      assert.equal(first.body.item.current_unit, 15);

      const overflow = await ctx.api('POST', '/reading-logs', {
        item_id: itemId,
        date: '2026-11-03',
        units_read: 100,
        advance_progress: true,
      });
      assert.equal(overflow.body.item.current_unit, 40);
    });

    test('log rỗng hoặc item không tồn tại bị chặn', async () => {
      assert.equal((await ctx.api('POST', '/reading-logs', { item_id: itemId, date: '2026-11-03' })).status, 400);
      assert.equal(
        (await ctx.api('POST', '/reading-logs', { item_id: 99999, date: '2026-11-03', units_read: 1 })).status,
        404,
      );
    });

    test('list theo khoảng ngày', async () => {
      const res = await ctx.api('GET', '/reading-logs?from=2026-11-03&to=2026-11-03');
      assert.equal(res.body.total, 1);
      const badRange = await ctx.api('GET', '/reading-logs?from=2026-11-04&to=2026-11-03');
      assert.equal(badRange.status, 400);
    });

    test('update không được làm log thành rỗng', async () => {
      const list = await ctx.api('GET', `/reading-logs?item_id=${itemId}`);
      const target = list.body.data.find((log) => log.minutes_spent === 0);
      const res = await ctx.api('PATCH', `/reading-logs/${target.id}`, { units_read: 0 });
      assert.equal(res.status, 400);
    });
  });

  describe('sync config', () => {
    test('mặc định tắt sync', async () => {
      const res = await ctx.api('GET', '/sync-config');
      assert.equal(res.body.vault_path, null);
      assert.equal(res.body.sync_enabled, false);
      assert.equal(res.body.last_sync_time, null);
      assert.equal(res.body.vault_subfolder, 'Reading Tracker');
      assert.equal(res.body.sync_direction, 'app_to_obsidian');
    });

    test('bật sync khi chưa có vault_path bị chặn', async () => {
      const res = await ctx.api('PATCH', '/sync-config', { sync_enabled: true });
      assert.equal(res.status, 400);
    });

    test('vault_path phải là thư mục tồn tại', async () => {
      assert.equal((await ctx.api('PATCH', '/sync-config', { vault_path: '/khong/ton/tai' })).status, 400);
      assert.equal((await ctx.api('PATCH', '/sync-config', { vault_path: 'relative/path' })).status, 400);
      const ok = await ctx.api('PATCH', '/sync-config', { vault_path: os.tmpdir(), sync_enabled: true });
      assert.equal(ok.status, 200);
      assert.equal(ok.body.sync_enabled, true);
    });
  });

  test('xoá item cascade, route lạ trả 404', async () => {
    assert.equal((await ctx.api('DELETE', `/items/${itemId}`)).status, 204);
    assert.equal((await ctx.api('GET', `/items/${itemId}/note`)).status, 404);
    assert.equal((await ctx.api('GET', '/khong-co-route')).status, 404);
  });
});
