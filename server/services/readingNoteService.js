import { NotFoundError } from '../utils/errors.js';
import { MEDIA_PREFIX } from './imageService.js';

/** Nhận dạng nền tảng playlist theo tên miền, dùng để chọn kiểu nhúng trên giao diện. */
export function detectPlatform(url) {
  let host = '';
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return 'other';
  }
  if (host === 'open.spotify.com' || host.endsWith('.spotify.com') || host === 'spotify.link') return 'spotify';
  if (host === 'youtu.be' || host.endsWith('youtube.com') || host.endsWith('youtube-nocookie.com')) return 'youtube';
  if (host === 'music.apple.com') return 'apple_music';
  if (host.endsWith('soundcloud.com')) return 'soundcloud';
  return 'other';
}

/** Các file /media mà gallery + đính kèm của note đang dùng (ảnh chèn trong nội dung không tính, xem upsert). */
function galleryRefs(note) {
  if (!note) return new Set();
  return new Set(
    [
      ...note.moodboard_images.map((entry) => entry.src),
      ...note.character_images.map((entry) => entry.src),
      ...note.attached_files.map((entry) => entry.src),
    ].filter((src) => typeof src === 'string' && src.startsWith(MEDIA_PREFIX)),
  );
}

export function createReadingNoteService(context) {
  const { db, models } = context;
  const { items, readingNotes } = models;
  const images = () => context.services?.images;

  async function requireItem(itemId) {
    if (!(await items.exists(itemId))) throw new NotFoundError('Item', itemId);
  }

  return {
    /** Item chưa có note thì trả về note rỗng để frontend không phải xử lý trường hợp 404. */
    async get(itemId) {
      await requireItem(itemId);
      return (
        (await readingNotes.findByItem(itemId)) ?? {
          id: null,
          item_id: itemId,
          content_markdown: '',
          moodboard_images: [],
          character_images: [],
          attached_files: [],
          playlist_links: [],
          updated_at: null,
        }
      );
    },

    /**
     * Ghi note; trường không gửi giữ nguyên. Ảnh/file trong gallery và đính kèm bị bỏ khỏi note thì file
     * trên đĩa bị xoá luôn (thao tác xoá trên giao diện là có chủ đích). Ảnh chèn trong nội dung note thì
     * không tự xoá, vì người dùng có thể hoàn tác (Ctrl+Z) sau khi đã lưu; chúng bị dọn khi xoá sách.
     */
    async upsert(itemId, patch) {
      const normalized = { ...patch };
      if (normalized.playlist_links) {
        normalized.playlist_links = normalized.playlist_links.map((link) => ({ ...link, platform: link.platform ?? detectPlatform(link.url) }));
      }
      const { note, removed, prefix } = await db.transaction(async () => {
        await requireItem(itemId);
        const ownPrefix = `${MEDIA_PREFIX}items/${(await items.findByIdInternal(itemId)).sync_uid}/`;
        const before = galleryRefs(await readingNotes.findByItem(itemId));
        const saved = await readingNotes.upsert(itemId, normalized);
        await items.touch(itemId);
        const after = galleryRefs(saved);
        return { note: saved, removed: [...before].filter((src) => !after.has(src)), prefix: ownPrefix };
      })();
      // Chỉ xoá file nằm trong thư mục của chính sách này.
      for (const src of removed) if (src.startsWith(prefix) && !src.includes('..')) await images()?.removeNoteFile(src);
      return note;
    },
  };
}
