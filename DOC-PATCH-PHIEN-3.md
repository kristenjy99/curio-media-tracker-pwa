# Patch Phiên 3 — PWA cục bộ

Gói này chỉ chứa những file **mới hoặc đã sửa** trong Phiên 3, giữ nguyên cấu trúc thư mục. Giải nén đè lên thư mục dự án (`media-tracker/`), không xoá file nào đang có.

## Cách áp

1. Đóng server đang chạy (`npm run dev` / `mo-app.bat`).
2. Sao lưu thư mục dự án, hoặc commit những gì đang có, trước khi giải nén đè.
3. Giải nén gói này vào đúng thư mục gốc dự án (chỗ có `package.json`).
4. `npm install` — Phiên 3 thêm hai gói: `@sqlite.org/sqlite-wasm` và `buffer`. `package.json` và `package-lock.json` đều nằm trong gói nên cài là khớp.
5. Kiểm tra: `npm test` phải ra **183 pass, 0 fail**; `npm run verify` phải PASS cả 5 hạng mục với acceptance **68/68**.
6. Bản Windows chạy như cũ: `npm run build` rồi `npm start`.
7. Bản điện thoại: `npm run build:pwa`, kết quả ở `client/dist-pwa` (Phiên 4 mới đem lên GitHub Pages). Muốn thử dưới đường dẫn con như trên Pages thì đặt `BASE_PATH` trước khi build, ví dụ trong PowerShell: `$env:BASE_PATH="/ten-repo/"; npm run build:pwa`.

## Lưu ý khi giải nén

Nếu dùng File Explorer của Windows để giải nén và thấy tên file tiếng Việt bị hỏng ở đâu đó, giải nén lại bằng 7-Zip. Gói này không có file nào tên tiếng Việt nên thường không gặp, nhưng thư mục dự án thì có.

## Có gì trong patch

63 file: 26 file mới (lõi SQLite WASM, FileStore trình duyệt, worker API, Service Worker, manifest, shim module Node, ba file test) và 37 file sửa. Chi tiết từng phần, lý do của từng quyết định, và kết quả kiểm tra nằm trong `docs/HANDOFF-ANDROID-S.md` — file đó cũng có trong gói, ở mục "Kiến trúc bản PWA (Phiên 3)" trở đi.

Hai thay đổi chạm vào dữ liệu thật, đọc trước khi áp:

- **Mật khẩu xoá dữ liệu** chuyển từ scrypt sang PBKDF2-SHA256. Mật khẩu đã đặt trên Windows vẫn dùng được bình thường và sẽ tự chuyển sang PBKDF2 khi bạn đổi mật khẩu lần tới. Không cần làm gì.
- **Ảnh nền, biểu tượng app và đồ trang trí** nay ghi qua FileStore thay vì `node:fs`. Vị trí file trên đĩa không đổi (`<storage>/uploads/app/...`), nên ảnh đang có vẫn hiện đúng.
