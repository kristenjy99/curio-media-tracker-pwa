import { ConflictError, NotFoundError, ValidationError } from '../utils/errors.js';

const BOOK_COLUMNS = 'i.id, i.title, i.creator_author AS author, i.cover_image, i.status, i.rating';

/** Chữ cái đầu để xếp A–Z: bỏ dấu, Đ → D. */
export function firstLetter(text) {
  const clean = String(text ?? '').trim().replace(/[đĐ]/g, 'D').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const match = clean.match(/[A-Za-z]/);
  return match ? match[0].toUpperCase() : null;
}

/** Hai người tham gia của một trận trong bracket: vòng 0 lấy từ entries, các vòng sau lấy từ người thắng vòng trước. */
export function matchPlayers(entries, picks, round, match) {
  if (round === 0) return [entries[match * 2] ?? null, entries[match * 2 + 1] ?? null];
  return [picks[`${round - 1}-${match * 2}`] ?? null, picks[`${round - 1}-${match * 2 + 1}`] ?? null];
}

const SQL_BOOK = (columns) => `SELECT ${columns} FROM items i WHERE i.id = ?`;
const SQL_SLOTS = `
    SELECT s.id, s.position, s.label, s.item_id, i.title, i.creator_author AS author, i.cover_image
    FROM challenge_slots s LEFT JOIN items i ON i.id = s.item_id WHERE s.challenge_id = ? ORDER BY s.position`;
const SQL_INSERT_SLOT = 'INSERT INTO challenge_slots (challenge_id, position, label) VALUES (?, ?, ?)';

