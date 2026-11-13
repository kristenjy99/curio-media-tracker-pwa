import { createHash } from 'node:crypto';
import YAML from 'yaml';

export const hashText = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

/**
 * Tách frontmatter YAML và phần thân. Chấp nhận BOM và CRLF (file tạo trên Windows).
 * Phần thân bỏ đúng một dòng trống ngay sau "---" để khớp với renderMarkdown.
 */
export function splitMarkdown(rawText) {
  const text = rawText.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const lines = text.split('\n');
  if (lines[0]?.trim() !== '---') {
    return { hasFrontmatter: false, data: {}, body: text };
  }
  const closing = lines.findIndex((line, index) => index > 0 && (line.trim() === '---' || line.trim() === '...'));
  if (closing === -1) {
    throw new Error('Frontmatter mở bằng "---" nhưng không có dòng "---" đóng');
  }

  const yamlText = lines.slice(1, closing).join('\n');
  let data;
  try {
    data = yamlText.trim() ? YAML.parse(yamlText, { schema: 'core', uniqueKeys: true }) : {};
  } catch (error) {
    throw new Error(`YAML không hợp lệ: ${error.message.split('\n')[0]}`);
  }
  if (data === null || data === undefined) data = {};
  if (typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Frontmatter phải là danh sách property dạng key: value');
  }

  let body = lines.slice(closing + 1).join('\n');
  if (body.startsWith('\n')) body = body.slice(1);
  return { hasFrontmatter: true, data, body };
}

export function renderMarkdown(data, body) {
  const yamlText = YAML.stringify(data, { lineWidth: 0, minContentWidth: 0, nullStr: '' });
  const content = body ?? '';
  return content ? `---\n${yamlText}---\n\n${content}` : `---\n${yamlText}---\n`;
}

/**
 * Thêm một property vào đầu frontmatter mà không render lại toàn bộ file,
 * để giữ nguyên định dạng người dùng đã viết trong Obsidian.
 */
export function insertProperty(rawText, key, value) {
  const eol = rawText.includes('\r\n') ? '\r\n' : '\n';
  const bom = rawText.startsWith('﻿') ? '﻿' : '';
  const text = rawText.slice(bom.length);
  const line = `${key}: ${YAML.stringify(value, { lineWidth: 0 }).trim()}`;
  const firstLineEnd = text.indexOf('\n');
  const firstLine = (firstLineEnd === -1 ? text : text.slice(0, firstLineEnd)).replace(/\r$/, '');
  if (firstLine.trim() === '---') {
    const rest = firstLineEnd === -1 ? '' : text.slice(firstLineEnd + 1);
    return `${bom}---${eol}${line}${eol}${rest}`;
  }
  return `${bom}---${eol}${line}${eol}---${eol}${eol}${text}`;
}
