import DOMPurify from 'dompurify';
import { Marked } from 'marked';
import { resolveFileUrl } from './api.js';

const escapeHtml = (text) =>
  String(text).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i;

/**
 * Cú pháp riêng của Obsidian hay gặp trong note người dùng nhập từ vault:
 *   ![[file.jpg|300]]  embed file trong vault (app không đọc được vault nên hiện dạng nhãn)
 *   [[Tên note|bí danh]]  link nội bộ
 *   ==chữ==  highlight
 */
const obsidianExtensions = [
  {
    name: 'wikiEmbed',
    level: 'inline',
    start: (src) => src.indexOf('![['),
    tokenizer(src) {
      const match = /^!\[\[([^\]|\n]+)(?:\|([^\]\n]*))?\]\]/.exec(src);
      if (match) return { type: 'wikiEmbed', raw: match[0], target: match[1].trim() };
      return undefined;
    },
    renderer: (token) => {
      const name = token.target.split('/').pop();
      const kind = IMAGE_EXT.test(name) ? 'Ảnh trong vault' : 'File trong vault';
      return `<span class="md-wiki-embed" title="${escapeHtml(token.target)}">${kind}: ${escapeHtml(name)}</span>`;
    },
  },
  {
    name: 'wikiLink',
    level: 'inline',
    start: (src) => src.indexOf('[['),
    tokenizer(src) {
      const match = /^\[\[([^\]|\n]+)(?:\|([^\]\n]*))?\]\]/.exec(src);
      if (match) return { type: 'wikiLink', raw: match[0], target: match[1].trim(), alias: match[2]?.trim() };
      return undefined;
    },
    renderer: (token) => `<span class="md-wiki-link" title="${escapeHtml(token.target)}">${escapeHtml(token.alias || token.target)}</span>`,
  },
  {
    name: 'highlight',
    level: 'inline',
    start: (src) => src.indexOf('=='),
    tokenizer(src) {
      const match = /^==(?=\S)([^\n]*?\S)==/.exec(src);
      if (match) return { type: 'highlight', raw: match[0], tokens: this.lexer.inlineTokens(match[1]) };
      return undefined;
    },
    renderer(token) {
      return `<mark>${this.parser.parseInline(token.tokens)}</mark>`;
    },
  },
];

const marked = new Marked({ gfm: true, breaks: true, extensions: obsidianExtensions });

let hooked = false;
function ensureHooks() {
  if (hooked) return;
  hooked = true;
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A' && node.getAttribute('href')) {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
    }
    if (node.tagName === 'IMG') {
      node.setAttribute('loading', 'lazy');
      // Ảnh chèn trong note được lưu dạng '/media/...'. Khi app không ở gốc domain (GitHub Pages),
      // đường dẫn đó phải có tiền tố base, nếu không trình duyệt gọi ra gốc domain và nhận 404.
      const src = node.getAttribute('src');
      const resolved = resolveFileUrl(src);
      if (resolved !== src) node.setAttribute('src', resolved);
    }
    // Chỉ giữ checkbox của danh sách việc cần làm, luôn ở dạng chỉ xem.
    if (node.tagName === 'INPUT') {
      if (node.getAttribute('type') !== 'checkbox') node.remove();
      else node.setAttribute('disabled', '');
    }
  });
}

/** Markdown của note -> HTML đã lọc (không có script, sự kiện, link javascript:). Comment %%...%% của Obsidian bị ẩn. */
export function renderMarkdown(text) {
  ensureHooks();
  const source = String(text ?? '').replace(/%%[\s\S]*?%%/g, '');
  const html = marked.parse(source);
  return DOMPurify.sanitize(html, { ADD_ATTR: ['target'], FORBID_TAGS: ['style', 'form', 'button', 'textarea', 'select'] });
}
