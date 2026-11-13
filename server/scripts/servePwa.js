import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/**
 * Chạy thử bản điện thoại (PWA) ngay trên máy, không cần GitHub Pages.
 *
 * Bản PWA không có server API: toàn bộ database nằm trong trình duyệt. Nhưng nó vẫn phải được TẢI
 * qua HTTP, vì mở bằng file:// thì trình duyệt không cho dùng OPFS lẫn Service Worker. Script này
 * chỉ làm đúng một việc: phục vụ thư mục client/dist-pwa như một web server tĩnh.
 *
 * Về việc mở trên điện thoại qua Wi-Fi: trình duyệt chỉ bật OPFS và Service Worker ở "ngữ cảnh an
 * toàn", tức là HTTPS hoặc localhost. Địa chỉ http://192.168.x.x KHÔNG thuộc loại đó, nên mở bằng
 * đường đó app vẫn hiện ra và bấm được, nhưng database nằm trong bộ nhớ (đóng tab là mất) và ảnh
 * không hiển thị. Đủ để xem bố cục và thao tác, không đủ để kiểm tra lưu trữ. Muốn kiểm đầy đủ trên
 * máy điện thoại thì có hai đường: chờ Phiên 4 đưa lên GitHub Pages (có HTTPS sẵn), hoặc cắm cáp USB
 * và dùng Port forwarding của Chrome (chrome://inspect trên máy tính) để điện thoại thấy cổng này
 * dưới dạng localhost.
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const dist = path.join(root, 'client', 'dist-pwa');
const PORT = Number(process.env.PWA_PORT ?? 4318);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function build() {
  console.log('Dang dung ban dien thoai (npm run build:pwa)...');
  const result = spawnSync(process.execPath, [path.join(root, 'server', 'scripts', 'buildPwa.js')], { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) {
    console.error('\n[LOI] Khong dung duoc ban dien thoai. Chay "npm install" roi thu lai.');
    process.exit(1);
  }
}

if (!fs.existsSync(path.join(dist, 'index.html')) || process.argv.includes('--build')) build();

const server = http.createServer((req, res) => {
  const requested = decodeURI((req.url ?? '/').split('?')[0]);
  let file = path.join(dist, requested === '/' ? 'index.html' : requested.replace(/^\/+/, ''));
  // Mọi đường dẫn không phải file đều trả index.html: app là SPA, điều hướng do React Router lo.
  if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dist, 'index.html');
  res.writeHead(200, {
    'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream',
    // Không cache trong lúc thử để lần mở sau luôn lấy bản vừa build.
    'Cache-Control': 'no-store',
  });
  fs.createReadStream(file).pipe(res);
});

function lanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((entry) => entry && entry.family === 'IPv4' && !entry.internal)
    .map((entry) => entry.address);
}

server.listen(PORT, '0.0.0.0', () => {
  const lan = lanAddresses();
  console.log('');
  console.log('===========================================================');
  console.log('  BAN DIEN THOAI (PWA) dang chay thu tren may nay');
  console.log('===========================================================');
  console.log('');
  console.log(`  Tren may tinh:  http://localhost:${PORT}`);
  console.log('      -> day la ban DAY DU: luu tru that, Service Worker, anh hien binh thuong.');
  console.log('');
  if (lan.length) {
    for (const address of lan) console.log(`  Tren dien thoai cung Wi-Fi:  http://${address}:${PORT}`);
    console.log('      -> ban XEM THU: bam duoc, nhung du lieu nam trong bo nho (dong tab la mat)');
    console.log('         va anh khong hien, vi trinh duyet chi bat luu tru that o HTTPS hoac localhost.');
    console.log('         Muon kiem tra that tren dien thoai: cho Phien 4 (GitHub Pages, co HTTPS),');
    console.log('         hoac cam cap USB va dung Port forwarding trong chrome://inspect.');
  } else {
    console.log('  Khong tim thay dia chi mang LAN nao.');
  }
  console.log('');
  console.log('  Du lieu cua ban dien thoai TACH RIENG voi app tren Windows:');
  console.log('  lan dau mo se trong, do la dung. Noi hai ben lai la viec cua Phien 5.');
  console.log('');
  console.log('  GIU CUA SO NAY MO. Dong cua so de tat.');
  console.log('');
});
