import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, test } from 'node:test';
import { openDatabase } from '../db/connection.js';
import { createNodeFileStore } from '../storage/nodeFileStore.js';
import { joinStorePath } from '../storage/fileStore.js';

function freshDb() {
  const { db } = openDatabase(':memory:');
  return db;
}

describe('lõi Db async', () => {
  test('all / get / run / exec trả Promise và đúng dữ liệu', async () => {
    const db = freshDb();
    const info = await db.run("INSERT INTO items (title, main_category) VALUES ('A', 'Fiction')");
    assert.equal(info.changes, 1);
    assert.ok(info.lastInsertRowid > 0);

    const row = await db.get('SELECT title, main_category FROM items WHERE id = ?', [info.lastInsertRowid]);
    assert.deepEqual(row, { title: 'A', main_category: 'Fiction' });
    assert.equal(await db.get('SELECT title FROM items WHERE id = ?', [9999]), null);
    assert.equal(await db.get('SELECT COUNT(*) FROM items', undefined, { pluck: true }), 1);
    assert.deepEqual(await db.all('SELECT title FROM items', undefined, { pluck: true }), ['A']);

    await db.exec("INSERT INTO items (title, main_category) VALUES ('B', 'Fiction'); INSERT INTO items (title, main_category) VALUES ('C', 'Fiction');");
    assert.deepEqual(await db.all('SELECT title FROM items ORDER BY title', undefined, { pluck: true }), ['A', 'B', 'C']);
    db.close();
  });

  test('tham số đặt tên (@name) và tham số thứ tự (?) đều dùng được', async () => {
    const db = freshDb();
    await db.run('INSERT INTO items (title, main_category) VALUES (@title, @category)', { title: 'X', category: 'Nonfiction' });
    assert.equal(await db.get('SELECT main_category FROM items WHERE title = ?', ['X'], { pluck: true }), 'Nonfiction');
    db.close();
  });

  test('transaction commit khi xong, rollback khi lỗi', async () => {
    const db = freshDb();
    await db.transaction(async () => {
      await db.run("INSERT INTO items (title, main_category) VALUES ('ok1', 'Fiction')");
      await db.run("INSERT INTO items (title, main_category) VALUES ('ok2', 'Fiction')");
    })();
    assert.equal(await db.get('SELECT COUNT(*) FROM items', undefined, { pluck: true }), 2);

    await assert.rejects(
      db.transaction(async () => {
        await db.run("INSERT INTO items (title, main_category) VALUES ('hỏng', 'Fiction')");
        throw new Error('dừng giữa transaction');
      })(),
      /dừng giữa transaction/,
    );
    assert.equal(await db.get('SELECT COUNT(*) FROM items', undefined, { pluck: true }), 2, 'bản ghi trong transaction lỗi bị rollback');
    db.close();
  });

  test('transaction lồng nhau: lớp trong lỗi chỉ rollback phần của nó (SAVEPOINT)', async () => {
    const db = freshDb();
    await db.transaction(async () => {
      await db.run("INSERT INTO items (title, main_category) VALUES ('ngoài', 'Fiction')");
      await assert.rejects(
        db.transaction(async () => {
          await db.run("INSERT INTO items (title, main_category) VALUES ('trong', 'Fiction')");
          throw new Error('lỗi lớp trong');
        })(),
        /lỗi lớp trong/,
      );
    })();
    assert.deepEqual(await db.all('SELECT title FROM items', undefined, { pluck: true }), ['ngoài']);
    db.close();
  });

  test('Mutex: hai transaction chạy song song không chen vào nhau', async () => {
    const db = freshDb();
    const order = [];
    const work = (tag) =>
      db.transaction(async () => {
        order.push(`${tag}:bắt đầu`);
        await db.run('INSERT INTO items (title, main_category) VALUES (?, ?)', [`${tag}-1`, 'Fiction']);
        // Nhường lượt cho tác vụ khác: nếu không có Mutex thì tác vụ kia sẽ chen vào giữa transaction này.
        await new Promise((resolve) => setTimeout(resolve, 5));
        await db.run('INSERT INTO items (title, main_category) VALUES (?, ?)', [`${tag}-2`, 'Fiction']);
        order.push(`${tag}:xong`);
      })();

    await Promise.all([work('A'), work('B')]);
    assert.deepEqual(order, ['A:bắt đầu', 'A:xong', 'B:bắt đầu', 'B:xong']);
    assert.equal(await db.get('SELECT COUNT(*) FROM items', undefined, { pluck: true }), 4);
    db.close();
  });
});

describe('FileStore bản Node', () => {
  test('ghi, đọc, kiểm tra tồn tại, xoá file và xoá thư mục', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-store-'));
    try {
      const store = createNodeFileStore(root);
      const rel = joinStorePath('items', 'uid-1', 'cover.png');
      assert.equal(await store.exists(rel), false);
      assert.equal(await store.read(rel), null);

      await store.write(rel, Buffer.from('ảnh', 'utf8'));
      assert.equal(await store.exists(rel), true);
      assert.equal((await store.read(rel)).toString('utf8'), 'ảnh');
      assert.equal(await store.resolve(rel), path.join(root, 'items', 'uid-1', 'cover.png'));

      await store.remove(rel);
      assert.equal(await store.exists(rel), false);
      await store.remove(rel); // xoá lại không báo lỗi

      await store.write(joinStorePath('items', 'uid-2', 'a.png'), Buffer.from('a'));
      await store.write(joinStorePath('items', 'uid-2', 'b.png'), Buffer.from('b'));
      await store.removeDir(joinStorePath('items', 'uid-2'));
      assert.equal(fs.existsSync(path.join(root, 'items', 'uid-2')), false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('chặn đường dẫn vượt ra ngoài thư mục gốc', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-store-'));
    try {
      const store = createNodeFileStore(root);
      assert.equal(await store.resolve('../ngoai.txt'), null);
      assert.equal(await store.exists('../ngoai.txt'), false);
      assert.equal(await store.read('../ngoai.txt'), null);
      await assert.rejects(store.write('../ngoai.txt', Buffer.from('x')), /không hợp lệ/);
      assert.equal(fs.existsSync(path.join(path.dirname(root), 'ngoai.txt')), false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
