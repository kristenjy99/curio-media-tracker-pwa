import assert from 'node:assert/strict';
import test from 'node:test';
import { createBrowserFileStore, createMemoryBackend } from '../storage/browserFileStore.js';
import { createNodeFileStore } from '../storage/nodeFileStore.js';
import { assertFileStore } from '../storage/fileStore.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * FileStore bản trình duyệt phải cho cùng kết quả với bản Node trên cùng một chuỗi thao tác, vì
 * tầng service dùng chung và không biết mình chạy ở đâu. Test chạy backend bộ nhớ thay cho
 * IndexedDB: phần cần kiểm là quy ước đường dẫn và hành vi, không phải bản thân IndexedDB.
 */

const store = () => createBrowserFileStore({ backend: createMemoryBackend() });

test('browserFileStore có đủ interface FileStore', () => {
  assertFileStore(store());
});

test('ghi rồi đọc lại đúng byte, đường dẫn kiểu URL', async () => {
  const files = store();
  const bytes = Buffer.from([1, 2, 3, 4]);
  await files.write('items/abc/cover-1.webp', bytes);
  const read = await files.read('items/abc/cover-1.webp');
  assert.ok(Buffer.isBuffer(read));
  assert.deepEqual([...read], [1, 2, 3, 4]);
  // Đoạn rỗng và "." được bỏ qua y như joinStorePath của bản Node.
  assert.deepEqual([...(await files.read('items//abc/./cover-1.webp'))], [1, 2, 3, 4]);
});

test('exists, remove và removeDir theo tiền tố', async () => {
  const files = store();
  await files.write('items/abc/cover.webp', Buffer.from([1]));
  await files.write('items/abc/files/77/tai-lieu.pdf', Buffer.from([2]));
  await files.write('items/xyz/cover.webp', Buffer.from([3]));

  assert.equal(await files.exists('items/abc/cover.webp'), true);
  await files.remove('items/abc/cover.webp');
  assert.equal(await files.exists('items/abc/cover.webp'), false);
  assert.equal(await files.read('items/abc/cover.webp'), null);
  // Xoá file không tồn tại không được báo lỗi (giống bản Node).
  await files.remove('items/abc/cover.webp');

  await files.removeDir('items/abc');
  assert.equal(await files.exists('items/abc/files/77/tai-lieu.pdf'), false);
  assert.equal(await files.exists('items/xyz/cover.webp'), true);
});

test('resolve luôn null trên trình duyệt', async () => {
  assert.equal(await store().resolve('items/abc/cover.webp'), null);
});

test('cùng một chuỗi thao tác cho kết quả giống nodeFileStore', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'rt-filestore-'));
  try {
    const node = createNodeFileStore(dir);
    const browser = store();
    const steps = async (files) => {
      await files.write('items/uid/cover-1.webp', Buffer.from([9, 9]));
      await files.write('items/uid/files/abc/sach.epub', Buffer.from([8]));
      await files.remove('items/uid/cover-1.webp');
      return {
        coverExists: await files.exists('items/uid/cover-1.webp'),
        attachment: [...(await files.read('items/uid/files/abc/sach.epub'))],
        missing: await files.read('items/uid/khong-co.webp'),
      };
    };
    assert.deepEqual(await steps(browser), await steps(node));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// Sửa sau Phiên 4: trên điện thoại không có storagePaths (không có thư mục đĩa) nhưng vẫn có
// FileStore; ảnh bìa media trước đây bị chặn với lỗi "Server chưa có thư mục lưu trữ".
test('media: đặt ảnh bìa chỉ cần FileStore, không cần storagePaths (bản PWA)', async () => {
  const { openMediaDatabase } = await import('../media/db/connection.js');
  const { createMediaItemService } = await import('../media/mediaItemService.js');
  const { db } = openMediaDatabase(':memory:');
  const files = store();
  const items = createMediaItemService({ db, storagePaths: null, fileStore: files });
  const created = await items.create({ title: 'Phim thử', category: 'movie' });
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4b90000000049454e44ae426082', 'hex');
  const updated = await items.setCover(created.id, png);
  assert.match(updated.cover_image, /^\/api\/media\/files\/items\/.+\/cover-\d+\.png$/);
  const key = updated.cover_image.slice('/api/media/files/'.length);
  assert.deepEqual([...(await files.read(key))], [...png]);
  await db.close();
});
