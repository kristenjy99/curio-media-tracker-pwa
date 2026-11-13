/**
 * Áp đơn vị từ Drive vào DB cục bộ.
 *
 * Ba điều phải giữ:
 *  1. `items` và `media_items` được UPDATE tại chỗ (giữ id) vì nhiều bảng tham chiếu id của chúng.
 *     Dòng con và các bảng có trigger "touch" (migration 015) thì xoá rồi chèn lại với nguyên giá trị
 *     từ Drive, kể cả updated_at: trigger AFTER UPDATE không chạy với INSERT, nên mốc không bị đóng lại.
 *  2. Dấu sync_deletions sinh ra trong lúc áp (do xoá-rồi-chèn) bị dọn ngay trong cùng transaction;
 *     nếu để lại, lần đồng bộ sau sẽ coi đó là việc người dùng xoá và lan ra máy kia.
 *  3. Chỉ ghi những cột bảng cục bộ có (PRAGMA table_info), nên dữ liệu từ bản schema cũ hơn vẫn áp
 *     được và tên cột không bao giờ đi thẳng từ file vào câu SQL.
 *
 * Sync không xoá file ảnh nào ở Phiên 5: file mồ côi để Phiên 6 dọn, và nhờ vậy bản chụp trước đồng
 * bộ luôn còn ảnh để khôi phục.
 */

const ITEM_LOCAL_COLUMNS = ['id', 'obsidian_path', 'sync_db_hash', 'sync_file_hash', 'obsidian_media_dir'];

async function columnsOf(handle, table, cache) {
  const cacheKey = `${handle === cache.db ? 'b' : 'm'}:${table}`;
  if (!cache.columns.has(cacheKey)) {
    const rows = await handle.all(`PRAGMA table_info(${table})`);
    cache.columns.set(cacheKey, new Set(rows.map((row) => row.name)));
  }
  return cache.columns.get(cacheKey);
}

async function insertRow(handle, table, row, cache) {
  const columns = await columnsOf(handle, table, cache);
  const keys = Object.keys(row).filter((key) => columns.has(key) && row[key] !== undefined);
  const result = await handle.run(
    `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`,
    keys.map((key) => row[key]),
  );
  return Number(result.lastInsertRowid);
}

async function updateRow(handle, table, id, row, cache, skip) {
  const columns = await columnsOf(handle, table, cache);
  const keys = Object.keys(row).filter((key) => columns.has(key) && !skip.includes(key) && row[key] !== undefined);
  if (!keys.length) return;
  await handle.run(`UPDATE ${table} SET ${keys.map((key) => `${key} = ?`).join(', ')} WHERE id = ?`, [...keys.map((key) => row[key]), id]);
}

