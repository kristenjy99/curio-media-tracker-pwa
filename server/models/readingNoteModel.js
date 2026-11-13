import { fromDbRow, nowIso, toDbParams } from '../utils/sql.js';

export const NOTE_JSON_FIELDS = ['moodboard_images', 'character_images', 'attached_files', 'playlist_links'];

const SQL_FIND_BY_ITEM = 'SELECT * FROM reading_notes WHERE item_id = ?';
const SQL_UPSERT = `
    INSERT INTO reading_notes (item_id, content_markdown, moodboard_images, character_images, attached_files, playlist_links, updated_at)
    VALUES (@item_id, @content_markdown, @moodboard_images, @character_images, @attached_files, @playlist_links, @updated_at)
    ON CONFLICT (item_id) DO UPDATE SET
      content_markdown = excluded.content_markdown,
      moodboard_images = excluded.moodboard_images,
      character_images = excluded.character_images,
      attached_files   = excluded.attached_files,
      playlist_links   = excluded.playlist_links,
      updated_at       = excluded.updated_at
  `;

export function createReadingNoteModel(db) {
  return {
    async findByItem(itemId) {
      return fromDbRow(await db.get(SQL_FIND_BY_ITEM, [itemId]), { jsonFields: NOTE_JSON_FIELDS });
    },

    /** Ghi toàn bộ note; trường không truyền vào sẽ giữ giá trị cũ (hoặc mặc định nếu note chưa tồn tại). */
    async upsert(itemId, patch) {
      const existing = await this.findByItem(itemId);
      const merged = {
        content_markdown: '',
        moodboard_images: [],
        character_images: [],
        attached_files: [],
        playlist_links: [],
        ...(existing ?? {}),
        ...Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)),
      };
      await db.run(SQL_UPSERT, {
        ...toDbParams(
          {
            content_markdown: merged.content_markdown,
            moodboard_images: merged.moodboard_images,
            character_images: merged.character_images,
            attached_files: merged.attached_files,
            playlist_links: merged.playlist_links,
          },
          { jsonFields: NOTE_JSON_FIELDS },
        ),
        item_id: itemId,
        updated_at: nowIso(),
      });
      return this.findByItem(itemId);
    },
  };
}
