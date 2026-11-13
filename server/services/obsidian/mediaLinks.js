import path from 'node:path';
import { MEDIA_PREFIX } from '../imageService.js';

/**
 * Ảnh/file tải lên trong app nằm ở <storage>/uploads và được gọi bằng URL /media/...; Obsidian không đọc được
 * các URL này. Khi sync, mỗi file được chép vào <thư mục sync>/_attachments/<thư mục của sách>/ và trong file .md
 * được ghi thành link vault ([[Reading Tracker/_attachments/Tên sách/cover-....webp]]).
 *
 * Moodboard, nhân vật, file đính kèm và playlist được ghi thành một mục ở cuối note, nằm giữa hai dòng đánh dấu.
 * App tạo lại mục này mỗi lần ghi file; khi đọc file (sync hai chiều) mục này bị bỏ qua.
 */
export const ATTACHMENTS_DIR = '_attachments';
export const GALLERY_START = '%% rt-gallery: mục dưới đây do app Reading Tracker tạo lại mỗi lần sync, sửa ở đây sẽ bị ghi đè %%';
export const GALLERY_END = '%% /rt-gallery %%';

const GALLERY_BLOCK = /\n*^%% rt-gallery[^\n]*%%$[\s\S]*?^%% \/rt-gallery %%$\n?/m;
const MEDIA_IMAGE = /!\[([^\]\n]*)\]\((\/media\/[^)\s]+)\)/g;
const MEDIA_LINK = /(?<!!)\[([^\]\n]*)\]\((\/media\/[^)\s]+)\)/g;

export const isMediaUrl = (value) => typeof value === 'string' && value.startsWith(MEDIA_PREFIX);

function vaultFileName(url) {
  const parts = url.split('/').map((part) => {
    try {
      return decodeURIComponent(part);
    } catch {
      return part;
    }
  });
  return parts.at(-1);
}

/**
 * Bộ ánh xạ /media/... -> đường dẫn trong vault cho một sách.
 *   vaultPrefix  thư mục sync tính từ gốc vault ("Reading Tracker"), rỗng nếu sync thẳng vào gốc vault
 *   mediaDir     tên thư mục của sách trong _attachments (null = sách chưa có thư mục, không ánh xạ được)
 *   toLocalPath  hàm đổi URL /media/... thành đường dẫn file trên đĩa
 * Mỗi lần link() được gọi, file tương ứng được ghi nhận vào files để sync engine chép sang vault.
 */
export function createMediaMapper({ vaultPrefix = '', mediaDir, toLocalPath = () => null, urlPrefix = MEDIA_PREFIX }) {
  const files = new Map(); // tên file trong vault (chữ thường) -> { name, url, localPath }
  const byUrl = new Map();
  const dirRel = mediaDir ? `${ATTACHMENTS_DIR}/${mediaDir}` : null;
  const prefix = vaultPrefix ? `${vaultPrefix.replace(/\/+$/, '')}/` : '';

  function nameFor(url) {
    if (byUrl.has(url)) return byUrl.get(url);
    const original = vaultFileName(url);
    const ext = path.extname(original);
    const stem = original.slice(0, original.length - ext.length);
    let name = original;
    for (let counter = 2; files.has(name.toLowerCase()); counter += 1) name = `${stem} (${counter})${ext}`;
    files.set(name.toLowerCase(), { name, url, localPath: toLocalPath(url) });
    byUrl.set(url, name);
    return name;
  }

  return {
    dirRel,
    /** Đường dẫn vault (không có [[ ]]) của một URL /media; trả null nếu không phải file của app. */
    urlPrefix,
    link(url) {
      if (typeof url !== 'string' || !url.startsWith(urlPrefix) || !dirRel) return null;
      return `${prefix}${dirRel}/${nameFor(url)}`;
    },
    /** URL /media của một link vault đã ghi ra trước đó (dùng khi nhập ngược từ Obsidian). */
    restore(vaultPath) {
      if (!dirRel) return null;
      const text = String(vaultPath).trim();
      const base = `${prefix}${dirRel}/`;
      if (!text.toLowerCase().startsWith(base.toLowerCase())) return null;
      return files.get(text.slice(base.length).toLowerCase())?.url ?? null;
    },
    files() {
      return [...files.values()];
    },
  };
}

/** Ảnh/link /media trong nội dung note -> embed/link kiểu Obsidian. */
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