export function createApplier({ db, mediaDb }) {
  const cache = { db, columns: new Map() };
  const bookId = (uid) => (uid ? db.get('SELECT id FROM items WHERE sync_uid = ?', [uid], { pluck: true }) : null);
  const mediaId = (uid) => (uid ? mediaDb.get('SELECT id FROM media_items WHERE sync_uid = ?', [uid], { pluck: true }) : null);

  async function pullMedia({ data }) {
    const uid = data.item.sync_uid;
    let id = await mediaId(uid);
    if (id) {
      await updateRow(mediaDb, 'media_items', id, data.item, cache, ITEM_LOCAL_COLUMNS);
      await mediaDb.run('DELETE FROM media_watch_cards WHERE media_id = ?', [id]);
      await mediaDb.run('DELETE FROM media_notes WHERE media_id = ?', [id]);
    } else {
      const row = { ...data.item };
      for (const key of ITEM_LOCAL_COLUMNS) delete row[key];
      id = await insertRow(mediaDb, 'media_items', row, cache);
    }
    for (const card of data.cards ?? []) await insertRow(mediaDb, 'media_watch_cards', { ...card, media_id: id }, cache);
    if (data.note) await insertRow(mediaDb, 'media_notes', { ...data.note, media_id: id }, cache);
  }

  async function pullBook({ data }) {
    const uid = data.item.sync_uid;
    let id = await bookId(uid);
    if (id) {
      await updateRow(db, 'items', id, data.item, cache, ITEM_LOCAL_COLUMNS);
      for (const table of ['library_cards', 'reading_logs', 'reading_notes']) await db.run(`DELETE FROM ${table} WHERE item_id = ?`, [id]);
    } else {
      const row = { ...data.item };
      for (const key of ITEM_LOCAL_COLUMNS) delete row[key];
      id = await insertRow(db, 'items', row, cache);
    }
    for (const card of data.cards ?? []) await insertRow(db, 'library_cards', { ...card, item_id: id }, cache);
    for (const log of data.logs ?? []) await insertRow(db, 'reading_logs', { ...log, item_id: id }, cache);
    if (data.note) await insertRow(db, 'reading_notes', { ...data.note, item_id: id }, cache);
  }

  async function pullChallenge({ data }) {
    await db.run('DELETE FROM challenges WHERE sync_uid = ?', [data.challenge.sync_uid]);
    const { id: _ignored, ...challenge } = data.challenge;
    const id = await insertRow(db, 'challenges', challenge, cache);
    for (const slot of data.slots ?? []) {
      const { item_uid: itemUid, ...rest } = slot;
      await insertRow(db, 'challenge_slots', { ...rest, challenge_id: id, item_id: (await bookId(itemUid)) ?? null }, cache);
    }
  }

  async function pullBracket({ data }) {
    const { bracket } = data;
    await db.run('DELETE FROM brackets WHERE sync_uid = ?', [bracket.sync_uid]);
    const entries = [];
    for (const uid of bracket.entries ?? []) entries.push((await bookId(uid)) ?? null);
    const picks = {};
    for (const [slot, uid] of Object.entries(bracket.picks ?? {})) picks[slot] = (await bookId(uid)) ?? null;
    const { id: _ignored, ...row } = bracket;
    await insertRow(db, 'brackets', { ...row, entries: JSON.stringify(entries), picks: JSON.stringify(picks) }, cache);
  }

  async function pullCollection({ key, data }) {
    await db.run(`DELETE FROM ${key}`);
    for (const source of data.rows ?? []) {
      const { item_uid: itemUid, id: _ignored, ...row } = source;
      if (key === 'goals') {
        await insertRow(db, 'goals', row, cache);
        continue;
      }
      const itemId = key === 'series_positions' && row.source === 'media' ? await mediaId(itemUid) : await bookId(itemUid);
      if (itemId == null) continue; // Sách/media không còn ở máy này: bỏ dòng tham chiếu tới nó.
      await insertRow(db, key, { ...row, item_id: itemId }, cache);
    }
  }

  async function pullSetting({ data }) {
    let { value } = data;
    const current = await db.get('SELECT value FROM app_settings WHERE key = ?', [data.key], { pluck: true });
    if (data.key === 'general') {
      // Giữ file .ico của lối tắt Desktop trên máy này (xem units.js).
      const parsed = JSON.parse(value);
      const local = current ? JSON.parse(current) : {};
      parsed.app_icon_ico = local.app_icon_ico ?? null;
      value = JSON.stringify(parsed);
    }
    await db.run('DELETE FROM app_settings WHERE key = ?', [data.key]);
    await insertRow(db, 'app_settings', { key: data.key, value, updated_at: data.updated_at ?? null }, cache);
  }

  async function remove(key) {
    const [kind, ...rest] = key.split(':');
    const uid = rest.join(':');
    if (kind === 'media') await mediaDb.run('DELETE FROM media_items WHERE sync_uid = ?', [uid]);
    else if (kind === 'book') await db.run('DELETE FROM items WHERE sync_uid = ?', [uid]);
    else if (kind === 'challenge') await db.run('DELETE FROM challenges WHERE sync_uid = ?', [uid]);
    else if (kind === 'bracket') await db.run('DELETE FROM brackets WHERE sync_uid = ?', [uid]);
    else if (kind === 'setting') await db.run('DELETE FROM app_settings WHERE key = ?', [uid]);
  }

  const PULL = { media: pullMedia, book: pullBook, challenge: pullChallenge, bracket: pullBracket, collection: pullCollection, setting: pullSetting };

  /**
   * Áp danh sách đơn vị cần lấy về và danh sách khoá cần xoá. Media trước (series_positions của sách
   * tham chiếu id media), rồi sách, rồi các bảng tham chiếu sách.
   */
  async function apply({ pulls, deletes }) {
    const isMedia = (key) => key.startsWith('media:');
    const order = { media: 0, book: 1, challenge: 2, bracket: 2, collection: 3, setting: 4 };
    const sorted = [...pulls].sort((a, b) => order[a.kind] - order[b.kind]);

    if (mediaDb && (sorted.some((unit) => unit.kind === 'media') || deletes.some(isMedia))) {
      await mediaDb.transaction(async () => {
        const mark = (await mediaDb.get('SELECT MAX(id) FROM media_sync_deletions', [], { pluck: true })) ?? 0;
        for (const key of deletes.filter(isMedia)) await remove(key);
        for (const unit of sorted.filter((entry) => entry.kind === 'media')) await pullMedia(unit);
        await mediaDb.run('DELETE FROM media_sync_deletions WHERE id > ?', [mark]);
      })();
    }

    const bookPulls = sorted.filter((unit) => unit.kind !== 'media');
    const bookDeletes = deletes.filter((key) => !isMedia(key));
    if (bookPulls.length || bookDeletes.length) {
      await db.transaction(async () => {
        const mark = (await db.get('SELECT MAX(id) FROM sync_deletions', [], { pluck: true })) ?? 0;
        for (const key of bookDeletes) await remove(key);
        for (const unit of bookPulls) {
          const handler = PULL[unit.kind];
          if (handler) await handler(unit);
        }
        await db.run('DELETE FROM sync_deletions WHERE id > ?', [mark]);
      })();
    }
  }

  return { apply };
}
