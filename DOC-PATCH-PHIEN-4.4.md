# Patch update 4.4 — ảnh bìa trên điện thoại

Áp sau patch 4.3 (nếu chưa áp 4.3 thì áp 4.3 trước), giải nén đè bằng 7-Zip, rồi chạy `trien-khai-pages.bat --skip-tests --skip-google` để đưa lên GitHub Pages.

- Thêm ảnh bìa phim (và file đính kèm trong ghi chú phim) trên điện thoại không còn báo "Server chưa có thư mục lưu trữ". Sửa ở `server/media/mediaItemService.js`, `server/media/mediaDetailService.js`, kèm 1 test mới trong `server/tests/phase3-filestore.test.js`.
- Kệ sách: trên điện thoại ấn giữ gáy sách để lật ra ảnh bìa (trên máy tính vẫn là di chuột). Chạm chỗ khác hoặc sau 4 giây thì thu lại. Sửa ở `client/src/components/bookshelf/BookSpine.jsx`.
- `docs/HANDOFF-ANDROID-S.md`: ghi nhận hai lỗi và lựa chọn gộp A cho Phiên 5.

Kiểm: `npm test` 184 pass; `npm run verify` PASS, 68/68.
