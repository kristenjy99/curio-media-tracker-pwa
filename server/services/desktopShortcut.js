import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng, encodePng, resizeSquare } from '../utils/pngImage.js';

/** Thư mục gốc của app (chứa mo-app.bat, assets/). */
export const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
/** Tên lối tắt của các bản trước patch 6.2; lối tắt cũ được nhận ra theo đích (mo-app.bat), tên này chỉ để tham khảo. */
export const LEGACY_SHORTCUT_NAME = 'Ke sach.lnk';
export const DEFAULT_ICON = path.join(APP_ROOT, 'assets', 'ke-sach.ico');
/** Bản sao biểu tượng tuỳ chỉnh (giữ cho tương thích với bản cũ của tao-shortcut-desktop.bat). */
export const CUSTOM_ICON_COPY = path.join(APP_ROOT, 'assets', 'custom-icon.ico');
export const ICON_SIZES = [16, 24, 32, 48, 64, 128, 256];

/**
 * Bọc một hoặc nhiều ảnh PNG thành file .ico (mỗi mục là một PNG, Windows Vista trở lên đọc được).
 * Kích thước lấy từ IHDR của từng PNG, 256 ghi thành 0 theo chuẩn ICO.
 */
export function pngToIco(pngs) {
  const list = Array.isArray(pngs) ? pngs : [pngs];
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(list.length, 4);
  let offset = 6 + 16 * list.length;
  const entries = list.map((png) => {
    const width = png.readUInt32BE(16);
    const height = png.readUInt32BE(20);
    const entry = Buffer.alloc(16);
    entry.writeUInt8(width >= 256 ? 0 : width, 0);
    entry.writeUInt8(height >= 256 ? 0 : height, 1);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...list]);
}

/**
 * PNG -> .ico nhiều cỡ (16 đến 256). Explorer chọn đúng cỡ cho Desktop, thanh tác vụ, cửa sổ Explorer;
 * ICO chỉ có một ảnh 256 có thể hiện mờ hoặc trắng ở cỡ nhỏ. PNG không đọc được thì bọc nguyên ảnh như cũ.
 */
export function buildMultiSizeIco(png) {
  const image = decodePng(png);
  if (!image) return pngToIco(png);
  return pngToIco(ICON_SIZES.map((size) => encodePng(resizeSquare(image, size))));
}

/** Tên app -> tên file lối tắt hợp lệ trên Windows (bỏ ký tự cấm, dấu chấm/khoảng trắng cuối, tên thiết bị dành riêng). */
export function shortcutFileName(appName) {
  let name = String(appName ?? '')
    .normalize('NFC')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '');
  if (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(name)) name = `${name} app`;
  if (!name) name = 'Media Tracker';
  return `${name.slice(0, 60).trim()}.lnk`;
}

/**
 * Thư mục chứa file .ico cho lối tắt: nằm trên ổ của máy (%LOCALAPPDATA%), không nằm trong thư mục lưu trữ
 * hay thư mục dự án, vì hai nơi này có thể ở Google Drive / OneDrive, nơi Explorer thường không đọc được icon
 * (file chỉ có trên mây, ổ ảo chưa gắn lúc đăng nhập) và lối tắt hiện biểu tượng trắng.
 */
export function defaultIconDir() {
  const base = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  return path.join(base, 'MediaTracker', 'icons');
}

/**
 * Ghi file .ico vào iconDir với tên theo nội dung (đổi biểu tượng là đổi tên file, nên Windows không dùng lại
 * ảnh cũ trong bộ nhớ đệm icon), xoá các file icon cũ do app tạo. Trả đường dẫn file.
 */
export function writeLocalIcon(ico, iconDir = defaultIconDir()) {
  fs.mkdirSync(iconDir, { recursive: true });
  const name = `app-${createHash('sha1').update(ico).digest('hex').slice(0, 12)}.ico`;
  const target = path.join(iconDir, name);
  if (!fs.existsSync(target)) fs.writeFileSync(target, ico);
  for (const entry of fs.readdirSync(iconDir)) {
    if (entry !== name && /^app-[0-9a-f]{12}\.ico$/.test(entry)) fs.rmSync(path.join(iconDir, entry), { force: true });
  }
  return target;
}

