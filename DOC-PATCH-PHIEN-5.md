# Patch Phiên 5: Đồng bộ Google Drive

Patch này thêm nút "Đồng bộ" ở thanh trên, cho cả bản Windows lẫn bản điện thoại (PWA trên GitHub Pages). Dữ liệu hai bên gộp qua thư mục `Media Tracker Sync` trên Google Drive của bạn theo quy tắc A: mỗi quyển sách (cùng lượt đọc, log, ghi chú, ảnh) hoặc mỗi phim là một khối, cùng một khối sửa ở hai nơi thì bản sửa sau thắng nguyên khối. Schema không đổi (sách v15, media v8). Chi tiết thiết kế và lý do nằm ở mục "Phiên 5" trong `docs/HANDOFF-ANDROID-S.md`.

## Cách áp

1. **Đóng app Windows.** Đóng cửa sổ `mo-app.bat` và mọi tab app.
2. **Giải nén đè vào thư mục dự án.** Giải nén `patch-update-5-dong-bo-drive.zip` đè vào thư mục gốc dự án (chỗ có `package.json`) bằng 7-Zip và chọn ghi đè. Zip chỉ chứa file mới hoặc đã sửa, không xoá file nào, không thêm gói npm, không có migration.
3. **Kiểm tra.** Chạy `kiem-tra.bat`, hoặc `npm test` rồi `npm run verify`. Kết quả mong đợi: 193 test pass, verify PASS cả 5 mục.
4. **Đưa bản điện thoại lên Pages.** Chạy `trien-khai-pages.bat`. Trước đó đóng hết tab app trên máy tính, vì script vẫn tự mở một tab mới khi chạy xong.

## Việc cần làm một lần bên Google Cloud

Vào Google Cloud Console, project `media-tracker`, mục APIs & Services → Credentials, mở OAuth Client loại Web application. Ở **Authorized JavaScript origins**, phải có đủ ba dòng, mỗi dòng gõ đúng từng ký tự, không có dấu `/` cuối:

```
https://kristenjy99.github.io
http://localhost:4317
http://127.0.0.1:4317
```

Phải có cả `localhost` lẫn `127.0.0.1` vì `mo-app.bat` mở app bằng `127.0.0.1`, mà với Google đó là một origin khác. Phần Authorized redirect URIs không cần sửa. Bấm Save rồi chờ khoảng 5 phút trước khi thử. Kiểm tra thêm hai việc: Google Drive API đang bật (APIs & Services → Library), và Gmail của bạn có trong Test users của OAuth consent screen.

Nếu Google không nhận `http://127.0.0.1:4317`, đây là điểm tôi chỉ suy luận chứ chưa kiểm được. Khi đó bạn chỉ để `localhost` và mở app bằng `http://localhost:4317` thay vì địa chỉ `mo-app.bat` tự mở.

## Trước lần đồng bộ đầu tiên

Lần đồng bộ đầu tiên **gộp** dữ liệu của cả hai bên. Sách đang có trên điện thoại sẽ sang máy tính. Cùng một quyển tạo riêng ở hai máy sẽ thành hai bản trùng, vì hai bản đó có định danh khác nhau. Nếu điện thoại đang có dữ liệu thử, xoá nó trước: Cài đặt → Dữ liệu → Xoá toàn bộ dữ liệu. Thứ tự nên làm: **đồng bộ Windows trước**, rồi mới đến điện thoại.

Lưu ý: dùng "Xoá toàn bộ dữ liệu" trên một máy **sau khi** máy đó đã đồng bộ thì lần đồng bộ kế tiếp sẽ xoá dữ liệu ở mọi máy. Đó là đúng nghĩa của thao tác này, không phải lỗi.

## Các bước test đồng bộ hai chiều Windows ↔ Android

Ghi kết quả từng bước (đạt, không đạt kèm thông báo lỗi) để đưa vào handoff ở đầu Phiên 6.

