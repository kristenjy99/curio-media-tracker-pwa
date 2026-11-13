import path from 'node:path';
import { z } from 'zod';
import { detectImageType, MAX_ATTACHMENT_BYTES, NOTE_FILE_KINDS, safeFileName } from '../services/imageService.js';
import { joinStorePath } from '../storage/fileStore.js';
import { detectPlatform } from '../services/readingNoteService.js';
import { PLAYLIST_PLATFORMS } from '../validators/readingNoteValidators.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import { FILES_URL_PREFIX } from './mediaItemService.js';

const IMAGE_MIME = { jpg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif' };
const year = z.number().int().min(1900).max(3000).nullable();
const month = z.number().int().min(1).max(12).nullable();

const cardBase = {
  season: z.number().int().min(0).max(10000).nullable(),
  start_year: year,
  start_month: month,
  finish_year: year,
  finish_month: month,
  rating: z.number().min(0).max(5).multipleOf(0.5).nullable(),
  note: z.string().trim().max(5000).nullable().transform((v) => v || null),
};
export const watchCardCreateSchema = z.object(cardBase).partial().strict();
export const watchCardUpdateSchema = z.object(cardBase).partial().strict();

// Ảnh/file của note media: file đã tải lên (/api/media/files/...) hoặc link http(s).
const noteRef = z
  .string()
  .trim()
  .min(1)
  .max(4096)
  .refine((value) => value.startsWith(FILES_URL_PREFIX) || /^https?:\/\/[^\s]+$/i.test(value), 'Chỉ nhận file đã tải lên hoặc link http(s)')
  .refine((value) => !value.includes('..'), 'Đường dẫn không hợp lệ');
const caption = z.string().trim().max(1000).optional();
export const mediaNoteSchema = z
  .object({
    content_markdown: z.string().max(2_000_000).optional(),
    moodboard_images: z.array(z.object({ src: noteRef, caption })).max(500).optional(),
    character_images: z.array(z.object({ name: z.string().trim().min(1, 'Cần tên nhân vật').max(200), src: noteRef.nullable().optional(), caption })).max(500).optional(),
    attached_files: z
      .array(z.object({ name: z.string().trim().min(1, 'Cần tên file').max(300), src: noteRef, mime_type: z.string().trim().max(200).optional(), size_bytes: z.number().int().min(0).optional() }))
      .max(500)
      .optional(),
    playlist_links: z
      .array(z.object({ url: z.string().trim().url().max(2000).refine((v) => /^https?:\/\//i.test(v), 'Link phải là http(s)'), title: z.string().trim().max(300).optional(), platform: z.enum(PLAYLIST_PLATFORMS).optional() }))
      .max(100)
      .optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Cần ít nhất một trường');
export const noteFileQuery = z.object({ kind: z.enum(NOTE_FILE_KINDS), name: z.string().trim().max(300).optional() });

const NOTE_JSON = ['moodboard_images', 'character_images', 'attached_files', 'playlist_links'];
const monthIndex = (y, m) => (y ? y * 12 + (m ?? 1) - 1 : null);

/** Sắp xếp và đánh số lượt xem: theo thời điểm bắt đầu (hoặc xong), lượt chưa có ngày đứng cuối. */
export function numberCards(rows) {
  const sorted = [...rows].sort((a, b) => {
    const ka = monthIndex(a.start_year, a.start_month) ?? monthIndex(a.finish_year, a.finish_month) ?? Infinity;
    const kb = monthIndex(b.start_year, b.start_month) ?? monthIndex(b.finish_year, b.finish_month) ?? Infinity;
    return ka - kb || a.id - b.id;
  });
  const perSeason = new Map();
  return sorted.map((card, index) => {
    const key = card.season ?? 'all';
    perSeason.set(key, (perSeason.get(key) ?? 0) + 1);
    return { ...card, watch_number: index + 1, season_watch_number: perSeason.get(key), finished: card.finish_year !== null };
  });
}

/** Thẻ lượt xem, note & review và file của note cho một media. */
export function createMediaDetailService({ db, storagePaths, items, fileStore }) {
  const uploadsDir = storagePaths?.mediaUploadsDir ?? null;

  const requireItem = (id) => items.get(id);
  const touch = (id) => db.run("UPDATE media_items SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?", [id]);
  const cardRow = (id) => db.get('SELECT * FROM media_watch_cards WHERE id = ?', [id]);
  const cardsOf = async (mediaId) => numberCards(await db.all('SELECT * FROM media_watch_cards WHERE media_id = ?', [mediaId]));

  const checkCard = (card) => {
    const errors = [];
    if (card.start_month !== null && card.start_year === null) errors.push({ path: ['start_year'], message: 'Cần năm khi đã có tháng' });
    if (card.finish_month !== null && card.finish_year === null) errors.push({ path: ['finish_year'], message: 'Cần năm khi đã có tháng' });
    if (card.start_year === null && card.finish_year === null) errors.push({ path: ['start_year'], message: 'Cần ít nhất năm bắt đầu hoặc năm xem xong' });
    const start = monthIndex(card.start_year, card.start_month);
    const finish = monthIndex(card.finish_year, card.finish_month ?? (card.start_month && card.start_year === card.finish_year ? 12 : null));
    if (start !== null && finish !== null && finish < start) errors.push({ path: ['finish_year'], message: 'Xem xong phải sau lúc bắt đầu' });
    if (errors.length) throw new ValidationError('Thẻ lượt xem chưa hợp lệ', errors);
  };

  /** Năm bắt đầu/xong của media lấy theo các lượt xem (dùng cho thống kê theo năm); không có lượt thì giữ nguyên. */
  const syncYears = async (mediaId) => {
    const row = await db.get(
      'SELECT MIN(COALESCE(start_year, finish_year)) AS first, MAX(finish_year) AS last, COUNT(*) AS n FROM media_watch_cards WHERE media_id = ?',
      [mediaId],
    );
    if (row.n) await db.run('UPDATE media_items SET start_year = ?, finish_year = ? WHERE id = ?', [row.first, row.last, mediaId]);
  };

  /** URL /api/media/files/... -> đường dẫn tương đối trong store, hoặc null nếu trỏ ra ngoài. */
  const toStorePath = (url) => {
    if (typeof url !== 'string' || !url.startsWith(FILES_URL_PREFIX)) return null;
    const parts = url.slice(FILES_URL_PREFIX.length).split('/').map((part) => decodeURIComponent(part));
    if (parts.some((part) => part === '..' || part === '')) return null;
    return joinStorePath(...parts);
  };
  // Giữ đồng bộ: chỉ là phép tính đường dẫn, và nơi dùng nó (sync media sang Obsidian) chỉ chạy trên Node.
  const toLocal = (url) => {
    const relative = toStorePath(url);
    if (!relative || !uploadsDir) return null;
    const absolute = path.resolve(uploadsDir, ...relative.split('/'));
    const back = path.relative(uploadsDir, absolute);
    return back && !back.startsWith('..') && !path.isAbsolute(back) ? absolute : null;
  };

  const emptyNote = (mediaId) => ({ media_id: mediaId, content_markdown: '', moodboard_images: [], character_images: [], attached_files: [], playlist_links: [], updated_at: null });
  const readNote = async (mediaId) => {
    const row = await db.get('SELECT * FROM media_notes WHERE media_id = ?', [mediaId]);
    if (!row) return null;
    const note = { ...row };
    for (const key of NOTE_JSON) note[key] = JSON.parse(row[key]);
    return note;
  };
  const galleryRefs = (note) =>
    new Set(
      note ? [...note.moodboard_images, ...note.character_images, ...note.attached_files].map((entry) => entry.src).filter((src) => typeof src === 'string' && src.startsWith(FILES_URL_PREFIX)) : [],
    );

  return {
    toLocal,
    cardsOf,

    async listCards(mediaId) {
      await requireItem(mediaId);
      return { data: await cardsOf(mediaId) };
    },

    async createCard(mediaId, input) {
      await requireItem(mediaId);
      const data = { season: null, start_year: null, start_month: null, finish_year: null, finish_month: null, rating: null, note: null, ...watchCardCreateSchema.parse(input) };
      checkCard(data);
      const id = await db.transaction(async () => {
        const info = await db.run(
          'INSERT INTO media_watch_cards (media_id, season, start_year, start_month, finish_year, finish_month, rating, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [mediaId, data.season, data.start_year, data.start_month, data.finish_year, data.finish_month, data.rating, data.note],
        );
        await syncYears(mediaId);
        await touch(mediaId);
        return info.lastInsertRowid;
      })();
      return (await cardsOf(mediaId)).find((card) => card.id === Number(id));
    },

    async updateCard(cardId, input) {
      const current = await cardRow(cardId);
      if (!current) throw new NotFoundError('Lượt xem', cardId);
      const patch = watchCardUpdateSchema.parse(input);
      const merged = { ...current, ...patch };
      checkCard(merged);
      const keys = Object.keys(patch);
      await db.transaction(async () => {
        if (keys.length) {
          await db.run(
            `UPDATE media_watch_cards SET ${keys.map((key) => `${key} = ?`).join(', ')}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`,
            [...keys.map((key) => patch[key]), cardId],
          );
        }
        await syncYears(current.media_id);
        await touch(current.media_id);
      })();
      return (await cardsOf(current.media_id)).find((card) => card.id === cardId);
    },

    async deleteCard(cardId) {
      const current = await cardRow(cardId);
      if (!current) throw new NotFoundError('Lượt xem', cardId);
      await db.transaction(async () => {
        await db.run('DELETE FROM media_watch_cards WHERE id = ?', [cardId]);
        await syncYears(current.media_id);
        await touch(current.media_id);
      })();
    },

    async getNote(mediaId) {
      await requireItem(mediaId);
      return (await readNote(mediaId)) ?? emptyNote(mediaId);
    },

    /** Ghi note; trường không gửi giữ nguyên. File gallery/đính kèm bị bỏ khỏi note thì xoá luôn trên đĩa. */
    async saveNote(mediaId, input) {
      const item = await requireItem(mediaId);
      const patch = mediaNoteSchema.parse(input);
      if (patch.playlist_links) patch.playlist_links = patch.playlist_links.map((link) => ({ ...link, platform: link.platform ?? detectPlatform(link.url) }));
      const { saved, removed } = await db.transaction(async () => {
        const before = await readNote(mediaId);
        const next = { ...(before ?? emptyNote(mediaId)), ...patch };
        await db.run(
          `INSERT INTO media_notes (media_id, content_markdown, moodboard_images, character_images, attached_files, playlist_links, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
           ON CONFLICT (media_id) DO UPDATE SET content_markdown = excluded.content_markdown, moodboard_images = excluded.moodboard_images,
             character_images = excluded.character_images, attached_files = excluded.attached_files, playlist_links = excluded.playlist_links,
             updated_at = excluded.updated_at`,
          [mediaId, next.content_markdown, ...NOTE_JSON.map((key) => JSON.stringify(next[key]))],
        );
        await touch(mediaId);
        const after = await readNote(mediaId);
        const keep = galleryRefs(after);
        return { saved: after, removed: [...galleryRefs(before)].filter((src) => !keep.has(src)) };
      })();
      // Chỉ xoá file nằm trong thư mục của chính media này.
      const own = `${FILES_URL_PREFIX}items/${item.sync_uid}/`;
      for (const src of removed) {
        const relative = src.startsWith(own) ? toStorePath(src) : null;
        if (!relative || !fileStore) continue;
        await fileStore.remove(relative);
        const segments = relative.split('/');
        // .../files/<stamp>/<tên file> -> xoá cả thư mục <stamp>
        if (segments.length >= 3 && segments.at(-3) === 'files') await fileStore.removeDir(segments.slice(0, -1).join('/'));
      }
      return saved;
    },

    /** Tải file cho note media, trả { src, name, mime_type, size_bytes }; client tự ghi vào note. */
    async uploadFile(mediaId, kind, buffer, { name } = {}) {
      const item = await requireItem(mediaId);
      if (!uploadsDir || !fileStore) throw new ValidationError('Server chưa có thư mục lưu trữ để lưu file', []);
      if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new ValidationError('File rỗng', [{ path: ['file'], message: 'Rỗng' }]);
      const stamp = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
      if (kind !== 'attachment') {
        const ext = detectImageType(buffer);
        if (!ext) throw new ValidationError('File không phải ảnh JPG, PNG, WebP, GIF hoặc AVIF', [{ path: ['file'], message: 'Sai định dạng' }]);
        const fileName = `${kind}-${stamp}.${ext}`;
        await fileStore.write(joinStorePath('items', item.sync_uid, fileName), buffer);
        return { src: `${FILES_URL_PREFIX}items/${item.sync_uid}/${fileName}`, name: fileName, mime_type: IMAGE_MIME[ext], size_bytes: buffer.length };
      }
      if (buffer.length > MAX_ATTACHMENT_BYTES) throw new ValidationError('File đính kèm tối đa 50MB', [{ path: ['file'], message: `${buffer.length} byte` }]);
      const fileName = safeFileName(name || 'file');
      await fileStore.write(joinStorePath('items', item.sync_uid, 'files', stamp, fileName), buffer);
      const imageExt = detectImageType(buffer);
      return {
        src: `${FILES_URL_PREFIX}items/${item.sync_uid}/files/${stamp}/${encodeURIComponent(fileName)}`,
        name: fileName,
        mime_type: imageExt ? IMAGE_MIME[imageExt] : 'application/octet-stream',
        size_bytes: buffer.length,
      };
    },
  };
}
