import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Build (hoặc chạy dev) bản PWA.
 *
 * Qua một script Node thay vì đặt biến môi trường ngay trong package.json, vì `VITE_PLATFORM=pwa vite build`
 * là cú pháp của shell Unix, không chạy trên cmd của Windows — mà bản Windows là nơi chính của dự án.
 *
 * Biến môi trường:
 *   BASE_PATH  đường dẫn gốc khi app không ở gốc domain, GitHub Pages là '/<tên-repo>/'.
 *              Mặc định '/' để chạy thử cục bộ. Phiên 4 sẽ điền tên repo thật.
 *
 *   VITE_GOOGLE_CLIENT_ID  Client ID của OAuth Client (Google Cloud) cho đồng bộ Drive ở Phiên 5.
 *              Không phải bí mật, nhưng không viết cứng vào mã nguồn để đổi tài khoản không phải sửa code.
 *
 * Kết quả nằm ở client/dist-pwa, tách khỏi client/dist của bản Windows.
 *
 * Sau khi build, thêm hai file cho GitHub Pages:
 *   404.html  bản sao index.html. Pages không có rewrite cho SPA: mở thẳng /<repo>/library hoặc tải lại
 *             trang ở đó sẽ nhận 404.html, nhờ bản sao này app vẫn khởi động và router tự xử lý đường dẫn.
 *   .nojekyll tắt Jekyll để file/thư mục bắt đầu bằng '_' không bị bỏ qua.
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const dev = process.argv.includes('--dev');
const base = process.env.BASE_PATH ?? '/';

const child = spawn(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), dev ? '' : 'build'].filter(Boolean), {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, VITE_PLATFORM: 'pwa', BASE_PATH: base },
});

child.on('exit', (code) => {
  if (code === 0 && !dev) {
    const out = path.join(root, 'client', 'dist-pwa');
    fs.copyFileSync(path.join(out, 'index.html'), path.join(out, '404.html'));
    fs.writeFileSync(path.join(out, '.nojekyll'), '');
  }
  process.exit(code ?? 0);
});
