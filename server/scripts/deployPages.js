import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

/**
 * Triển khai bản PWA lên GitHub Pages, tự động hoá các bước trong docs/TRIEN-KHAI-GITHUB-PAGES.md.
 * Chạy qua trien-khai-pages.bat (Windows) hoặc: node server/scripts/deployPages.js [tuỳ chọn]
 *
 * Tự làm: kiểm git/gh, đăng nhập GitHub, npm test + verify, commit, tạo repo public, bật Pages kiểu
 * GitHub Actions, đặt variable VITE_GOOGLE_CLIENT_ID, push, chờ workflow xong, in địa chỉ app.
 * KHÔNG tự làm được: tạo OAuth Client loại Web trên Google Cloud (Google không có API công khai cho
 * việc này với tài khoản cá nhân) và kiểm trên điện thoại. Hai phần đó script mở trang và chờ người dùng.
 *
 * Tuỳ chọn:
 *   --repo <tên>        tên repo, mặc định hỏi (gợi ý media-tracker)
 *   --client-id <id>    Client ID Google, bỏ qua phần hỏi Google Cloud
 *   --skip-google       không làm phần Google Cloud lần này
 *   --skip-tests        không chạy npm test / npm run verify
 *   --dry-run           chỉ in các lệnh có thay đổi, không chạy
 * Chạy lại nhiều lần được: bước nào đã xong thì bỏ qua.
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const DRY = flag('--dry-run');
const isWin = process.platform === 'win32';
const CLIENT_ID_PATTERN = /^[\w-]+\.apps\.googleusercontent\.com$/;

class StopError extends Error {}

/** git và gh là file .exe nên chạy không qua shell (giữ nguyên tham số có dấu cách); npm là .cmd nên cần shell. */
function run(cmd, cmdArgs, { capture = false, allowFail = false, mutate = true } = {}) {
  const shown = [cmd, ...cmdArgs].join(' ');
  if (DRY && mutate) {
    console.log(`  [dry-run] ${shown}`);
    return { ok: true, out: '', err: '' };
  }
  const result = spawnSync(cmd, cmdArgs, {
    cwd: root,
    shell: isWin && cmd === 'npm',
    encoding: 'utf8',
    stdio: capture ? ['inherit', 'pipe', 'pipe'] : 'inherit',
  });
  const ok = result.status === 0;
  const out = (result.stdout ?? '').trim();
  const err = (result.stderr ?? '').trim();
  if (!ok && !allowFail) throw new StopError(`Lệnh bị lỗi: ${shown}${capture ? `\n${err || out}` : ''}`);
  return { ok, out, err };
}

const check = (cmd, cmdArgs) => run(cmd, cmdArgs, { capture: true, allowFail: true, mutate: false });

let stepNo = 0;
const step = (title) => console.log(`\n=== Bước ${++stepNo}: ${title} ===`);

function openUrl(url) {
  console.log(`  Mở: ${url}`);
  if (DRY) return;
  if (isWin) spawnSync('cmd', ['/c', 'start', '', url], { stdio: 'ignore' });
  else spawnSync(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], { stdio: 'ignore' });
}

