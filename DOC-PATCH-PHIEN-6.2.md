# Patch update 6.2: biểu tượng lối tắt Desktop và lối tắt đổi tên theo tên app

Áp sau patch 6.1. Không có migration, không thêm gói npm, schema giữ v16. Chỉ ảnh hưởng bản Windows; bản điện thoại không có lối tắt Desktop.

## Lỗi và nguyên nhân

**1. Lối tắt trên Desktop hiện biểu tượng trang trắng.** Lối tắt cũ lấy biểu tượng từ file `.ico` nằm trong thư mục lưu trữ dữ liệu hoặc trong thư mục dự án. Trên máy này, cả hai đều nằm trên ổ Google Drive (H:\My Drive). Explorer thường không đọc được biểu tượng từ ổ ảo của Google Drive, vì hai lý do: file có thể chỉ có trên mây, hoặc ổ chưa được gắn lúc Windows vẽ Desktop. Khi không đọc được, Explorer hiện biểu tượng trang trắng. Ngoài ra, biểu tượng tuỳ chỉnh trước đây chỉ có một ảnh 256×256, nên ở cỡ nhỏ có thể hiện sai.

Đây là **suy luận** từ code và cấu hình, chưa kiểm chứng trên Windows. Môi trường của tôi không có Windows nên không chạy được PowerShell và Explorer.

**2. Tên lối tắt luôn là "Ke sach".** Tên lối tắt bị gán cứng trong code, nên đổi tên app không làm lối tắt đổi theo.

## Đã sửa

1. **File biểu tượng nằm trên ổ máy.**
   - File `.ico` của lối tắt được ghi vào `%LOCALAPPDATA%\MediaTracker\icons\`, thường là `C:\Users\<tên>\AppData\Local\MediaTracker\icons\`, không còn nằm trên Google Drive.
   - Tên file đổi theo nội dung ảnh. Mỗi lần đổi biểu tượng là một file mới, nên Windows không giữ ảnh cũ trong bộ nhớ đệm. File cũ do app tạo được xoá.
2. **Biểu tượng có 7 cỡ:** 16, 24, 32, 48, 64, 128 và 256 px, dựng từ ảnh PNG đã chọn. Biểu tượng mặc định vốn đã đủ 7 cỡ.
3. **Lối tắt mang tên app và tự đổi theo.**
   - Đổi tên ở Cài đặt → Giao diện → Tên app thì file lối tắt trên Desktop đổi tên theo sau khoảng 1–2 giây.
   - Ký tự Windows không cho dùng trong tên file (`< > : " / \ | ? *`) được bỏ đi.
   - App nhận ra lối tắt của mình theo đích là `mo-app.bat` của đúng thư mục dự án. Vì vậy lối tắt cũ "Ke sach" hoặc lối tắt bạn tự đổi tên cũng được nhận ra và đổi tên.
4. **Kiểm lại mỗi lần mở app:** khi mở `mo-app.bat`, app đưa lối tắt về đúng tên và biểu tượng hiện tại. Nhờ vậy, tên app đổi ở máy khác rồi về qua đồng bộ Drive cũng được áp dụng.
5. **`tao-shortcut-desktop.bat` viết lại:** đọc tên app và biểu tượng từ dữ liệu (chỉ đọc, an toàn khi app đang mở), rồi tạo hoặc sửa lối tắt bằng đúng logic của nút "Tạo lối tắt Desktop". Cửa sổ in ra đường dẫn lối tắt và đường dẫn file biểu tượng để đối chiếu khi có lỗi.
6. **Thông báo rõ hơn trong Cài đặt:** đã tạo, đã đổi tên, đã đúng, chưa có lối tắt, trùng tên với file khác trên Desktop, hoặc lỗi kèm nội dung lỗi.

## Cài đặt

1. Đóng mọi cửa sổ `mo-app.bat` và mọi tab app.
2. Giải nén `patch-update-6.2-loi-tat-desktop.zip` đè vào thư mục gốc dự án bằng 7-Zip, chọn ghi đè.
3. Chạy `kiem-tra.bat`. Mong đợi 205 test pass và verify ĐẠT.
4. Chạy `tao-shortcut-desktop.bat` một lần. Lối tắt "Ke sach" cũ sẽ được đổi tên theo tên app và nhận biểu tượng mới. Nếu không còn lối tắt nào, script tạo mới.
5. Nếu biểu tượng vẫn trắng sau bước 4, thử theo thứ tự:
   - Bấm chuột phải lên Desktop → Refresh, hoặc đăng xuất rồi đăng nhập lại Windows.
   - Xoá lối tắt trên Desktop rồi chạy lại `tao-shortcut-desktop.bat`.
   - Nếu vẫn trắng, chụp cửa sổ của `tao-shortcut-desktop.bat` (có đường dẫn lối tắt và biểu tượng) gửi lại.

