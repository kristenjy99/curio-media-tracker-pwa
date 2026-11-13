# Patch update 4.2 — sửa script triển khai đứng ở bước đăng nhập

Áp sau patch 4.1, giải nén đè bằng 7-Zip.

- `server/scripts/deployPages.js`: script không còn giữ bàn phím suốt lúc chạy, nên phím Enter tới được lệnh đăng nhập GitHub (trước đây đứng yên ở dòng "Press Enter to open ...").
- `docs/HANDOFF-ANDROID-S.md`: ghi nhận lỗi.
