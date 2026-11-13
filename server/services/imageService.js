import path from 'node:path';
import { ConflictError, NotFoundError, ValidationError } from '../utils/errors.js';
import { joinStorePath } from '../storage/fileStore.js';

export const MEDIA_PREFIX = '/media/';
export const IMAGE_KINDS = { cover: 'cover_image', spine: 'spine_image' };
// Loại file tải lên cho note: ảnh moodboard, ảnh nhân vật, ảnh chèn trong nội dung note, file đính kèm bất kỳ.
export const NOTE_FILE_KINDS = ['moodboard', 'character', 'inline', 'attachment'];
export const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;
const IMAGE_MIME = { jpg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif' };
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/** Tên file đính kèm an toàn trên Windows/macOS, giữ đuôi gốc (đã chữ thường). */
export function safeFileName(name) {
  const raw = String(name ?? '').normalize('NFC').split(/[\\/]/).pop();
  const extMatch = raw.match(/\.([A-Za-z0-9]{1,10})$/);
  const ext = extMatch ? extMatch[1].toLowerCase() : '';
  let base = (extMatch ? raw.slice(0, -extMatch[0].length) : raw)
    .replace(/[:*?"<>|#^[\]\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[.\s]+|[.\s]+$/g, '');
  if (base.length > 80) base = base.slice(0, 80).trim();
  if (!base) base = 'file';
  if (WINDOWS_RESERVED.test(base)) base = `${base}_`;
  return ext ? `${base}.${ext}` : base;
}

// Nhận dạng ảnh theo vài byte đầu, không tin vào Content-Type do client gửi.
const SIGNATURES = [
  { ext: 'jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: 'png', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { ext: 'gif', test: (b) => b.subarray(0, 4).toString('latin1') === 'GIF8' },
  { ext: 'webp', test: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
  { ext: 'avif', test: (b) => b.subarray(4, 12).toString('latin1') === 'ftypavif' },
];

export function detectImageType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  return SIGNATURES.find((signature) => signature.test(buffer))?.ext ?? null;
}

/**
 * Ảnh bìa/gáy lưu ở <storage>/uploads/items/<sync_uid>/, được phục vụ qua /media/items/<sync_uid>/<file>.
 * Vì nằm trong thư mục lưu trữ nên ảnh đi theo khi đổi thư mục (Google Drive...).
 *
 * Mọi thao tác đọc/ghi file đi qua FileStore (context.fileStore) nên bản PWA chỉ cần đổi store,
 * không sửa service. Riêng toLocalPath giữ đồng bộ: đó chỉ là phép tính đường dẫn, và nơi dùng nó
 * (đồng bộ Obsidian) vốn chỉ chạy trên Node.
 */
export function createImageService({ models, storagePaths, fileStore }) {
  const { items } = models;

  // Điều kiện là có FileStore, không phải có thư mục trên đĩa: bản PWA có store (IndexedDB) nhưng
  // storagePaths luôn null.
  function store() {
    if (!fileStore) throw new ConflictError('Server chưa có thư mục lưu trữ để lưu ảnh');
    return fileStore;
  }

  /** URL /media/... -> đường dẫn tương đối trong store, hoặc null nếu trỏ ra ngoài. */
  function toStorePath(url) {
    if (typeof url !== 'string' || !url.startsWith(MEDIA_PREFIX)) return null;
    const parts = url.slice(MEDIA_PREFIX.length).split('/').map(decodeURIComponent);
    if (parts.some((part) => part === '..' || part === '')) return null;
    return joinStorePath(...parts);
  }

  function toLocalPath(url) {
    const relative = toStorePath(url);
    if (!relative || !storagePaths) return null;
    const root = storagePaths.uploadsDir;
    const absolute = path.resolve(root, ...relative.split('/'));
    const back = path.relative(root, absolute);
    return back && !back.startsWith('..') && !path.isAbsolute(back) ? absolute : null;
  }

  async function removeByUrl(url) {
    const relative = toStorePath(url);
    if (relative && fileStore) await fileStore.remove(relative);
  }

  async function requireItem(id) {
    const item = await items.findByIdInternal(id);
    if (!item) throw new NotFoundError('Item', id);
    return item;
  }

  return {
    toLocalPath,

    async upload(itemId, kind, buffer) {
      const field = IMAGE_KINDS[kind];
      if (!field) throw new ValidationError('Loại ảnh phải là cover hoặc spine', [{ path: ['kind'], message: kind }]);
      const item = await requireItem(itemId);
      const ext = detectImageType(buffer);
      if (!ext) throw new ValidationError('File không phải ảnh JPG, PNG, WebP, GIF hoặc AVIF', [{ path: ['file'], message: 'Sai định dạng' }]);

      const fileName = `${kind}-${Date.now()}.${ext}`;
      await store().write(joinStorePath('items', item.sync_uid, fileName), buffer);
      const previous = item[field];
      const updated = await items.update(itemId, { [field]: `${MEDIA_PREFIX}items/${item.sync_uid}/${fileName}` });
      if (previous && previous !== updated[field]) await removeByUrl(previous);
      return updated;
    },

    async remove(itemId, kind) {
      const field = IMAGE_KINDS[kind];
      if (!field) throw new ValidationError('Loại ảnh phải là cover hoặc spine', [{ path: ['kind'], message: kind }]);
      const item = await requireItem(itemId);
      await removeByUrl(item[field]);
      return items.update(itemId, { [field]: null });
    },

    /**
     * Tải file cho note của sách. Không tự ghi vào note: client nhận về { src, name, mime_type, size_bytes }
     * rồi lưu note (PUT /items/:id/note) trong cùng thao tác.
     * Ảnh (moodboard, character, inline) được kiểm tra theo nội dung file; file đính kèm nhận mọi định dạng.
     */
    async uploadNoteFile(itemId, kind, buffer, { name } = {}) {
      if (!NOTE_FILE_KINDS.includes(kind)) {
        throw new ValidationError(`Loại file phải là một trong: ${NOTE_FILE_KINDS.join(', ')}`, [{ path: ['kind'], message: kind }]);
      }
      if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new ValidationError('File rỗng', [{ path: ['file'], message: 'Rỗng' }]);
      const item = await requireItem(itemId);
      const stamp = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;

      if (kind !== 'attachment') {
        const ext = detectImageType(buffer);
        if (!ext) throw new ValidationError('File không phải ảnh JPG, PNG, WebP, GIF hoặc AVIF', [{ path: ['file'], message: 'Sai định dạng' }]);
        const fileName = `${kind}-${stamp}.${ext}`;
        await store().write(joinStorePath('items', item.sync_uid, fileName), buffer);
        return { src: `${MEDIA_PREFIX}items/${item.sync_uid}/${fileName}`, name: fileName, mime_type: IMAGE_MIME[ext], size_bytes: buffer.length };
      }

      if (buffer.length > MAX_ATTACHMENT_BYTES) {
        throw new ValidationError('File đính kèm tối đa 50MB', [{ path: ['file'], message: `${buffer.length} byte` }]);
      }
      // Mỗi file đính kèm một thư mục riêng để giữ đúng tên gốc mà không đụng nhau.
      const fileName = safeFileName(name || 'file');
      await store().write(joinStorePath('items', item.sync_uid, 'files', stamp, fileName), buffer);
      const imageExt = detectImageType(buffer);
      return {
        src: `${MEDIA_PREFIX}items/${item.sync_uid}/files/${stamp}/${encodeURIComponent(fileName)}`,
        name: fileName,
        mime_type: imageExt ? IMAGE_MIME[imageExt] : guessMime(fileName),
        size_bytes: buffer.length,
      };
    },

    /** Xoá file /media của note không còn được dùng (file đính kèm thì xoá cả thư mục riêng của nó). */
    async removeNoteFile(url) {
      const relative = toStorePath(url);
      if (!relative || !fileStore) return;
      await fileStore.remove(relative);
      const segments = relative.split('/');
      // .../files/<stamp>/<tên file> -> xoá cả thư mục <stamp>
      if (segments.length >= 3 && segments.at(-3) === 'files') {
        await fileStore.removeDir(segments.slice(0, -1).join('/'));
      }
    },

    /** Gọi khi xoá sách: bỏ cả thư mục ảnh của sách đó. */
    async removeAllForItem(syncUid) {
      if (!fileStore || !syncUid) return;
      await fileStore.removeDir(joinStorePath('items', syncUid));
    },
  };
}

const MIME_BY_EXT = {
  pdf: 'application/pdf',
  epub: 'application/epub+zip',
  txt: 'text/plain',
  md: 'text/markdown',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  zip: 'application/zip',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  mp4: 'video/mp4',
  svg: 'image/svg+xml',
};

function guessMime(fileName) {
  const ext = fileName.includes('.') ? fileName.split('.').pop().toLowerCase() : '';
  return MIME_BY_EXT[ext] ?? 'application/octet-stream';
}