async function main() {
  // Mở readline riêng cho từng câu hỏi rồi đóng ngay. Nếu giữ một readline suốt script, nó chiếm
  // bàn phím và nuốt phím Enter mà các lệnh con (gh auth login: "Press Enter to open...") đang chờ.
  const ask = async (question, fallback = '') => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    try {
      const answer = (await rl.question(fallback ? `${question} [${fallback}]: ` : `${question}: `)).trim();
      return answer || fallback;
    } finally {
      rl.close();
    }
  };

  {
    step('Kiểm tra công cụ');
    if (!check('git', ['--version']).ok) throw new StopError('Chưa có Git. Cài Git for Windows ở https://git-scm.com/download/win (để mặc định), mở lại cửa sổ rồi chạy lại script.');
    if (!check('gh', ['--version']).ok) throw new StopError('Chưa có GitHub CLI. Cài bằng lệnh: winget install --id GitHub.cli  (hoặc tải ở https://cli.github.com), mở lại cửa sổ rồi chạy lại script.');
    console.log('  git và gh: có');

    step('Đăng nhập GitHub');
    const status = check('gh', ['auth', 'status']);
    if (!status.ok) {
      console.log('  Trình duyệt sẽ mở để đăng nhập. Chọn GitHub.com, HTTPS, đăng nhập bằng trình duyệt, dán mã được in ra.');
      run('gh', ['auth', 'login', '--hostname', 'github.com', '--git-protocol', 'https', '--web', '--scopes', 'workflow']);
    } else if (!/workflow/.test(status.out + status.err)) {
      // Đẩy file trong .github/workflows cần quyền "workflow"; đăng nhập mặc định của gh không có.
      console.log('  Cần thêm quyền "workflow" để đẩy file workflow lên GitHub.');
      run('gh', ['auth', 'refresh', '--hostname', 'github.com', '--scopes', 'workflow']);
    }
    run('gh', ['auth', 'setup-git']);
    const login = DRY ? check('gh', ['api', 'user', '--jq', '.login']).out || 'user' : run('gh', ['api', 'user', '--jq', '.login'], { capture: true, mutate: false }).out;
    console.log(`  Tài khoản: ${login}`);

    const repo = option('--repo') || (await ask('Tên repo', 'media-tracker'));
    if (!/^[A-Za-z0-9._-]+$/.test(repo)) throw new StopError('Tên repo chỉ gồm chữ không dấu, số, dấu . _ -');
    const full = `${login}/${repo}`;
    const host = `https://${login.toLowerCase()}.github.io`;
    const appUrl = repo.toLowerCase() === `${login.toLowerCase()}.github.io` ? `${host}/` : `${host}/${repo}/`;

    if (flag('--skip-tests')) {
      console.log('\n(Bỏ qua npm test / verify theo --skip-tests)');
    } else {
      step('Chạy npm test và npm run verify (vài phút)');
      run('npm', ['test'], { mutate: false });
      run('npm', ['run', 'verify'], { mutate: false });
    }

    step('Commit mã nguồn');
    if (!fs.existsSync(path.join(root, '.git'))) run('git', ['init', '-q', '-b', 'main']);
    if (!check('git', ['config', 'user.name']).ok) {
      const id = check('gh', ['api', 'user', '--jq', '.id']).out;
      run('git', ['config', 'user.name', login]);
      run('git', ['config', 'user.email', `${id}+${login}@users.noreply.github.com`]);
    }
    run('git', ['add', '-A']);
    const staged = check('git', ['diff', '--cached', '--name-only']).out.split(/\r?\n/).filter(Boolean);
    const forbidden = staged.filter(
      (file) =>
        /^(node_modules|data)\//.test(file) || /^client\/dist(-pwa)?\//.test(file) || /\.sqlite(-\w+)?$/.test(file) || /(^|\/)\.env$/.test(file),
    );
    if (forbidden.length) {
      run('git', ['reset', '-q']);
      throw new StopError(`Có file không được đưa lên GitHub (dữ liệu hoặc file build):\n  ${forbidden.slice(0, 10).join('\n  ')}\nKiểm lại .gitignore. Không có gì bị commit.`);
    }
    if (staged.length) {
      const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
      run('git', ['commit', '-q', '-m', `Trien khai ${stamp}`]);
      console.log(`  Đã commit ${staged.length} file`);
    } else console.log('  Không có thay đổi mới');
    run('git', ['branch', '-M', 'main']);

    step(`Repo GitHub ${full} (public)`);
    if (check('gh', ['repo', 'view', full]).ok) console.log('  Repo đã có');
    else run('gh', ['repo', 'create', full, '--public']);
    const remoteUrl = `https://github.com/${full}.git`;
    const origin = check('git', ['remote', 'get-url', 'origin']);
    if (!origin.ok) run('git', ['remote', 'add', 'origin', remoteUrl]);
    else if (origin.out !== remoteUrl) {
      const answer = await ask(`origin đang trỏ tới ${origin.out}. Đổi sang ${remoteUrl}? (c/k)`, 'c');
      if (answer.toLowerCase() !== 'c') throw new StopError('Dừng theo lựa chọn, không đổi origin.');
      run('git', ['remote', 'set-url', 'origin', remoteUrl]);
    }

    step('Bật GitHub Pages kiểu GitHub Actions');
    const pages = check('gh', ['api', `repos/${full}/pages`]);
    if (!pages.ok) run('gh', ['api', '-X', 'POST', `repos/${full}/pages`, '-f', 'build_type=workflow'], { capture: true });
    else if (!/"build_type"\s*:\s*"workflow"/.test(pages.out)) run('gh', ['api', '-X', 'PUT', `repos/${full}/pages`, '-f', 'build_type=workflow'], { capture: true });
    else console.log('  Pages đã bật');

    step('Client ID Google (OAuth)');
    let clientId = option('--client-id') || '';
    const existing = check('gh', ['variable', 'get', 'VITE_GOOGLE_CLIENT_ID', '-R', full]);
    if (!clientId && existing.ok && existing.out) {
      console.log(`  Đã có trên GitHub: ${existing.out}`);
    } else if (!clientId && flag('--skip-google')) {
      console.log('  Bỏ qua theo --skip-google. Chạy lại script không có cờ này khi muốn làm.');
    } else if (!clientId) {
      clientId = await googleCloudWizard(ask, host, appUrl);
    }
    if (clientId) {
      if (!CLIENT_ID_PATTERN.test(clientId)) throw new StopError(`"${clientId}" không giống Client ID (phải kết thúc bằng .apps.googleusercontent.com).`);
      run('gh', ['variable', 'set', 'VITE_GOOGLE_CLIENT_ID', '-R', full, '--body', clientId]);
      console.log('  Đã đặt variable VITE_GOOGLE_CLIENT_ID');
    }

    step('Đẩy mã nguồn và chờ GitHub dựng app (3–5 phút)');
    const since = Date.now() - 60_000;
    run('git', ['push', '-u', 'origin', 'main']);
    let runId = DRY ? 'DRY' : await findRun(full, since, 8);
    if (!runId) {
      // Không có commit mới thì push không kích hoạt workflow; chạy tay.
      run('gh', ['workflow', 'run', 'pages.yml', '-R', full, '--ref', 'main']);
      runId = await findRun(full, Date.now() - 10_000, 15);
    }
    if (!runId) throw new StopError(`Không thấy lần chạy workflow. Mở https://github.com/${full}/actions để xem.`);
    if (!DRY) {
      const watched = run('gh', ['run', 'watch', String(runId), '-R', full, '--exit-status'], { allowFail: true, mutate: false });
      if (!watched.ok) throw new StopError(`Workflow lỗi. Xem chi tiết: https://github.com/${full}/actions/runs/${runId}`);
    }

    console.log(`\n=== XONG ===\nĐịa chỉ app: ${appUrl}`);
    console.log('GitHub có thể cần thêm khoảng 1 phút trước khi địa chỉ mở được lần đầu.');
    console.log('\nViệc còn lại làm trên điện thoại Android, theo mục 6 của docs/TRIEN-KHAI-GITHUB-PAGES.md:');
    console.log('  mở địa chỉ trên bằng Chrome → ⋮ → Cài đặt ứng dụng, rồi kiểm 7 mục và ghi đạt/không đạt.');
    openUrl(appUrl);
  }
}