// Tìm lối tắt của app trên Desktop theo đích (mo-app.bat của đúng thư mục này), nên lối tắt cũ "Ke sach.lnk"
// hay lối tắt người dùng đã tự đổi tên đều được nhận ra. Có rồi thì đổi tên theo tên app và gán biểu tượng;
// chưa có thì chỉ tạo khi RT_CREATE = 1. Chỉ ghi lại khi có gì khác, để không làm Explorer nạp lại icon vô ích.
const SCRIPT = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$shell = New-Object -ComObject WScript.Shell
$desktop = [Environment]::GetFolderPath('Desktop')
$wanted = Join-Path $desktop $env:RT_NAME
$target = [IO.Path]::GetFullPath($env:RT_TARGET)
$found = $null
foreach ($file in Get-ChildItem -LiteralPath $desktop -Filter '*.lnk' -File -ErrorAction SilentlyContinue) {
  try {
    $candidate = $shell.CreateShortcut($file.FullName).TargetPath
    if ($candidate -and ([IO.Path]::GetFullPath($candidate) -ieq $target)) { $found = $file.FullName; break }
  } catch {}
}
$status = 'unchanged'
if (-not $found) {
  if ($env:RT_CREATE -ne '1') { Write-Output 'missing'; exit 0 }
  if (Test-Path -LiteralPath $wanted) { Write-Output ('conflict|' + $wanted); exit 0 }
  $found = $wanted
  $status = 'created'
} elseif ($found -ine $wanted) {
  if ((Test-Path -LiteralPath $wanted) -and ($found -ine $wanted)) {
    Write-Output ('conflict|' + $wanted); exit 0
  }
  Move-Item -LiteralPath $found -Destination $wanted
  $found = $wanted
  $status = 'renamed'
}
$link = $shell.CreateShortcut($found)
$icon = $env:RT_ICON + ',0'
$dirty = $status -eq 'created'
if ($status -eq 'created') {
  $link.TargetPath = $env:RT_TARGET
  $link.WorkingDirectory = $env:RT_WORKDIR
  $link.Description = $env:RT_DESCRIPTION
}
if ($link.IconLocation -ine $icon) { $link.IconLocation = $icon; $dirty = $true; if ($status -eq 'unchanged') { $status = 'updated' } }
if ($dirty) { $link.Save() }
if ($status -ne 'unchanged') {
  try { Start-Process -FilePath 'ie4uinit.exe' -ArgumentList '-show' -WindowStyle Hidden } catch {}
}
Write-Output ($status + '|' + $found)
`;

function runPowerShell(script, env) {
  return new Promise((resolve) => {
    execFile(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { windowsHide: true, timeout: 30_000, encoding: 'utf8', env: { ...process.env, ...env } },
      (error, stdout, stderr) => {
        if (error) resolve({ ok: false, message: String(stderr || error.message).trim() });
        else resolve({ ok: true, output: String(stdout).trim().split(/\r?\n/).pop() ?? '' });
      },
    );
  });
}

/**
 * Đồng bộ lối tắt Desktop với tên app và biểu tượng hiện tại (chỉ Windows).
 * Trả { status: 'created' | 'renamed' | 'updated' | 'unchanged' | 'missing' | 'conflict' | 'unsupported' | 'error', path?, message? }.
 */
export async function syncDesktopShortcut({ appName, iconPng = null, create = false }, { platform = process.platform, iconDir = defaultIconDir(), run = runPowerShell } = {}) {
  if (platform !== 'win32') return { status: 'unsupported' };
  let iconPath;
  try {
    const ico = iconPng ? buildMultiSizeIco(iconPng) : fs.readFileSync(DEFAULT_ICON);
    iconPath = writeLocalIcon(ico, iconDir);
  } catch (error) {
    return { status: 'error', message: `Không ghi được file biểu tượng: ${error.message}` };
  }
  const result = await run(SCRIPT, {
    RT_NAME: shortcutFileName(appName),
    RT_ICON: iconPath,
    RT_TARGET: path.join(APP_ROOT, 'mo-app.bat'),
    RT_WORKDIR: APP_ROOT,
    RT_DESCRIPTION: `Mở ${String(appName ?? '').trim() || 'Media Tracker'}`,
    RT_CREATE: create ? '1' : '0',
  });
  if (!result.ok) return { status: 'error', message: result.message };
  const [status, shortcutPath] = result.output.split('|');
  return { status: status || 'error', path: shortcutPath || undefined, icon: iconPath };
}

/**
 * Phần biểu tượng/lối tắt chỉ có trên Windows, gom lại thành một adapter để settingsService không
 * phải import module này (nhờ vậy bundle của bản PWA không chứa node:child_process, node:url).
 * Bản PWA truyền desktop = null, xem server/platform/browserContext.js.
 * Các lần đồng bộ lối tắt chạy nối tiếp nhau (đổi tên app liên tục không làm hai PowerShell cùng đổi một file).
 */
export function createDesktopAdapter(options = {}) {
  let queue = Promise.resolve();
  return {
    pngToIco: buildMultiSizeIco,
    /** Bản sao .ico cho bản cũ của tao-shortcut-desktop.bat; null là xoá. Thư mục chỉ đọc thì bỏ qua. */
    async saveIconCopy(ico) {
      try {
        if (ico) fs.writeFileSync(CUSTOM_ICON_COPY, ico);
        else fs.rmSync(CUSTOM_ICON_COPY, { force: true });
      } catch {
        // không bắt buộc
      }
    },
    syncShortcut(input) {
      const next = queue.then(() => syncDesktopShortcut(input, options));
      queue = next.catch(() => {});
      return next;
    },
  };
}