export function bodyToVault(body, mapper) {
  // Mặc định là URL /media/... của sách; media dùng /api/media/files/... (mapper.urlPrefix).
  const prefix = mapper.urlPrefix && mapper.urlPrefix !== MEDIA_PREFIX ? escapeRegex(mapper.urlPrefix) : null;
  const imagePattern = prefix ? new RegExp(`!\\[([^\\]\\n]*)\\]\\((${prefix}[^)\\s]+)\\)`, 'g') : MEDIA_IMAGE;
  const linkPattern = prefix ? new RegExp(`(?<!!)\\[([^\\]\\n]*)\\]\\((${prefix}[^)\\s]+)\\)`, 'g') : MEDIA_LINK;
  return body
    .replace(imagePattern, (match, alt, url) => {
      const target = mapper.link(url);
      const label = alt.replace(/[|\]]/g, ' ').trim();
      // Alias không phải số được Obsidian dùng làm alt text; số thì là độ rộng, nên bỏ.
      return target ? `![[${target}${label && !/^\d+(x\d+)?$/.test(label) ? `|${label}` : ''}]]` : match;
    })
    .replace(linkPattern, (match, text, url) => {
      const target = mapper.link(url);
      return target ? `[[${target}${text ? `|${text}` : ''}]]` : match;
    });
}

/** Ngược lại với bodyToVault: chỉ đổi những link trỏ vào thư mục ảnh của chính sách này. */
export function bodyFromVault(body, mapper) {
  return body.replace(/(!?)\[\[([^\]|\n]+)(?:\|([^\]\n]*))?\]\]/g, (match, bang, target, alias) => {
    const url = mapper.restore(target);
    if (!url) return match;
    return bang ? `![${alias && !/^\d+(x\d+)?$/.test(alias) ? alias : ''}](${url})` : `[${alias ?? ''}](${url})`;
  });
}

export function stripGallery(body) {
  return body.replace(GALLERY_BLOCK, '\n').replace(/\n{3,}$/, '\n');
}

const embed = (src, mapper, width) => {
  const target = mapper.link(src);
  if (target) return `![[${target}|${width}]]`;
  return `![](${src})`;
};

const oneLine = (text) => String(text ?? '').replace(/\s*\n\s*/g, ' ').trim();

/** Mục gallery cuối note; trả chuỗi rỗng nếu note không có moodboard/nhân vật/đính kèm/playlist. */
export function renderGallery(note, mapper) {
  if (!note) return '';
  const moodboard = note.moodboard_images ?? [];
  const characters = note.character_images ?? [];
  const attachments = note.attached_files ?? [];
  const playlists = note.playlist_links ?? [];
  if (!moodboard.length && !characters.length && !attachments.length && !playlists.length) return '';

  const sections = [];
  if (moodboard.length) {
    const lines = ['## 🖼️ Moodboard', ''];
    if (moodboard.every((entry) => !entry.caption)) {
      lines.push(moodboard.map((entry) => embed(entry.src, mapper, 260)).join(' '));
    } else {
      moodboard.forEach((entry, index) => {
        if (index) lines.push('');
        lines.push(embed(entry.src, mapper, 360));
        if (entry.caption) lines.push(`*${oneLine(entry.caption)}*`);
      });
    }
    sections.push(lines.join('\n'));
  }
  if (characters.length) {
    const lines = ['## 👥 Nhân vật'];
    for (const character of characters) {
      lines.push('', `### ${oneLine(character.name)}`);
      if (character.src) lines.push(embed(character.src, mapper, 200));
      if (character.caption) lines.push(String(character.caption).trim());
    }
    sections.push(lines.join('\n'));
  }
  if (attachments.length) {
    const lines = ['## 📎 File đính kèm', ''];
    for (const file of attachments) {
      const target = mapper.link(file.src);
      const label = oneLine(file.name).replace(/[[\]|]/g, ' ');
      lines.push(target ? `- [[${target}|${label}]]` : `- [${label}](${file.src})`);
    }
    sections.push(lines.join('\n'));
  }
  if (playlists.length) {
    const lines = ['## 🎵 Playlist', ''];
    for (const link of playlists) lines.push(`- [${oneLine(link.title || link.url).replace(/[[\]]/g, ' ')}](${link.url})`);
    sections.push(lines.join('\n'));
  }
  return `${GALLERY_START}\n${sections.join('\n\n')}\n${GALLERY_END}\n`;
}

/** Ghép phần thân note với mục gallery (luôn cách nhau một dòng trống). */
export function appendGallery(body, gallery) {
  if (!gallery) return body;
  const trimmed = body.replace(/\s+$/, '');
  return trimmed ? `${trimmed}\n\n${gallery}` : gallery;
}
