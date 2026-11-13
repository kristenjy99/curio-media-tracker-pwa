# Patch update 4 — GitHub Pages + cấu hình OAuth Google

Gói chỉ chứa file **mới hoặc đã sửa** trong Phiên 4, giữ nguyên cấu trúc thư mục. Giải nén đè vào thư mục gốc dự án (chỗ có `package.json`), không xoá file nào. Không thêm gói npm, không có migration.

## Có gì trong patch (9 file)

- `.github/workflows/pages.yml` (mới): build bản PWA và đưa lên GitHub Pages khi push `main` hoặc bấm tay.
- `client/src/main.jsx`: **sửa lỗi** router không có `basename`, khiến app dưới `/<repo>/` không khớp route nào. Bản Windows không đổi.
- `server/scripts/buildPwa.js`: tạo thêm `404.html` (để tải lại trang con trên Pages không ra 404) và `.nojekyll`.
- `client/src/lib/googleConfig.js` (mới): đọc Client ID Google từ biến `VITE_GOOGLE_CLIENT_ID`, chuẩn bị cho Phiên 5.
- `vite.config.js`: đọc `.env` ở thư mục gốc dự án. `.env.example`: thêm `VITE_GOOGLE_CLIENT_ID`.
- `docs/TRIEN-KHAI-GITHUB-PAGES.md` (mới): các bước tạo repo, bật Pages, tạo OAuth Client, đặt Client ID, kiểm trên Android (không làm iOS).
- `docs/HANDOFF-ANDROID-S.md`: cập nhật cuối Phiên 4. `DOC-PATCH-PHIEN-4.md`: file này.

## Cách áp

1. Giải nén đè. Thư mục `.github` bắt đầu bằng dấu chấm, kiểm là nó đã có trong thư mục dự án.
2. `npm test` → 183 pass; `npm run verify` → PASS 5 hạng mục, 68/68.
3. Làm tiếp theo `docs/TRIEN-KHAI-GITHUB-PAGES.md` từ mục 1.
