/**
 * Chuẩn bị trước khi mở app (mo-app.bat gọi file này):
 *   - chỉ chạy npm install khi chưa có node_modules hoặc package-lock.json đã đổi;
 *   - chỉ build giao diện khi mã nguồn giao diện đã đổi so với lần build trước.
 * Nhờ vậy những lần mở sau chỉ mất vài giây. Chỉ dùng module có sẵn của Node.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const INSTALL_MARK = path.join(ROOT, 'node_modules', '.rt-install-hash');
const BUILD_MARK = path.join(ROOT, 'client', 'dist', '.rt-build-hash');

function hashFiles(files) {
  const hash = createHash('sha256');
  for (const file of files.sort()) {
    hash.update(path.relative(ROOT, file));
    hash.update(fs.readFileSync(file));
  }
  return hash.digest('hex');
}

function walk(dir, skip = new Set()) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (skip.has(full)) return [];
    return entry.isDirectory() ? walk(full, skip) : [full];
  });
}

const readMark = (file) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim() : null);

function run(label, command, args) {
  console.log(`\n${label}`);
  const result = spawnSync(command, args, { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.status !== 0) {
    console.error(`\n[LỖI] ${label} thất bại (mã ${result.status ?? result.error?.message}).`);
    process.exit(1);
  }
}

// Thư viện native (better-sqlite3) dựng riêng cho từng hệ điều hành và bản Node, nên chép thư mục
// sang máy khác (hoặc nâng cấp Node) cũng phải cài lại.
const runtime = `${process.platform}-${process.arch}-node${process.versions.modules}`;
const installHash = `${runtime}:${hashFiles([path.join(ROOT, 'package.json'), path.join(ROOT, 'package-lock.json')].filter((file) => fs.existsSync(file)))}`;
const previousInstall = readMark(INSTALL_MARK);
if (previousInstall !== installHash) {
  if (previousInstall && !previousInstall.startsWith(`${runtime}:`)) {
    // node_modules mang từ máy khác sang: xoá bản native cũ để npm tải đúng bản cho máy này.
    fs.rmSync(path.join(ROOT, 'node_modules', 'better-sqlite3', 'build'), { recursive: true, force: true });
    run('[1/2] Thư mục được chép từ máy khác, cài lại thư viện cho máy này...', 'npm', ['rebuild', 'better-sqlite3']);
  }
  run('[1/2] Cài thư viện (lần đầu mất khoảng 1–2 phút)...', 'npm', ['install', '--no-audit', '--no-fund']);
  fs.writeFileSync(INSTALL_MARK, installHash);
} else {
  console.log('[1/2] Thư viện đã cài, bỏ qua.');
}

const buildInputs = [
  ...walk(path.join(ROOT, 'client'), new Set([path.join(ROOT, 'client', 'dist')])),
  path.join(ROOT, 'vite.config.js'),
  path.join(ROOT, 'package-lock.json'),
].filter((file) => fs.existsSync(file));
const buildHash = hashFiles(buildInputs);
if (readMark(BUILD_MARK) !== buildHash || !fs.existsSync(path.join(ROOT, 'client', 'dist', 'index.html'))) {
  run('[2/2] Dựng giao diện...', process.execPath, [path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--logLevel', 'warn']);
  fs.writeFileSync(BUILD_MARK, buildHash);
} else {
  console.log('[2/2] Giao diện đã dựng, bỏ qua.');
}
