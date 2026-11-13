import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Hai bản build từ cùng một mã nguồn:
 *
 *  - Windows (mặc định, `npm run build`): giao diện gọi `fetch('/api/...')` tới server Express ở
 *    cùng cổng. Vite dev server (5173) chuyển /api sang 4317.
 *  - PWA (`npm run build:pwa`, biến VITE_PLATFORM=pwa): không có server nào cả. Giao diện gọi thẳng
 *    bảng route trong một Web Worker; DB là SQLite WASM trên OPFS, file người dùng tải lên nằm trong
 *    IndexedDB. Vì vậy bản này phải nạp được code trong server/** mà không có module của Node, nên
 *    `node:path` và `node:crypto` được thay bằng bản viết lại cho trình duyệt, còn `node:fs`,
 *    `node:os`, `node:child_process` thành chốt chặn ném lỗi khi bị gọi (xem server/platform/shims/).
 *
 * BASE_PATH: GitHub Pages phục vụ app ở /<tên-repo>/ nên đường dẫn tài nguyên phải có tiền tố đó.
 * Đặt qua biến môi trường để Phiên 4 điền tên repo thật mà không phải sửa file này.
 */

const root = path.dirname(fileURLToPath(import.meta.url));
const shim = (name) => path.join(root, 'server', 'platform', 'shims', name);

/**
 * Lớp vận chuyển được hoán đổi lúc build: mọi import './lib/transport.js' chuyển sang
 * './lib/transport.pwa.js'. Dùng resolveId thay cho resolve.alias vì các import này là đường dẫn
 * tương đối, mà alias dạng regex trả về chuỗi không tuyệt đối thì rolldown không nạp được.
 */
function pwaTransport() {
  const target = path.join(root, 'client', 'src', 'lib', 'transport.pwa.js');
  return {
    name: 'rt-pwa-transport',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (!/(^|\/)transport\.js$/.test(source)) return null;
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      if (!resolved || !resolved.id.endsWith(path.join('client', 'src', 'lib', 'transport.js'))) return null;
      return target;
    },
  };
}

/**
 * Chỉ bản PWA cần manifest và Service Worker; bản Windows chạy trên server Express nên không đăng ký
 * gì để không sinh thêm một lớp cache giữa giao diện và API. Vì vậy hai thẻ này được chèn lúc build
 * thay vì viết cứng trong client/index.html.
 */
function pwaHtml(base) {
  return {
    name: 'rt-pwa-html',
    transformIndexHtml() {
      return [
        { tag: 'link', attrs: { rel: 'manifest', href: `${base}manifest.webmanifest` }, injectTo: 'head' },
        { tag: 'meta', attrs: { name: 'theme-color', content: '#4b6b50' }, injectTo: 'head' },
        { tag: 'link', attrs: { rel: 'apple-touch-icon', href: `${base}icon-192.png` }, injectTo: 'head' },
        {
          tag: 'script',
          children: `if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('${base}sw.js', { scope: '${base}' }).catch((error) => console.warn('Không đăng ký được Service Worker', error)));`,
          injectTo: 'body',
        },
      ];
    },
  };
}

export default defineConfig(({ mode }) => {
  const isPwa = process.env.VITE_PLATFORM === 'pwa';
  const base = process.env.BASE_PATH ?? '/';

  return {
    root: 'client',
    // Đọc .env ở thư mục gốc dự án (cạnh package.json) chứ không phải client/; Vite chỉ đưa vào bundle
    // các biến có tiền tố VITE_, nên PORT/HOST... của server không lọt ra giao diện.
    envDir: root,
    base,
    define: { 'import.meta.env.VITE_PLATFORM': JSON.stringify(isPwa ? 'pwa' : 'node') },
    plugins: [react(), tailwindcss(), ...(isPwa ? [pwaTransport(), pwaHtml(base.endsWith('/') ? base : `${base}/`)] : [])],
    resolve: {
      alias: isPwa
        ? [
            { find: /^node:path$/, replacement: shim('path.js') },
            { find: /^node:crypto$/, replacement: shim('crypto.js') },
            { find: /^node:url$/, replacement: shim('url.js') },
            { find: /^node:fs$/, replacement: shim('nodeOnly.js') },
            { find: /^node:fs\/promises$/, replacement: shim('nodeOnly.js') },
            { find: /^node:os$/, replacement: shim('nodeOnly.js') },
            { find: /^node:child_process$/, replacement: shim('nodeOnly.js') },
          ]
        : [],
    },
    // sqlite-wasm nạp file .wasm theo đường dẫn của chính module nên không cho Vite gói sẵn vào
    // bundle dev; phần build thì rollup xử lý được.
    optimizeDeps: { exclude: isPwa ? ['@sqlite.org/sqlite-wasm'] : [] },
    build: {
      outDir: isPwa ? 'dist-pwa' : 'dist',
      emptyOutDir: true,
      chunkSizeWarningLimit: 1600,
      target: 'es2022',
    },
    worker: { format: 'es' },
    server: {
      port: 5173,
      host: '127.0.0.1',
      proxy: isPwa ? undefined : { '/api': { target: `http://127.0.0.1:${process.env.PORT || 4317}`, changeOrigin: false } },
      // OPFS SAHPool không cần COOP/COEP; giữ nguyên header mặc định để giống GitHub Pages.
    },
  };
});
