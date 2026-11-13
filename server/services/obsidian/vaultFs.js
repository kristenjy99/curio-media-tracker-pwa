import fs from 'node:fs';
import path from 'node:path';

export const TRASH_DIR = '.trash';
export const CONFLICT_PATTERN = /\.conflict-\d{8}-\d{6}(?:-\d+)?\.md$/i;

const RETRYABLE = new Set(['EBUSY', 'EPERM', 'EACCES', 'EAGAIN']);
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/**
 * Buffer cho Atomics.wait (ngủ đồng bộ) được tạo lúc dùng, không tạo lúc nạp module.
 *
 * Lý do: file này nằm trong đồ thị import của bảng route (phần import markdown dùng chung bộ parse
 * với sync Obsidian), nên nó cũng được nạp trong bản PWA. Trình duyệt không có SharedArrayBuffer khi
 * server không gửi header COOP/COEP — mà GitHub Pages không cho đặt header — nên một dòng khởi tạo
 * ở cấp module làm cả worker chết ngay lúc nạp, dù không ai gọi tới hàm này.
 */
let sleepBuffer = null;

/** Google Drive/OneDrive/antivirus trên Windows hay khoá file vài trăm ms; thử lại trước khi báo lỗi. */
function withRetry(operation, attempts = 6) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return operation();
    } catch (error) {
      if (!RETRYABLE.has(error.code) || attempt >= attempts) throw error;
      sleepBuffer ??= new Int32Array(new SharedArrayBuffer(4));
      Atomics.wait(sleepBuffer, 0, 0, 150 * attempt);
    }
  }
}

export const toPosix = (relPath) => relPath.split(path.sep).join('/');

export function toAbsolute(root, relPath) {
  const absolute = path.resolve(root, ...relPath.split('/'));
  const relative = path.relative(root, absolute);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Đường dẫn "${relPath}" nằm ngoài thư mục sync`);
  }
  return absolute;
}

/**
 * Quét đệ quy file .md, bỏ qua thư mục ẩn (.trash, .obsidian...), file conflict và các thư mục
 * ở cấp gốc nằm trong skipTopDirs (ví dụ _attachments chứa file đính kèm, có thể là .md của người khác).
 */
export function scanMarkdownFiles(root, { skipTopDirs = [] } = {}) {
  const results = [];
  const skip = new Set(skipTopDirs.map((name) => name.toLowerCase()));
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory() && dir === root && skip.has(entry.name.toLowerCase())) continue;
      if (entry.isDirectory()) walk(absolute);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md') && !CONFLICT_PATTERN.test(entry.name)) {
        const stat = fs.statSync(absolute);
        results.push({ relPath: toPosix(path.relative(root, absolute)), absPath: absolute, mtimeMs: stat.mtimeMs });
      }
    }
  };
  if (fs.existsSync(root)) walk(root);
  return results.sort((a, b) => a.relPath.localeCompare(b.relPath));
}

export function readText(absPath) {
  return withRetry(() => fs.readFileSync(absPath, 'utf8'));
}

/** Ghi qua file tạm rồi rename để Obsidian/dịch vụ sync không bao giờ đọc phải file ghi dở. */
export function writeTextAtomic(absPath, text) {
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  const tmpPath = path.join(path.dirname(absPath), `.${path.basename(absPath)}.${process.pid}.tmp`);
  fs.writeFileSync(tmpPath, text, 'utf8');
  try {
    withRetry(() => fs.renameSync(tmpPath, absPath));
  } catch (error) {
    fs.rmSync(tmpPath, { force: true });
    throw error;
  }
}

function timestampSuffix(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(
    date.getMinutes(),
  )}${pad(date.getSeconds())}`;
}

function firstFreePath(candidateFor) {
  for (let counter = 0; ; counter += 1) {
    const candidate = candidateFor(counter);
    if (!fs.existsSync(candidate)) return candidate;
  }
}

/** Lưu bản thua trong conflict cạnh file gốc: "Tên.conflict-20261104-134500.md". */
export function writeConflictCopy(absPath, text) {
  const base = absPath.replace(/\.md$/i, '');
  const stamp = timestampSuffix();
  const target = firstFreePath((n) => `${base}.conflict-${stamp}${n ? `-${n}` : ''}.md`);
  writeTextAtomic(target, text);
  return target;
}

