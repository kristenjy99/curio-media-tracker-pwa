import './config/loadEnv.js';
import { spawn } from 'node:child_process';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { ensureStorageLayout, getStoragePaths } from './config/storage.js';
import { openDatabase } from './db/connection.js';

const storagePaths = ensureStorageLayout(getStoragePaths());
const { db, migration } = openDatabase(storagePaths.dbFile);
const runtime = createApp({ db, storagePaths });

const server = runtime.app.listen(env.port, env.host, () => {
  console.log(`[reading-tracker] API:      http://${env.host}:${env.port}/api`);
  console.log(`[reading-tracker] Storage:  ${storagePaths.root}`);
  console.log(`[reading-tracker] Database: ${storagePaths.dbFile} (schema v${migration.to}, journal ${env.journalMode})`);
  if (migration.applied.length > 0) {
    console.log(`[reading-tracker] Migrations applied: ${migration.applied.join(', ')}`);
  }
  if (process.env.OPEN_BROWSER === '1') openBrowser(`http://${env.host}:${env.port}/`);
  // Windows: đưa lối tắt Desktop (nếu có) về đúng tên app và biểu tượng hiện tại, chạy nền.
  if (process.platform === 'win32') {
    runtime.context.services.settings
      .syncDesktopShortcut()
      .then((shortcut) => {
        if (shortcut?.status === 'renamed' || shortcut?.status === 'updated') console.log(`[reading-tracker] Lối tắt Desktop: ${shortcut.path}`);
        if (shortcut?.status === 'error') console.warn(`[reading-tracker] Không cập nhật được lối tắt Desktop: ${shortcut.message}`);
      })
      .catch((error) => console.warn(`[reading-tracker] Không cập nhật được lối tắt Desktop: ${error.message}`));
  }
});

/** Mở trình duyệt mặc định sau khi server đã nghe cổng (dùng bởi mo-app.bat). */
function openBrowser(url) {
  const [command, args] =
    process.platform === 'win32'
      ? ['cmd', ['/c', 'start', '', url]]
      : process.platform === 'darwin'
        ? ['open', [url]]
        : ['xdg-open', [url]];
  try {
    spawn(command, args, { stdio: 'ignore', detached: true, windowsHide: true }).unref();
    console.log(`[reading-tracker] Đã mở ${url}`);
  } catch {
    console.log(`[reading-tracker] Mở trình duyệt và vào ${url}`);
  }
}

server.on('error', (error) => {
  console.error(`[reading-tracker] Không khởi động được server: ${error.message}`);
  runtime.close();
  process.exit(1);
});

function shutdown(signal) {
  console.log(`[reading-tracker] Nhận ${signal}, đang đóng server...`);
  server.close(() => {
    runtime.close();
    process.exit(0);
  });
  server.closeAllConnections?.();
  setTimeout(() => {
    runtime.close();
    process.exit(1);
  }, 5000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
