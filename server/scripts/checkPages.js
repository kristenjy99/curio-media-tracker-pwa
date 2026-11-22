import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

/**
 * Kiểm tra và tự sửa bản PWA trên GitHub Pages (chạy qua kiem-tra-pages.bat hoặc node server/scripts/checkPages.js).
 *
 * Đi lần lượt: công cụ → đăng nhập GitHub → git trên máy → repo trên GitHub (có, public, đúng nhánh)
 * → origin → mã nguồn trên GitHub khớp máy → Pages bật kiểu GitHub Actions → Client ID Google
 * → lần dựng app gần nhất → địa chỉ app mở được. Bước nào sai thì sửa; việc không hoàn tác được
 * (đổi repo sang public, ghi đè lịch sử trên GitHub) phải hỏi trước. Chạy lại bao nhiêu lần cũng được.
 *
 * Tuỳ chọn:
 *   --repo <tên>   tên repo (mặc định lấy từ origin, nếu không có thì hỏi, gợi ý curio-media-tracker-pwa)
 *   --chi-kiem     chỉ kiểm tra và báo cáo, không sửa gì
 *   --yes          tự đồng ý mọi câu hỏi (kể cả việc không hoàn tác được)
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const REPORT_ONLY = flag('--chi-kiem');
const YES = flag('--yes');
const DEFAULT_REPO = 'curio-media-tracker-pwa';
const CLIENT_ID_PATTERN = /^[\w-]+\.apps\.googleusercontent\.com$/;
// File GitHub tự tạo khi tạo repo có tích sẵn README/.gitignore/license: ghi đè được mà không mất gì của người dùng.
const STARTER_FILES = /^(readme(\.md)?|license(\.md|\.txt)?|\.gitignore)$/i;

class StopError extends Error {}

function exec(cmd, cmdArgs, { capture = true, allowFail = true } = {}) {
  const result = spawnSync(cmd, cmdArgs, { cwd: root, encoding: 'utf8', stdio: capture ? ['inherit', 'pipe', 'pipe'] : 'inherit' });
  const ok = result.status === 0;
  const out = (result.stdout ?? '').trim();
  const err = (result.stderr ?? result.error?.message ?? '').trim();
  if (!ok && !allowFail) throw new StopError(`Lệnh bị lỗi: ${[cmd, ...cmdArgs].join(' ')}\n${err || out}`);
  return { ok, out, err };
}
const check = (cmd, cmdArgs) => exec(cmd, cmdArgs);
/** Lệnh có thay đổi: hiện trực tiếp ra cửa sổ, lỗi thì dừng. */
const change = (cmd, cmdArgs) => exec(cmd, cmdArgs, { capture: false, allowFail: false });
const changeQuiet = (cmd, cmdArgs) => exec(cmd, cmdArgs, { allowFail: false });

const results = [];
let current = null;
// Mỗi mục đếm số lỗi còn mở: phát hiện lỗi +1, sửa xong -1. Hết mục mà còn lỗi thì là CÒN LỖI.
function section(title) {
  current = { title, open: 0, fixedCount: 0, warned: false, notes: [] };
  results.push(current);
  console.log(`\n=== ${results.length}. ${title} ===`);
}
const ok = (text) => console.log(`  [OK]   ${text}`);
const info = (text) => console.log(`         ${text}`);
function bad(text) {
  console.log(`  [LỖI]  ${text}`);
  current.open += 1;
  current.notes.push(text);
}
function fixed(text) {
  console.log(`  [SỬA]  ${text}`);
  current.open = Math.max(0, current.open - 1);
  current.fixedCount += 1;
  current.notes.push(text);
}
function warn(text) {
  console.log(`  [CHÚ Ý] ${text}`);
  current.warned = true;
  current.notes.push(text);
}
const stateOf = (entry) => (entry.open ? 'bad' : entry.fixedCount ? 'fixed' : entry.warned ? 'warn' : 'ok');
/** Báo lỗi `text`; trả true nếu được sửa (--chi-kiem thì không sửa). Việc nguy hiểm còn phải hỏi qua confirm. */
function canFix(text) {
  bad(REPORT_ONLY ? `${text} (chưa sửa vì chạy với --chi-kiem)` : text);
  return !REPORT_ONLY;
}