export function moveToTrash(root, absPath) {
  const trashDir = path.join(root, TRASH_DIR);
  fs.mkdirSync(trashDir, { recursive: true });
  const name = path.basename(absPath, '.md');
  const stamp = timestampSuffix();
  const target = firstFreePath((n) => path.join(trashDir, `${name} (${stamp}${n ? `-${n}` : ''}).md`));
  withRetry(() => fs.renameSync(absPath, target));
  return target;
}

/** Tên file an toàn trên Windows/macOS và không phá cú pháp link [[...]] của Obsidian. */
export function sanitizeFileName(title) {
  let name = String(title ?? '')
    .normalize('NFC')
    .replace(/[\\/:*?"<>|#^[\]\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[.\s]+|[.\s]+$/g, '');
  if (name.length > 120) name = name.slice(0, 120).trim();
  if (!name) name = 'Untitled';
  if (WINDOWS_RESERVED.test(name)) name = `${name}_`;
  return name;
}

/** Chuyển file sang đường dẫn mới trong thư mục sync (tạo thư mục đích nếu chưa có). */
export function moveFile(fromAbs, toAbs) {
  fs.mkdirSync(path.dirname(toAbs), { recursive: true });
  withRetry(() => fs.renameSync(fromAbs, toAbs));
}

/** Xoá các thư mục con đã trống sau khi chuyển file (không đụng tới thư mục gốc và thư mục ẩn). */
export function pruneEmptyDirs(root) {
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) visit(path.join(dir, entry.name));
    }
    if (dir !== root && fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
  };
  if (fs.existsSync(root)) visit(root);
}

/** Chọn đường dẫn tương đối chưa bị dùng; so sánh không phân biệt hoa thường vì Windows/macOS như vậy. */
export function uniqueRelPath(baseName, takenLowercase, folder = '') {
  const prefix = folder ? `${folder}/` : '';
  for (let counter = 1; ; counter += 1) {
    const candidate = `${prefix}${counter === 1 ? `${baseName}.md` : `${baseName} (${counter}).md`}`;
    if (!takenLowercase.has(candidate.toLowerCase())) {
      takenLowercase.add(candidate.toLowerCase());
      return candidate;
    }
  }
}

/** Chép file qua file tạm rồi rename, giống writeTextAtomic, để Obsidian không đọc phải ảnh chép dở. */
export function copyFileAtomic(fromAbs, toAbs) {
  fs.mkdirSync(path.dirname(toAbs), { recursive: true });
  const tmpPath = path.join(path.dirname(toAbs), `.${path.basename(toAbs)}.${process.pid}.tmp`);
  fs.copyFileSync(fromAbs, tmpPath);
  try {
    withRetry(() => fs.renameSync(tmpPath, toAbs));
  } catch (error) {
    fs.rmSync(tmpPath, { force: true });
    throw error;
  }
}

/**
 * Chuyển file hoặc thư mục bất kỳ trong thư mục sync vào .trash, giữ cấu trúc thư mục cha
 * (ví dụ _attachments/Howl/cover.webp -> .trash/_attachments/Howl/cover (20261105-101500).webp).
 */
export function moveEntryToTrash(root, absPath) {
  const relParent = path.relative(root, path.dirname(absPath));
  const trashDir = path.join(root, TRASH_DIR, relParent);
  fs.mkdirSync(trashDir, { recursive: true });
  const isDir = fs.statSync(absPath).isDirectory();
  const ext = isDir ? '' : path.extname(absPath);
  const name = path.basename(absPath, ext);
  const stamp = timestampSuffix();
  const target = firstFreePath((n) => path.join(trashDir, `${name} (${stamp}${n ? `-${n}` : ''})${ext}`));
  withRetry(() => fs.renameSync(absPath, target));
  return target;
}

/** Danh sách file (không đệ quy) trong một thư mục; thư mục chưa có thì trả mảng rỗng. */
export function listFiles(absDir) {
  if (!fs.existsSync(absDir)) return [];
  return fs
    .readdirSync(absDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && !entry.name.startsWith('.'))
    .map((entry) => {
      const absPath = path.join(absDir, entry.name);
      return { name: entry.name, absPath, size: fs.statSync(absPath).size };
    });
}
