import { z } from 'zod';
import { httpUrl, requireAtLeastOneField } from './common.js';

const caption = z.string().trim().max(1000).optional();

/** Ảnh/file của note: file đã tải lên app (/media/...) hoặc link http(s). Không nhận javascript:, data: ... */
export const noteRef = z
  .string()
  .trim()
  .min(1)
  .max(4096)
  .refine((value) => /^\/media\/[^\s]+$/.test(value) || /^https?:\/\/[^\s]+$/i.test(value), 'Chỉ nhận file đã tải lên hoặc link http(s)');

export const PLAYLIST_PLATFORMS = ['spotify', 'youtube', 'apple_music', 'soundcloud', 'other'];

export const moodboardImage = z.object({ src: noteRef, caption });
export const characterImage = z.object({
  name: z.string().trim().min(1, 'Cần tên nhân vật').max(200),
  src: noteRef.nullable().optional(),
  caption,
});
export const attachedFile = z.object({
  name: z.string().trim().min(1, 'Cần tên file').max(300),
  src: noteRef,
  mime_type: z.string().trim().max(200).optional(),
  size_bytes: z.number().int().min(0).optional(),
});
export const playlistLink = z.object({
  url: httpUrl,
  title: z.string().trim().max(300).optional(),
  platform: z.enum(PLAYLIST_PLATFORMS).optional(),
});

export const upsertReadingNoteSchema = requireAtLeastOneField(
  z.object({
    content_markdown: z.string().max(2_000_000).optional(),
    moodboard_images: z.array(moodboardImage).max(500).optional(),
    character_images: z.array(characterImage).max(500).optional(),
    attached_files: z.array(attachedFile).max(500).optional(),
    playlist_links: z.array(playlistLink).max(100).optional(),
  }),
);

export const noteFileParams = z.object({ id: z.coerce.number().int().positive() });
export const noteFileQuery = z.object({
  kind: z.enum(['moodboard', 'character', 'inline', 'attachment']),
  name: z.string().trim().max(300).optional(),
});
