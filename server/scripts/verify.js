/**
 * Nghiệm thu tự động toàn bộ Phase 1 bằng một lệnh:
 *   npm run verify
 *
 * Trình tự: unit/integration test -> tạo thư mục tạm (storage, config, vault Obsidian giả) -> migrate -> seed
 * -> khởi động server trên cổng riêng -> chạy kịch bản acceptance Phase 1 + 2 -> tắt server -> xoá thư mục tạm.
 * Không đụng vào ./data, ~/.reading-tracker, vault Obsidian thật hay server đang chạy của bạn.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = String(Number(process.env.VERIFY_PORT) || 4399);
const BASE = `http://127.0.0.1:${PORT}/api`;
const sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reading-tracker-verify-'));
const storageDir = path.join(sandboxDir, 'storage');
const configDir = path.join(sandboxDir, 'config');

// Thư mục storage được trỏ qua file config tạm (không qua READING_TRACKER_STORAGE) để kiểm tra được
// chức năng đổi storage. READING_TRACKER_STORAGE đặt rỗng để .env của bạn không ghi đè được.
fs.mkdirSync(configDir, { recursive: true });
fs.writeFileSync(path.join(configDir, 'config.json'), JSON.stringify({ storage_path: storageDir }, null, 2));

const childEnv = {
  ...process.env,
  READING_TRACKER_STORAGE: '',
  READING_TRACKER_CONFIG_DIR: configDir,
  PORT,
  HOST: '127.0.0.1',
  SQLITE_JOURNAL_MODE: 'DELETE',
};

function run(label, args, { env = childEnv } = {}) {
  console.log(`\n=== ${label} ===`);
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { cwd: ROOT, env, stdio: 'inherit' });
    child.on('exit', (code) => resolve(code ?? 1));
  });
}

async function waitForHealth(timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) return true;
    } catch {
      // server chưa sẵn sàng
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

let server;
const outcome = [];

async function main() {
  const testFiles = fs
    .readdirSync(path.join(ROOT, 'server', 'tests'))
    .filter((file) => file.endsWith('.test.js'))
    .map((file) => path.join('server', 'tests', file));
  const testCode = await run('1/5 Unit + integration test (DB in-memory)', ['--test', ...testFiles], {
    env: { ...process.env, NODE_ENV: 'test' },
  });
  outcome.push(['Unit + integration test', testCode === 0]);

  const viteBin = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
  const buildCode = await run('2/5 Build giao diện', [viteBin, 'build', '--logLevel', 'warn'], { env: process.env });
  if (buildCode === 0) fs.rmSync(path.join(ROOT, 'client', 'dist', '.rt-build-hash'), { force: true });
  outcome.push(['Build giao diện', buildCode === 0]);

  const migrateCode = await run('3/5 Migrate + seed vào thư mục tạm', ['server/scripts/migrate.js']);
  const seedCode = migrateCode === 0 ? await run('    seed', ['server/scripts/seed.js']) : 1;
  outcome.push(['Migrate + seed', migrateCode === 0 && seedCode === 0]);
  if (migrateCode !== 0 || seedCode !== 0) return;

  console.log(`\n=== 4/5 Khởi động server tại ${BASE} ===`);
  server = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] });
  let serverLog = '';
  server.stdout.on('data', (chunk) => (serverLog += chunk));
  server.stderr.on('data', (chunk) => (serverLog += chunk));
  const healthy = await waitForHealth();
  outcome.push(['Khởi động server', healthy]);
  if (!healthy) {
    console.error(`Server không phản hồi /health sau 15 giây. Log:\n${serverLog}`);
    return;
  }
  console.log(serverLog.trim());

  const checkCode = await run('5/5 Kịch bản acceptance qua HTTP', ['server/scripts/acceptance.js', '--base', BASE, '--sandbox', sandboxDir]);
  outcome.push(['Acceptance qua HTTP', checkCode === 0]);
}

try {
  await main();
} finally {
  if (server && server.exitCode === null) {
    server.kill('SIGTERM');
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        server.kill('SIGKILL');
        resolve();
      }, 5000);
      server.on('exit', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
  fs.rmSync(sandboxDir, { recursive: true, force: true });
}

console.log('\n=== TỔNG KẾT ===');
for (const [name, ok] of outcome) console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`);
const allPassed = outcome.length === 5 && outcome.every(([, ok]) => ok);
console.log(allPassed ? '\nPhase 1 → 5 ĐẠT nghiệm thu.' : '\nCHƯA ĐẠT, xem chi tiết lỗi ở trên.');
process.exit(allPassed ? 0 : 1);
