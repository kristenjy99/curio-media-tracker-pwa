# Patch update 4.1 — script triển khai tự động

Áp **sau** patch update 4. Giải nén đè vào thư mục gốc dự án bằng 7-Zip. Không thêm gói npm, không đổi code của app.

- `trien-khai-pages.bat` (mới): bấm đúp để đưa app lên GitHub Pages.
- `server/scripts/deployPages.js` (mới): phần việc thật của file .bat.
- `docs/TRIEN-KHAI-GITHUB-PAGES.md`: thêm mục "Cách nhanh". `docs/HANDOFF-ANDROID-S.md`: ghi nhận script.

Trước khi chạy, cài một lần: Git for Windows (https://git-scm.com/download/win) và GitHub CLI (cmd: `winget install --id GitHub.cli`), rồi mở lại cửa sổ.
