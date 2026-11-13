import assert from 'node:assert/strict';
import { scryptSync } from 'node:crypto';
import test from 'node:test';
import { startTestServer } from './helpers.js';

/**
 * Xuất file DB và cách băm mật khẩu sau Phiên 3.
 *
 * Mật khẩu chuyển từ scrypt sang PBKDF2-SHA256 vì scrypt không có trong WebCrypto, nên bản PWA
 * không băm được. Điều phải giữ: bản ghi cũ do bản Windows đặt (scrypt, không có trường `algo`)
 * vẫn kiểm được, nếu không người dùng sẽ bị khoá khỏi chính dữ liệu của mình sau khi cập nhật app.
 */

test('xuất file DB: cần mật khẩu, trả về file SQLite hợp lệ', async () => {
  const s = await startTestServer();
  try {
    // Chưa đặt mật khẩu thì không xuất được.
    assert.equal((await s.api('POST', '/data/export', { password: 'abcd' })).status, 409);
    await s.api('PUT', '/data/password', { new_password: 'abcd' });
    assert.equal((await s.api('POST', '/data/export', { password: 'sai-roi' })).status, 400);

    for (const which of ['books', 'media']) {
      const response = await fetch(`${s.baseUrl}/data/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'abcd', db: which }),
      });
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-disposition') ?? '', /attachment; filename=".+\.sqlite"/);
      const bytes = Buffer.from(await response.arrayBuffer());
      assert.equal(bytes.subarray(0, 15).toString('latin1'), 'SQLite format 3');
      assert.ok(bytes.length >= 512 && bytes.length % 512 === 0, `kích thước lạ: ${bytes.length}`);
    }
  } finally {
    await s.stop();
  }
});

test('mật khẩu mới dùng PBKDF2 và đổi được bằng mật khẩu hiện tại', async () => {
  const s = await startTestServer();
  try {
    await s.api('PUT', '/data/password', { new_password: 'abcd' });
    const stored = JSON.parse(await s.db.get('SELECT value FROM app_settings WHERE key = ?', ['security'], { pluck: true }));
    assert.equal(stored.algo, 'pbkdf2-sha256');
    assert.ok(stored.iterations >= 100_000);
    assert.equal((await s.api('PUT', '/data/password', { current_password: 'abcd', new_password: 'efgh' })).status, 200);
    assert.equal((await s.api('POST', '/data/export', { password: 'efgh' })).status, 200);
  } finally {
    await s.stop();
  }
});

test('mật khẩu cũ dạng scrypt (bản trước Phiên 3) vẫn kiểm được', async () => {
  const s = await startTestServer();
  try {
    const salt = '00112233445566778899aabbccddeeff';
    const hash = scryptSync('matkhaucu', Buffer.from(salt, 'hex'), 64).toString('hex');
    await s.db.run('INSERT INTO app_settings (key, value) VALUES (?, ?)', [
      'security',
      JSON.stringify({ salt, hash, updated_at: new Date().toISOString() }),
    ]);

    assert.equal((await s.api('POST', '/data/export', { password: 'sai' })).status, 400);
    assert.equal((await s.api('POST', '/data/export', { password: 'matkhaucu' })).status, 200);
    // Đổi mật khẩu bằng mật khẩu cũ thì bản ghi được viết lại theo PBKDF2.
    assert.equal((await s.api('PUT', '/data/password', { current_password: 'matkhaucu', new_password: 'moi1' })).status, 200);
    const stored = JSON.parse(await s.db.get('SELECT value FROM app_settings WHERE key = ?', ['security'], { pluck: true }));
    assert.equal(stored.algo, 'pbkdf2-sha256');
  } finally {
    await s.stop();
  }
});

test('route chỉ chạy trên Windows được gắn cờ nodeOnly để bản PWA lọc ra', async () => {
  const { createApiRouteTable } = await import('../routes/routeTable.js');
  const s = await startTestServer();
  try {
    const table = createApiRouteTable(s.runtime.context);
    const flagged = table.filter((route) => route.nodeOnly).map((route) => `${route.method} ${route.path}`);
    assert.deepEqual(flagged.sort(), [
      'GET /fs/dirs',
      'GET /obsidian/vaults',
      'GET /storage',
      'GET /sync-config',
      'GET /sync/status',
      'PATCH /sync-config',
      'POST /storage/inspect',
      'POST /sync/run',
      'POST /system/desktop-shortcut',
      'PUT /storage',
    ]);
    // Trên Node các route này vẫn phải hoạt động bình thường.
    assert.equal((await s.api('GET', '/sync-config')).status, 200);
  } finally {
    await s.stop();
  }
});
