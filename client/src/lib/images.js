import { sendBinary } from './api.js';

/**
 * Thu nhỏ ảnh trước khi tải lên (cạnh dài tối đa 1600px, lưu WebP) để kệ sách tải nhanh
 * và thư mục lưu trữ không phình to. GIF giữ nguyên để không mất chuyển động.
 */
export async function prepareImage(file, { maxSide = 1600 } = {}) {
  if (!file.type.startsWith('image/')) throw new Error('File này không phải ảnh');
  if (file.type === 'image/gif') return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size < 1_500_000) {
    bitmap.close?.();
    return file;
  }
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.88));
  return blob ?? file;
}

export function uploadImage(itemId, kind, blob) {
  return sendBinary('PUT', `/items/${itemId}/images/${kind}`, blob);
}

// File tải lên app: /media/... (sách) hoặc /api/media/files/... (media).
export const isLocalImage = (value) => typeof value === 'string' && (value.startsWith('/media/') || value.startsWith('/api/media/files/'));

/**
 * Tải ảnh (moodboard, character, inline) hoặc file đính kèm của note.
 * Trả về { src, name, mime_type, size_bytes }; gọi PUT /items/:id/note sau đó để lưu vào note.
 */
export function uploadNoteFile(itemId, kind, file) {
  return uploadTo(`/items/${itemId}/files`, kind, file);
}

/** Như uploadNoteFile nhưng cho note của media (lưu trong thư mục lưu trữ của media). */
export function uploadMediaNoteFile(itemId, kind, file) {
  return uploadTo(`/media/items/${itemId}/files`, kind, file);
}

async function uploadTo(path, kind, file) {
  const body = kind === 'attachment' ? file : await prepareImage(file);
  const query = new URLSearchParams({ kind, ...(file.name ? { name: file.name } : {}) });
  return sendBinary('POST', `${path}?${query}`, body);
}

/** Lấy file ảnh từ sự kiện dán (Ctrl+V) hoặc kéo thả. */
export function imageFilesFrom(dataTransfer) {
  if (!dataTransfer) return [];
  return [...(dataTransfer.files ?? [])].filter((file) => file.type.startsWith('image/'));
}

export function formatBytes(bytes) {
  if (bytes === null || bytes === undefined) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toLocaleString('vi-VN', { maximumFractionDigits: 0 })} KB`;
  return `${(bytes / 1024 / 1024).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} MB`;
}