async function ask(question, fallback = '') {
  if (YES && fallback) return fallback;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question(fallback ? `  ${question} [${fallback}]: ` : `  ${question}: `)).trim();
    return answer || fallback;
  } finally {
    rl.close();
  }
}
async function confirm(question) {
  if (YES) return true;
  return /^(c|co|có|y|yes)$/i.test(await ask(`${question} (c/k)`, 'k'));
}

function readEnvClientId() {
  try {
    const line = fs
      .readFileSync(path.join(root, '.env'), 'utf8')
      .split(/\r?\n/)
      .find((entry) => entry.trim().startsWith('VITE_GOOGLE_CLIENT_ID='));
    const value = line?.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '');
    return value && CLIENT_ID_PATTERN.test(value) ? value : null;
  } catch {
    return null;
  }
}

function json(result) {
  try {
    return result.ok && result.out ? JSON.parse(result.out) : null;
  } catch {
    return null;
  }
}

async function main() {
  console.log(`Kiểm tra bản điện thoại (GitHub Pages)${REPORT_ONLY ? ' — chỉ kiểm, không sửa' : ''}\nThư mục: ${root}`);

  section('Công cụ');
  if (!check('git', ['--version']).ok) throw new StopError('Chưa có Git. Cài ở https://git-scm.com/download/win rồi mở lại cửa sổ.');
  if (!check('gh', ['--version']).ok) throw new StopError('Chưa có GitHub CLI. Cài bằng: winget install --id GitHub.cli rồi mở lại cửa sổ.');
  ok('git và gh đã cài');

  section('Đăng nhập GitHub');
  let status = check('gh', ['auth', 'status']);
  if (!status.ok) {
    if (!canFix('Chưa đăng nhập GitHub CLI')) throw new StopError('Cần đăng nhập để kiểm tiếp.');
    info('Trình duyệt sẽ mở: chọn GitHub.com, HTTPS, đăng nhập bằng trình duyệt, dán mã được in ra.');
    change('gh', ['auth', 'login', '--hostname', 'github.com', '--git-protocol', 'https', '--web', '--scopes', 'workflow']);
    fixed('Đã đăng nhập');
    status = check('gh', ['auth', 'status']);
  }
  if (!/workflow/.test(status.out + status.err)) {
    if (canFix('Thiếu quyền "workflow" (cần để đẩy file .github/workflows)')) {
      change('gh', ['auth', 'refresh', '--hostname', 'github.com', '--scopes', 'workflow']);
      fixed('Đã thêm quyền "workflow"');
    }
  }
  const login = check('gh', ['api', 'user', '--jq', '.login']).out;
  if (!login) throw new StopError('Không đọc được tên tài khoản GitHub. Chạy: gh auth login');
  if (!REPORT_ONLY) check('gh', ['auth', 'setup-git']);
  ok(`Đăng nhập: ${login}`);

  section('Git trên máy');
  if (!fs.existsSync(path.join(root, '.git'))) throw new StopError('Thư mục này chưa phải repo git. Chạy trien-khai-pages.bat một lần để khởi tạo.');
  if (!fs.existsSync(path.join(root, '.github', 'workflows', 'pages.yml'))) throw new StopError('Thiếu file .github/workflows/pages.yml (file dựng app). Giải nén lại mã nguồn đầy đủ.');
  const branch = check('git', ['branch', '--show-current']).out;
  if (branch !== 'main') {
    if (canFix(`Đang ở nhánh "${branch || '(không tên)'}", cần nhánh main`)) {
      change('git', ['branch', '-M', 'main']);
      fixed('Đã đổi tên nhánh thành main');
    }
  } else ok('Nhánh main');
  const dirty = check('git', ['status', '--porcelain']).out.split(/\r?\n/).filter(Boolean);
  if (dirty.length) {
    if (canFix(`${dirty.length} file thay đổi chưa commit (GitHub chỉ dựng từ bản đã commit)`)) {
      changeQuiet('git', ['add', '-A']);
      const staged = check('git', ['diff', '--cached', '--name-only']).out.split(/\r?\n/).filter(Boolean);
      const forbidden = staged.filter(
        (file) => /^(node_modules|data)\//.test(file) || /^client\/dist(-pwa)?\//.test(file) || /\.sqlite(-\w+)?$/.test(file) || /(^|\/)\.env$/.test(file),
      );
      if (forbidden.length) {
        check('git', ['reset', '-q']);
        throw new StopError(`Có file không được đưa lên GitHub (dữ liệu hoặc file build):\n  ${forbidden.slice(0, 10).join('\n  ')}\nKiểm lại .gitignore. Không có gì bị commit.`);
      }
      const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
      changeQuiet('git', ['commit', '-q', '-m', `Cap nhat ${stamp}`]);
      fixed(`Đã commit ${staged.length} file`);
    }
  } else ok('Không có thay đổi chưa commit');
  const head = check('git', ['rev-parse', 'HEAD']).out;
  if (!head) throw new StopError('Repo trên máy chưa có commit nào. Chạy trien-khai-pages.bat.');

  section('Repo trên GitHub');
  // Đọc thẳng cấu hình (không qua quy tắc url.insteadOf của git) để so đúng địa chỉ đã lưu.
  const originUrl = check('git', ['config', '--get', 'remote.origin.url']).out;
  const fromOrigin = originUrl.match(/github\.com[/:]([^/]+)\/([^/]+?)(\.git)?$/i);
  const viewRepo = (name) => json(check('gh', ['repo', 'view', `${login}/${name}`, '--json', 'name,owner,visibility,isEmpty,defaultBranchRef,isArchived']));
  let repo = option('--repo') || (fromOrigin && fromOrigin[1].toLowerCase() === login.toLowerCase() ? fromOrigin[2] : '');
  if (repo && !option('--repo') && !viewRepo(repo)) {
    // origin còn trỏ repo cũ đã mất: hỏi repo muốn dùng thay vì đề nghị tạo lại repo cũ.
    warn(`origin đang trỏ tới repo ${login}/${repo}, repo này không còn trên GitHub`);
    repo = '';
  }
  if (!repo) repo = await ask('Tên repo trên GitHub muốn dùng', DEFAULT_REPO);
  if (!/^[A-Za-z0-9._-]+$/.test(repo)) throw new StopError('Tên repo chỉ gồm chữ không dấu, số, dấu . _ -');
  let full = `${login}/${repo}`;
  info(`Repo cần kiểm: ${full} (muốn repo khác thì chạy với --repo <tên>)`);

  let view = viewRepo(repo);
  if (!view) {
    info(`Repo đã xoá trong 90 ngày khôi phục được ở https://github.com/settings/repositories (mục Deleted repositories).`);
    if (!canFix(`Không có repo ${full} trên GitHub (đã xoá, đổi tên, hoặc gõ sai tên)`)) throw new StopError('Không có repo để kiểm tiếp.');
    if (!(await confirm(`Tạo repo public mới ${full} từ mã nguồn trên máy?`))) throw new StopError('Dừng theo lựa chọn của bạn.');
    change('gh', ['repo', 'create', full, '--public']);
    fixed(`Đã tạo repo ${full}`);
    view = viewRepo(repo);
  } else if (view.name !== repo) {
    // gh đi theo chuyển hướng khi repo bị đổi tên.
    warn(`Repo đã đổi tên thành ${view.name}; dùng tên mới`);
    repo = view.name;
    full = `${login}/${repo}`;
  } else ok(`Repo ${full} có trên GitHub`);
  if (view?.isArchived) bad('Repo đang ở trạng thái Archived (chỉ đọc). Vào Settings → General → Unarchive rồi chạy lại.');
  if (view && view.visibility !== 'PUBLIC') {
    if (canFix(`Repo đang ${view.visibility}: tài khoản GitHub miễn phí không chạy Pages cho repo riêng tư`) && (await confirm('Đổi repo sang Public? Ai cũng đọc được mã nguồn (không có dữ liệu sách của bạn)'))) {
      change('gh', ['repo', 'edit', full, '--visibility', 'public', '--accept-visibility-change-consequences']);
      fixed('Đã đổi repo sang Public');
    }
  } else if (view) ok('Repo public');

  const host = `https://${login.toLowerCase()}.github.io`;
  const appUrl = repo.toLowerCase() === `${login.toLowerCase()}.github.io` ? `${host}/` : `${host}/${repo}/`;
  const remoteUrl = `https://github.com/${full}.git`;

  section('Liên kết origin');
  if (!originUrl) {
    if (canFix('Chưa có origin')) {
      changeQuiet('git', ['remote', 'add', 'origin', remoteUrl]);
      fixed(`Đã thêm origin → ${remoteUrl}`);
    }
  } else if (originUrl.replace(/\.git$/, '').toLowerCase() !== remoteUrl.replace(/\.git$/, '').toLowerCase()) {
    if (canFix(`origin đang trỏ tới ${originUrl}`)) {
      changeQuiet('git', ['remote', 'set-url', 'origin', remoteUrl]);
      fixed(`Đã đổi origin → ${remoteUrl}`);
    }
  } else ok(`origin → ${remoteUrl}`);

  section('Mã nguồn trên GitHub');
  let pushed = false;
  // Tải thẳng từ repo đang kiểm (không qua origin), để kiểm được cả khi origin còn trỏ repo cũ đã mất.
  check('git', ['update-ref', '-d', 'refs/remotes/origin/main']);
  const fetched = check('git', ['fetch', '--prune', remoteUrl, '+refs/heads/*:refs/remotes/origin/*']);
  const remoteHead = check('git', ['rev-parse', '--verify', '-q', 'refs/remotes/origin/main']).out;
  const fetchError = fetched.err.split(/\r?\n/).find((line) => /fatal|error/i.test(line)) ?? fetched.err.split(/\r?\n/)[0];
  if (!fetched.ok && !/couldn't find remote ref|empty repository/i.test(fetched.err)) bad(`Không tải được từ GitHub: ${fetchError}`);
  else if (!remoteHead) {
    if (canFix('GitHub chưa có nhánh main')) {
      change('git', ['push', '-u', 'origin', 'main']);
      fixed('Đã đẩy mã nguồn lên');
      pushed = true;
    }
  } else if (remoteHead === head) ok('GitHub đã có đúng bản mới nhất trên máy');
  else if (check('git', ['merge-base', '--is-ancestor', remoteHead, head]).ok) {
    if (canFix('Máy có commit mới chưa đẩy lên GitHub')) {
      change('git', ['push', '-u', 'origin', 'main']);
      fixed('Đã đẩy commit mới lên');
      pushed = true;
    }
  } else if (check('git', ['merge-base', '--is-ancestor', head, remoteHead]).ok) {
    warn('GitHub có commit mới hơn máy (sửa trực tiếp trên GitHub?). Script không ghi đè; dựng app theo bản trên GitHub.');
  } else {
    const remoteFiles = check('git', ['ls-tree', '-r', '--name-only', remoteHead]).out.split(/\r?\n/).filter(Boolean);
    const related = check('git', ['merge-base', head, remoteHead]).ok;
    const starterOnly = !related && remoteFiles.every((file) => STARTER_FILES.test(file));
    if (canFix(`Lịch sử trên GitHub và trên máy khác nhau (GitHub có: ${remoteFiles.slice(0, 5).join(', ') || 'không có file'}${remoteFiles.length > 5 ? ', ...' : ''})`)) {
      const question = starterOnly
        ? 'Repo trên GitHub chỉ có file tạo sẵn (README/.gitignore/license). Ghi đè bằng mã nguồn trên máy?'
        : 'Ghi đè TOÀN BỘ lịch sử trên GitHub bằng bản trên máy? Commit chỉ có trên GitHub sẽ mất';
      if (await confirm(question)) {
        change('git', ['push', '-f', '-u', 'origin', 'main']);
        fixed('Đã ghi đè mã nguồn trên GitHub bằng bản trên máy');
        pushed = true;
      }
    }
  }
  const defaultBranch = view?.defaultBranchRef?.name;
  if (defaultBranch && defaultBranch !== 'main' && canFix(`Nhánh mặc định trên GitHub là "${defaultBranch}", cần main`)) {
    changeQuiet('gh', ['repo', 'edit', full, '--default-branch', 'main']);
    fixed('Đã đặt nhánh mặc định là main');
  }

  section('GitHub Pages');
  const pages = json(check('gh', ['api', `repos/${full}/pages`]));
  if (!pages) {
    if (canFix('Pages chưa bật cho repo này')) {
      changeQuiet('gh', ['api', '-X', 'POST', `repos/${full}/pages`, '-f', 'build_type=workflow']);
      fixed('Đã bật Pages, nguồn: GitHub Actions');
    }
  } else if (pages.build_type !== 'workflow') {
    if (canFix(`Pages đang lấy nguồn "${pages.build_type}" (từ nhánh), cần "GitHub Actions"`)) {
      changeQuiet('gh', ['api', '-X', 'PUT', `repos/${full}/pages`, '-f', 'build_type=workflow']);
      fixed('Đã đổi nguồn Pages sang GitHub Actions');
    }
  } else ok(`Pages bật, nguồn GitHub Actions (${pages.html_url ?? appUrl})`);

  section('Client ID Google (đồng bộ Drive)');
  const variable = check('gh', ['variable', 'get', 'VITE_GOOGLE_CLIENT_ID', '-R', full]).out;
  const envClientId = readEnvClientId();
  let variableChanged = false;
  if (variable && CLIENT_ID_PATTERN.test(variable)) {
    ok('Đã có VITE_GOOGLE_CLIENT_ID trên repo');
    if (envClientId && envClientId !== variable) warn('Client ID trên repo khác với file .env trên máy. Kiểm lại nếu đồng bộ Drive trên điện thoại báo lỗi.');
  } else if (envClientId) {
    if (canFix('Repo chưa có VITE_GOOGLE_CLIENT_ID')) {
      changeQuiet('gh', ['variable', 'set', 'VITE_GOOGLE_CLIENT_ID', '-R', full, '--body', envClientId]);
      fixed('Đã chép Client ID từ file .env lên repo');
      variableChanged = true;
    }
  } else {
    warn('Repo chưa có VITE_GOOGLE_CLIENT_ID và file .env cũng không có. App vẫn chạy nhưng nút Đồng bộ Google Drive sẽ không dùng được.');
    info('Lấy Client ID ở Google Cloud Console → APIs & Services → Credentials, rồi chạy: trien-khai-pages.bat --client-id <ID> --skip-tests');
  }

  section('Lần dựng app gần nhất (GitHub Actions)');
  const listRuns = () => json(check('gh', ['run', 'list', '-R', full, '--workflow', 'pages.yml', '--limit', '1', '--json', 'databaseId,status,conclusion,headSha,createdAt,event']))?.[0];
  let latest = listRuns();
  if (pushed) {
    info('Chờ GitHub nhận lần dựng do vừa đẩy mã nguồn...');
    for (let i = 0; i < 10 && !(latest && latest.headSha === check('git', ['rev-parse', 'HEAD']).out); i += 1) {
      await sleep(3000);
      latest = listRuns();
    }
  }
  const localHead = check('git', ['rev-parse', 'HEAD']).out;
  const stale = !latest || latest.headSha !== localHead;
  const failed = latest && latest.status === 'completed' && latest.conclusion !== 'success';
  if (latest && !stale && !failed && latest.status === 'completed') ok('Lần dựng gần nhất thành công, đúng bản mới nhất');
  let runId = latest && latest.status !== 'completed' && !stale ? latest.databaseId : null;
  if (!runId && (stale || failed || variableChanged)) {
    const reason = !latest ? 'Chưa có lần dựng nào' : failed ? `Lần dựng gần nhất lỗi (${latest.conclusion})` : variableChanged ? 'Vừa đặt Client ID, cần dựng lại' : 'Lần dựng gần nhất không phải bản mới nhất';
    if (canFix(reason)) {
      const since = Date.now() - 5000;
      changeQuiet('gh', ['workflow', 'run', 'pages.yml', '-R', full, '--ref', 'main']);
      for (let i = 0; i < 15 && !runId; i += 1) {
        await sleep(3000);
        const next = listRuns();
        if (next && Date.parse(next.createdAt) >= since) runId = next.databaseId;
      }
      if (!runId) bad(`Không thấy lần dựng mới. Xem https://github.com/${full}/actions`);
    }
  }
  if (runId) {
    info(`Đang dựng app (3–5 phút): https://github.com/${full}/actions/runs/${runId}`);
    const watched = exec('gh', ['run', 'watch', String(runId), '-R', full, '--exit-status', '--interval', '10'], { capture: false });
    if (watched.ok) {
      if (current.open) fixed('Dựng app thành công');
      else ok('Dựng app thành công');
    }
    else {
      bad('Dựng app lỗi');
      const log = check('gh', ['run', 'view', String(runId), '-R', full, '--log-failed']).out;
      const tail = log.split(/\r?\n/).slice(-30).join('\n');
      if (tail) console.log(`\n----- 30 dòng cuối của bước lỗi -----\n${tail}\n-------------------------------------`);
      if (/environment protection rules|not allowed to deploy to github-pages/i.test(log)) info('Nguyên nhân: môi trường github-pages chặn nhánh main. Vào Settings → Environments → github-pages → Deployment branches, thêm main.');
      else if (/Get Pages site failed|Ensure GitHub Pages has been enabled/i.test(log)) info('Nguyên nhân: Pages chưa bật. Chạy lại script này.');
      else if (/npm (ci|ERR)/i.test(log)) info('Nguyên nhân: cài thư viện lỗi trên GitHub. Kiểm package-lock.json đã được commit.');
      else if (/not ok|# fail/i.test(log)) info('Nguyên nhân: có test lỗi trên GitHub. Chạy npm test trên máy để xem chi tiết.');
    }
  }

  section('Địa chỉ app');
  let reachable = false;
  for (let attempt = 0; attempt < 12 && !reachable; attempt += 1) {
    try {
      const response = await fetch(`${appUrl}?kiem-tra=${Date.now()}`, { redirect: 'follow' });
      const html = await response.text();
      if (response.ok && /manifest\.webmanifest/.test(html)) reachable = true;
      else if (attempt === 0) info(`Chưa mở được (HTTP ${response.status}). Thử lại trong 2 phút, GitHub cần thời gian sau lần dựng...`);
    } catch (error) {
      if (attempt === 0) info(`Chưa kết nối được (${error.message}). Thử lại trong 2 phút...`);
    }
    if (!reachable && !REPORT_ONLY) await sleep(10_000);
    if (REPORT_ONLY) break;
  }
  if (reachable) ok(`App mở được: ${appUrl}`);
  else bad(`Chưa mở được ${appUrl}`);

  // Tổng kết
  console.log('\n================ TỔNG KẾT ================');
  const label = { ok: 'ĐẠT     ', fixed: 'ĐÃ SỬA  ', warn: 'CHÚ Ý   ', bad: 'CÒN LỖI ' };
  for (const entry of results) console.log(`  ${label[stateOf(entry)]} ${entry.title}${stateOf(entry) === 'ok' ? '' : ` — ${entry.notes.join('; ')}`}`);
  const remaining = results.filter((entry) => stateOf(entry) === 'bad').length;
  console.log(`\nĐịa chỉ app: ${appUrl}`);
  if (remaining) {
    console.log(`Còn ${remaining} mục lỗi. Chụp toàn bộ cửa sổ này gửi lại để được hướng dẫn tiếp.`);
    process.exitCode = 1;
  } else {
    console.log('Bản điện thoại đã sẵn sàng. Trên điện thoại: mở địa chỉ trên bằng Chrome, đóng rồi mở lại một lần để nhận bản mới.');
    console.log('Nếu biểu tượng app trên màn hình chính trỏ tới địa chỉ cũ: gỡ biểu tượng (không xoá dữ liệu trang web), rồi Chrome → ⋮ → Thêm vào màn hình chính.');
  }
}

main().catch((error) => {
  if (error instanceof StopError) {
    console.error(`\n[DỪNG] ${error.message}`);
    console.error('Chụp toàn bộ cửa sổ này gửi lại nếu cần hỗ trợ.');
  } else console.error(error);
  process.exitCode = 1;
});
