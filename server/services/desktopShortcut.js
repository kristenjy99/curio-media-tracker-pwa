import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Thư mục gốc của app (chứa mo-app.bat, assets/). */
export const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const SHORTCUT_NAME = 'Ke sach.lnk';
export const DEFAULT_ICON = path.join(APP_ROOT, 'assets', 'ke-sach.ico');
/** Bản sao biểu tượng tuỳ chỉnh để tao-shortcut-desktop.bat dùng khi tạo lại lối tắt. */
export const CUSTOM_ICON_COPY = path.join(APP_ROOT, 'assets', 'custom-icon.ico');

/**
 * Bọc ảnh PNG thành file .ico (ICO chứa PNG, Windows Vista trở lên đọc được). Ảnh nên là 256×256;
 * kích thước lấy từ phần IHDR của PNG, 256 ghi thành 0 theo chuẩn ICO.
 */
export function pngToIco(png) {
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  const entry = Buffer.alloc(16);
  entry.writeUInt8(width >= 256 ? 0 : width, 0);
  entry.writeUInt8(height >= 256 ? 0 : height, 1);
  entry.writeUInt8(0, 2);
  entry.writeUInt8(0, 3);
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(6 + 16, 12);
  return Buffer.concat([header, entry, png]);
}

const SCRIPT = `
$desktop = [Environment]::GetFolderPath('Desktop')
$path = Join-Path $desktop $env:RT_NAME
$exists = Test-Path $path
if (-not $exists -and $env:RT_CREATE -ne '1') { Write-Output 'missing'; exit 0 }
$link = (New-Object -ComObject WScript.Shell).CreateShortcut($path)
if (-not $exists) {
  $link.TargetPath = $env:RT_TARGET
  $link.WorkingDirectory = $env:RT_WORKDIR
  $link.Description = 'Mo app Ke sach'
}
$link.IconLocation = $env:RT_ICON + ',0'
$link.Save()
try { Start-Process -FilePath 'ie4uinit.exe' -ArgumentList '-show' -WindowStyle Hidden } catch {}
if ($exists) { Write-Output 'updated' } else { Write-Output 'created' }
`;

/**
 * Gán biểu tượng cho lối tắt "Ke sach" trên Desktop (chỉ Windows). create = true thì tạo lối tắt nếu chưa có.
 * Trả { status: 'updated' | 'created' | 'missing' | 'unsupported' | 'error', message? }.
 */
/**
 * Phần biểu tượng/lối tắt chỉ có trên Windows, gom lại thành một adapter để settingsService không
 * phải import module này (nhờ vậy bundle của bản PWA không chứa node:child_process, node:url).
 * Bản PWA truyền desktop = null, xem server/platform/browserContext.js.
 */
export function createDesktopAdapter() {
  return {
    pngToIco,
    /** Bản sao .ico cho tao-shortcut-desktop.bat; null là xoá. Thư mục chỉ đọc thì bỏ qua. */
    async saveIconCopy(ico) {
      try {
        if (ico) fs.writeFileSync(CUSTOM_ICON_COPY, ico);
        else fs.rmSync(CUSTOM_ICON_COPY, { force: true });
      } catch {
        // lối tắt vẫn trỏ tới bản trong thư mục lưu trữ
      }
    },
    updateShortcut: updateDesktopShortcut,
  };
}

export function updateDesktopShortcut(iconPath, { create = false } = {}) {
  if (process.platform !== 'win32') return Promise.resolve({ status: 'unsupported' });
  const icon = iconPath && fs.existsSync(iconPath) ? iconPath : DEFAULT_ICON;
  return new Promise((resolve) => {
    execFile(
      'powershell',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', SCRIPT],
      {
        windowsHide: true,
        timeout: 20_000,
        env: {
          ...process.env,
          RT_NAME: SHORTCUT_NAME,
          RT_ICON: icon,
          RT_TARGET: path.join(APP_ROOT, 'mo-app.bat'),
          RT_WORKDIR: APP_ROOT,
          RT_CREATE: create ? '1' : '0',
        },
      },
      (error, stdout) => {
        if (error) resolve({ status: 'error', message: error.message });
        else resolve({ status: String(stdout).trim().split(/\r?\n/).pop() || 'updated' });
      },
    );
  });
}