## File thay đổi

- `server/utils/pngImage.js` (mới): đọc PNG, thu nhỏ, ghi PNG bằng JS thuần để dựng `.ico` nhiều cỡ, không cần thư viện ảnh.
- `server/services/desktopShortcut.js`:
  - Dựng ICO nhiều cỡ và ghi vào `%LOCALAPPDATA%`.
  - Đặt tên lối tắt theo tên app.
  - Script PowerShell mới: tìm lối tắt theo đích, đổi tên, gán biểu tượng, chỉ ghi khi có thay đổi.
  - Các lần cập nhật chạy nối tiếp, không chồng nhau.
- `server/services/settingsService.js`: đổi tên app thì đồng bộ lối tắt (chạy nền); đổi hoặc gỡ biểu tượng và nút tạo lối tắt dùng chung một hàm.
- `server/index.js`: đồng bộ lối tắt khi khởi động trên Windows.
- `server/scripts/createShortcut.js` (mới): dùng bởi `tao-shortcut-desktop.bat`.
- `tao-shortcut-desktop.bat`: gọi script mới.
- `client/src/components/settings/AppIconSettings.jsx`: thông báo mới, không còn tên cứng "Ke sach".
- `client/src/components/settings/AppearanceSettings.jsx`: mô tả ô Tên app nói rõ lối tắt đổi tên theo.
- `client/src/i18n/source.json`, `client/src/i18n/locales/{en,zh,ja,vi}.tsv`: 8 chuỗi mới.
- `server/tests/patch6-2-shortcut.test.js` (mới, 7 test).
- `server/tests/fixtures-png/` (mới): ảnh PNG mẫu, cùng dữ liệu điểm ảnh tham chiếu xuất từ Pillow.

## Kiểm thử

Đã chạy:

- `npm test`: 205/205 pass. `npm run verify`: acceptance 68/68.
- **Phần đọc PNG:** đối chiếu từng điểm ảnh với Pillow trên 7 loại PNG (RGBA, RGB, xám, xám có độ trong suốt, palette 4 bit, xám 1 bit, 16 bit).
- **File ICO tạo ra:** đủ 7 cỡ, mỗi cỡ đọc lại được.
- **Tên lối tắt:** bỏ đúng ký tự cấm.
- **Gọi PowerShell và đọc kết quả:** dùng PowerShell giả lập.
- **Đổi tên app:** có gọi đồng bộ lối tắt và không tạo lối tắt mới; giữ nguyên tên thì không gọi.
- **Chrome trên Linux:** đổi tên app lưu được. Nút tạo lối tắt báo đúng là "không phải Windows". Không có lỗi console.

Chưa kiểm được, cần bạn tự kiểm trên Windows:

- Script PowerShell chạy thật: tìm, đổi tên và gán biểu tượng cho lối tắt.
- Explorer hiện đúng biểu tượng.
- Desktop nằm trong OneDrive (Windows lấy đúng đường dẫn Desktop thật, nhưng chưa thử).
- Tên app có dấu tiếng Việt khi làm tên file lối tắt.

## Checklist nghiệm thu

1. **Chạy script tạo lối tắt:** `tao-shortcut-desktop.bat` báo đã tạo hoặc đã đổi tên. Lối tắt trên Desktop mang tên app và có biểu tượng đúng, không còn trang trắng.
2. **Đổi tên app:** đổi Cài đặt → Giao diện → Tên app thành tên khác, chờ vài giây. Lối tắt trên Desktop đổi tên theo, vẫn giữ biểu tượng, và bấm đúp vẫn mở được app.
3. **Đổi biểu tượng:** đổi biểu tượng app bằng một file PNG khác. Thông báo báo đã cập nhật lối tắt, và lối tắt hiện biểu tượng mới.
4. **Dùng biểu tượng mặc định:** lối tắt quay về biểu tượng con mèo mặc định.
5. **Tắt rồi mở lại:** tắt app, mở lại bằng lối tắt. App mở bình thường, cửa sổ đen không có dòng "Không cập nhật được lối tắt Desktop".