1. **Đăng nhập trên Windows.** Mở app bằng `mo-app.bat`, bấm nút đám mây "Đồng bộ" ở thanh trên, rồi bấm "Đồng bộ ngay". Popup Google hiện ra: chọn Gmail và bấm Continue ở màn hình cảnh báo app chưa xác minh (đây là chế độ Testing). Ở màn hình quyền, tích quyền truy cập file Drive do app tạo. Kết quả mong đợi: hộp thoại báo "Đồng bộ xong", có số mục và số ảnh "Đẩy lên Drive".
2. **Kiểm tra trên Drive.** Mở drive.google.com bằng máy tính. Kết quả mong đợi: có thư mục `Media Tracker Sync`, bên trong có `snapshot.json` và thư mục `files` chứa ảnh bìa.
3. **Đồng bộ lần đầu trên điện thoại.** Mở app đã cài và bấm "Đồng bộ" → "Đồng bộ ngay". Popup Google mở ra. Đây là bước quan trọng nhất cần kiểm: popup có mở được khi app chạy toàn màn hình không. Kết quả mong đợi: "Lấy về máy này" lớn hơn 0; sách, phim và ảnh bìa hiện đúng, kể cả khi ấn giữ gáy sách trên kệ.
4. **Điện thoại sang Windows.** Trên điện thoại: thêm một sách mới có ảnh bìa, thêm một log đọc cho một sách cũ, sửa điểm một phim. Bấm Đồng bộ. Trên Windows bấm Đồng bộ. Kết quả mong đợi: Windows thấy đủ ba thay đổi, ảnh bìa mới hiện đúng.
5. **Windows sang điện thoại.** Trên Windows: sửa ghi chú một sách, đổi màu giao diện, đặt hoặc đổi mật khẩu xoá dữ liệu. Đồng bộ Windows, rồi đồng bộ điện thoại. Kết quả mong đợi: điện thoại thấy ghi chú mới và giao diện mới. Mật khẩu đặt trên Windows dùng được trên điện thoại: thử Cài đặt → Dữ liệu → Xuất database.
6. **Xoá không sống lại.** Xoá một sách trên điện thoại rồi đồng bộ, sau đó đồng bộ Windows. Kết quả mong đợi: sách biến mất ở Windows, kèm số "Xoá trên máy này". Đồng bộ thêm một lượt mỗi bên: sách không quay lại.
7. **Xung đột.** Sửa tên cùng một sách ở cả hai máy, mà chưa đồng bộ giữa hai lần sửa; sửa ở máy tính trước, ở điện thoại sau vài phút. Đồng bộ Windows, rồi đồng bộ điện thoại. Kết quả mong đợi: điện thoại báo 1 mục bị sửa ở cả hai nơi và giữ bản của máy này. Đồng bộ lại Windows: tên trên Windows thành tên đã sửa trên điện thoại. Toàn bộ sách đi theo bản thắng, kể cả log và ghi chú.
8. **Không có gì đổi.** Bấm Đồng bộ hai lần liên tiếp mỗi bên mà không sửa gì. Kết quả mong đợi: báo "Hai bên đã khớp, không có gì thay đổi".
9. **Khôi phục.** Trên Windows mở "Khôi phục và ghi đè". Kết quả mong đợi: có danh sách bản chụp kèm thời điểm. Bấm "Khôi phục" hai lần ở bản mới nhất: dữ liệu máy này trở về như trước lần đồng bộ đó. Bản sao SQLite đầy đủ nằm ở `<thư mục lưu trữ>\backups\truoc-khi-dong-bo-<thời điểm>\`.
10. **Mất mạng.** Bật chế độ máy bay trên điện thoại rồi bấm Đồng bộ. Kết quả mong đợi: thông báo dễ hiểu về mạng, app vẫn dùng bình thường.

Nếu đăng nhập lỗi, ghi lại đúng thông báo trong popup Google. Hai lỗi hay gặp là `origin_mismatch` (origin khai báo chưa khớp) và "access blocked" (Gmail chưa nằm trong Test users).

## Khi đồng bộ ra kết quả sai

Trước mỗi lần đồng bộ có lấy dữ liệu về, app chụp lại dữ liệu của máy đó. Sửa theo hai bước:

1. Trên máy có dữ liệu đúng, mở "Khôi phục và ghi đè". Nếu máy này đã bị đồng bộ làm sai thì bấm "Khôi phục" về bản trước lần sai.
2. Bấm "Ghi đè Drive" (bấm hai lần). Drive thành đúng bằng máy này, và máy kia nhận theo ở lần đồng bộ sau.

Trên Windows còn một đường lùi nữa: bản sao SQLite trong `backups\truoc-khi-dong-bo-*`. Đóng app, chép hai file trong thư mục đó đè lên file DB trong thư mục lưu trữ, rồi mở lại app.

## Những gì đã kiểm và chưa kiểm

Đã kiểm:

- **Test tự động:** 9 test mới.
  - Hai chiều có ảnh.
  - Xoá không sống lại.
  - Xung đột.
  - Không đẩy qua đẩy lại.
  - Tham chiếu challenge, bracket, yêu thích.
  - Khôi phục và ghi đè.
  - Từ chối dữ liệu do bản app mới hơn ghi.
  - Bản điện thoại (SQLite WASM) cho hash khớp với bản Windows.
  - Lớp gọi Drive với dữ liệu giả lập.
- **Chrome thật trên cả hai bản build:** Google được thay bằng server giả lập Drive. Đồng bộ Windows → điện thoại → Windows chạy đúng, ảnh bìa hiện qua Service Worker, lần đồng bộ lặp lại báo đã khớp.

Chưa kiểm, cần bạn làm theo các bước trên:

- Đăng nhập Google thật.
- Gọi Drive thật.
- Popup trên điện thoại khi app chạy toàn màn hình.
- Việc file do máy này tạo thấy được ở máy kia với quyền `drive.file`. Tôi suy luận là được vì hai bản dùng chung một OAuth Client, nhưng chưa kiểm.

## Danh sách file trong patch

**Mới:**
- `server/services/driveSync/index.js`, `units.js`, `merge.js`, `apply.js`
- `client/src/lib/driveErrors.js`, `googleAuth.js`, `driveApi.js`, `driveSync.js`
- `client/src/components/sync/DriveSyncDialog.jsx`
- `server/tests/phase5-drive-sync.test.js`
- `DOC-PATCH-PHIEN-5.md`

**Sửa:**
- `server/services/index.js`
- `server/routes/routeTable.js`
- `server/app.js`
- `server/platform/browserContext.js`
- `client/src/lib/googleConfig.js`
- `client/src/components/layout/AppShell.jsx`
- `server/scripts/deployPages.js`
- `docs/TRIEN-KHAI-GITHUB-PAGES.md`
- `docs/HANDOFF-ANDROID-S.md`