export function createFunService({ db }) {
  const book = (id) => db.get(SQL_BOOK(BOOK_COLUMNS), [id]);
  const requireBook = async (id) => {
    const found = await book(id);
    if (!found) throw new NotFoundError('Item', id);
    return found;
  };

  /* ---------- Challenges ---------- */
  const hydrateChallenge = async (row) => {
    const slots = await db.all(SQL_SLOTS, [row.id]);
    return { ...row, slots, filled: slots.filter((slot) => slot.item_id).length };
  };
  const getChallenge = async (id) => {
    const row = await db.get('SELECT * FROM challenges WHERE id = ?', [id]);
    if (!row) throw new NotFoundError('Challenge', id);
    return row;
  };

  /* ---------- Brackets ---------- */
  const hydrateBracket = async (row) => {
    const entries = JSON.parse(row.entries);
    const picks = JSON.parse(row.picks);
    const ids = [...new Set(entries)];
    const books = {};
    for (const id of ids) books[id] = (await book(id)) ?? { id, title: 'Sách đã xoá', author: null, cover_image: null };
    const rounds = [];
    for (let round = 0, matches = row.size / 2; matches >= 1; round += 1, matches /= 2) {
      rounds.push(
        Array.from({ length: matches }, (_, match) => ({
          round,
          match,
          players: matchPlayers(entries, picks, round, match),
          winner: picks[`${round}-${match}`] ?? null,
        })),
      );
    }
    const champion = picks[`${rounds.length - 1}-0`] ?? null;
    return { id: row.id, name: row.name, year: row.year, size: row.size, entries, books, rounds, champion, complete: champion !== null };
  };
  const getBracket = async (id) => {
    const row = await db.get('SELECT * FROM brackets WHERE id = ?', [id]);
    if (!row) throw new NotFoundError('Bracket', id);
    return row;
  };

  return {
    async listChallenges() {
      const rows = await db.all('SELECT * FROM challenges ORDER BY year DESC, id DESC');
      const result = [];
      for (const row of rows) result.push(await hydrateChallenge(row));
      return result;
    },

    createChallenge({ name, type, year, size = 5, az_mode, prompts = [] }) {
      return db.transaction(async () => {
        const info = await db.run('INSERT INTO challenges (name, type, year, az_mode) VALUES (?, ?, ?, ?)', [
          name,
          type,
          year ?? null,
          type === 'az' ? az_mode ?? 'title' : null,
        ]);
        const id = Number(info.lastInsertRowid);
        if (type === 'az') for (let i = 0; i < 26; i += 1) await db.run(SQL_INSERT_SLOT, [id, i + 1, String.fromCharCode(65 + i)]);
        if (type === 'bingo') {
          for (let i = 0; i < size * size; i += 1) await db.run(SQL_INSERT_SLOT, [id, i + 1, prompts[i] ?? '']);
        }
        if (type === 'prompt') {
          for (const [i, label] of prompts.entries()) await db.run(SQL_INSERT_SLOT, [id, i + 1, label]);
        }
        return hydrateChallenge(await getChallenge(id));
      })();
    },

    async renameChallenge(id, name) {
      await getChallenge(id);
      await db.run('UPDATE challenges SET name = ? WHERE id = ?', [name, id]);
      return hydrateChallenge(await getChallenge(id));
    },

    async deleteChallenge(id) {
      if ((await db.run('DELETE FROM challenges WHERE id = ?', [id])).changes === 0) throw new NotFoundError('Challenge', id);
    },

    async addPrompt(challengeId, label) {
      const challenge = await getChallenge(challengeId);
      if (challenge.type !== 'prompt') throw new ValidationError('Chỉ challenge theo prompt mới thêm đề bài được', []);
      const position = await db.get('SELECT COALESCE(MAX(position), 0) + 1 FROM challenge_slots WHERE challenge_id = ?', [challengeId], { pluck: true });
      await db.run(SQL_INSERT_SLOT, [challengeId, position, label]);
      return hydrateChallenge(challenge);
    },

    async removePrompt(slotId) {
      const slot = await db.get('SELECT s.*, c.type FROM challenge_slots s JOIN challenges c ON c.id = s.challenge_id WHERE s.id = ?', [slotId]);
      if (!slot) throw new NotFoundError('Challenge slot', slotId);
      if (slot.type !== 'prompt') throw new ValidationError('Chỉ xoá được đề bài của challenge theo prompt', []);
      await db.run('DELETE FROM challenge_slots WHERE id = ?', [slotId]);
      return hydrateChallenge(await getChallenge(slot.challenge_id));
    },

    /** Gắn/gỡ sách ở một ô; bingo cho sửa chữ trong ô. A–Z kiểm tra chữ cái đầu của tiêu đề hoặc tác giả. */
    async updateSlot(slotId, { item_id, label }) {
      const slot = await db.get('SELECT s.*, c.type, c.az_mode FROM challenge_slots s JOIN challenges c ON c.id = s.challenge_id WHERE s.id = ?', [slotId]);
      if (!slot) throw new NotFoundError('Challenge slot', slotId);
      return db.transaction(async () => {
        if (label !== undefined) {
          if (slot.type === 'az') throw new ValidationError('Không đổi được chữ cái của ô A–Z', []);
          await db.run('UPDATE challenge_slots SET label = ? WHERE id = ?', [label, slotId]);
        }
        if (item_id !== undefined) {
          if (item_id !== null) {
            const found = await requireBook(item_id);
            if (slot.type === 'az') {
              const source = slot.az_mode === 'author' ? found.author : found.title;
              if (firstLetter(source) !== slot.label) {
                throw new ValidationError(`Ô ${slot.label} cần ${slot.az_mode === 'author' ? 'tác giả' : 'tiêu đề'} bắt đầu bằng chữ ${slot.label}`, [
                  { path: ['item_id'], message: `Chữ cái đầu là ${firstLetter(source) ?? '?'}` },
                ]);
              }
            }
            const used = await db.get('SELECT 1 FROM challenge_slots WHERE challenge_id = ? AND item_id = ? AND id != ?', [slot.challenge_id, item_id, slotId]);
            if (used) throw new ConflictError('Sách này đã nằm ở ô khác của challenge');
          }
          await db.run('UPDATE challenge_slots SET item_id = ? WHERE id = ?', [item_id, slotId]);
        }
        return hydrateChallenge(await getChallenge(slot.challenge_id));
      })();
    },

    /* ---------- Monthly favorites ---------- */
    async listFavorites(year) {
      const rows = await db.all(
        `SELECT f.month, f.position, ${BOOK_COLUMNS} FROM monthly_favorites f JOIN items i ON i.id = f.item_id WHERE f.year = ? ORDER BY f.month, f.position`,
        [year],
      );
      const months = Array.from({ length: 12 }, (_, index) => ({ month: index + 1, books: [] }));
      for (const { month, position, ...rest } of rows) months[month - 1].books.push(rest);
      return { year, months, max_per_month: 3 };
    },

    setFavorites(year, month, itemIds) {
      const prefix = `${year}-${String(month).padStart(2, '0')}`;
      const SQL_READ_IN_MONTH = 'SELECT 1 FROM library_cards WHERE item_id = ? AND substr(finish_date, 1, 7) = ?';
      return db.transaction(async () => {
        for (const id of itemIds) await requireBook(id);
        for (const id of itemIds) {
          if (!(await db.get(SQL_READ_IN_MONTH, [id, prefix]))) {
            const found = await book(id);
            throw new ValidationError(`"${found.title}" không có ngày đọc xong trong tháng ${month}/${year}`, [{ path: ['item_ids'], message: 'Ngày đọc xong phải nằm trong tháng này' }]);
          }
        }
        await db.run('DELETE FROM monthly_favorites WHERE year = ? AND month = ?', [year, month]);
        for (const [position, id] of itemIds.entries()) {
          await db.run('INSERT INTO monthly_favorites (year, month, item_id, position) VALUES (?, ?, ?, ?)', [year, month, id, position]);
        }
        return this.listFavorites(year);
      })();
    },

    /* ---------- Brackets ---------- */
    /** Ứng viên: sách yêu thích tháng của năm + sách đánh dấu yêu thích đã đọc xong trong năm. */
    bracketCandidates(year) {
      return db.all(
        `SELECT ${BOOK_COLUMNS} FROM items i
           WHERE i.id IN (SELECT item_id FROM monthly_favorites WHERE year = @year)
              OR (i.is_favorite = 1 AND EXISTS (
                    SELECT 1 FROM library_cards lc WHERE lc.item_id = i.id
                      AND COALESCE(CAST(strftime('%Y', lc.finish_date) AS INTEGER), lc.finish_year) = @year))
           ORDER BY i.rating IS NULL, i.rating DESC, i.title COLLATE NOCASE`,
        { year },
      );
    },

    async listBrackets(year) {
      const rows = year
        ? await db.all('SELECT * FROM brackets WHERE year = ? ORDER BY id DESC', [year])
        : await db.all('SELECT * FROM brackets ORDER BY year DESC, id DESC');
      const result = [];
      for (const row of rows) result.push(await hydrateBracket(row));
      return result;
    },

    async createBracket({ name, year, size, item_ids }) {
      if (item_ids.length !== size) throw new ValidationError(`Cần đúng ${size} sách`, [{ path: ['item_ids'], message: `Đang chọn ${item_ids.length}` }]);
      if (new Set(item_ids).size !== size) throw new ValidationError('Mỗi sách chỉ xuất hiện một lần', [{ path: ['item_ids'], message: 'Trùng sách' }]);
      for (const id of item_ids) await requireBook(id);
      const info = await db.run('INSERT INTO brackets (name, year, size, entries) VALUES (?, ?, ?, ?)', [name, year, size, JSON.stringify(item_ids)]);
      return hydrateBracket(await getBracket(Number(info.lastInsertRowid)));
    },

    /** Chọn người thắng một trận. Đổi kết quả cũ sẽ xoá các kết quả phía sau không còn hợp lệ. */
    async pick(id, { round, match, item_id }) {
      const row = await getBracket(id);
      const picks = JSON.parse(row.picks);
      const rounds = Math.log2(row.size);
      if (round >= rounds || match >= row.size / 2 ** (round + 1)) throw new ValidationError('Trận không tồn tại', [{ path: ['match'], message: 'Ngoài bracket' }]);
      const players = matchPlayers(JSON.parse(row.entries), picks, round, match);
      if (item_id === null) delete picks[`${round}-${match}`];
      else {
        if (!players.includes(item_id)) throw new ValidationError('Người thắng phải là một trong hai sách của trận', [{ path: ['item_id'], message: 'Không thuộc trận này' }]);
        picks[`${round}-${match}`] = item_id;
      }
      // Dọn các trận sau mà người thắng không còn nằm trong cặp.
      for (let r = round + 1; r < rounds; r += 1) {
        for (let m = 0; m < row.size / 2 ** (r + 1); m += 1) {
          const current = picks[`${r}-${m}`];
          if (current !== undefined && !matchPlayers(JSON.parse(row.entries), picks, r, m).includes(current)) delete picks[`${r}-${m}`];
        }
      }
      await db.run('UPDATE brackets SET picks = ? WHERE id = ?', [JSON.stringify(picks), id]);
      return hydrateBracket(await getBracket(id));
    },

    async deleteBracket(id) {
      if ((await db.run('DELETE FROM brackets WHERE id = ?', [id])).changes === 0) throw new NotFoundError('Bracket', id);
    },
  };
}