async function findRun(full, sinceMs, tries) {
  for (let i = 0; i < tries; i += 1) {
    await sleep(3000);
    const list = check('gh', ['run', 'list', '-R', full, '--workflow', 'pages.yml', '--limit', '1', '--json', 'databaseId,createdAt']);
    if (list.ok && list.out) {
      const [latest] = JSON.parse(list.out);
      if (latest && Date.parse(latest.createdAt) >= sinceMs) return latest.databaseId;
    }
  }
  return null;
}

async function googleCloudWizard(ask, host, appUrl) {
  console.log(`
Phần này Google không cho làm bằng lệnh, script mở từng trang và chờ bạn bấm. Dùng đúng Gmail sẽ chứa file đồng bộ.
Nhấn Enter để mở trang của từng bước. Muốn bỏ qua cả phần Google lúc này: gõ  bo  rồi Enter.`);
  const pages = [
    ['Tạo project: đặt tên media-tracker → Create. Xong thì chọn project đó ở thanh trên cùng.', 'https://console.cloud.google.com/projectcreate'],
    ['Bật Google Drive API: bấm Enable.', 'https://console.cloud.google.com/apis/library/drive.googleapis.com'],
    ['Màn hình đồng ý OAuth: Get started → tên app Media Tracker, email hỗ trợ là Gmail của bạn → Audience: External → email liên hệ → Create.', 'https://console.cloud.google.com/auth/overview'],
    ['Audience → Test users → Add users → nhập Gmail của bạn → Save. Giữ trạng thái Testing.', 'https://console.cloud.google.com/auth/audience'],
    ['Data access → Add or remove scopes → tick .../auth/drive.file → Update → Save.', 'https://console.cloud.google.com/auth/scopes'],
    [
      `Create client → Application type: Web application.\n    Authorized JavaScript origins:  ${host}\n    Authorized redirect URIs:       ${appUrl}\n    → Create. Bỏ qua client secret nếu có hiện.`,
      'https://console.cloud.google.com/auth/clients/create',
    ],
  ];
  for (const [index, [text, url]] of pages.entries()) {
    const answer = await ask(`\n[Google ${index + 1}/${pages.length}] ${text}\n  Enter để mở trang`);
    if (answer.toLowerCase() === 'bo') return '';
    openUrl(url);
  }
  return ask('\nDán Client ID (dạng ...apps.googleusercontent.com), hoặc Enter để làm sau');
}

main().catch((error) => {
  console.error(`\nDỪNG: ${error.message}`);
  if (!(error instanceof StopError)) console.error(error.stack);
  console.error('Sửa xong thì chạy lại script; các bước đã xong sẽ được bỏ qua.');
  process.exitCode = 1;
});
