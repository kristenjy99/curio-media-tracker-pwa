# Patch update 6.1: sửa cảnh báo trùng tên sách

Áp sau patch 6. Không có migration, không thêm gói npm, schema giữ v16.

## Lỗi và nguyên nhân

Thêm sách mới với tên một sách đã có nhưng không thấy cảnh báo, và vẫn lưu được bình thường. Hai nguyên nhân, cả hai đã được tái hiện:

1. **Bỏ dấu kiểu cũ và kiểu mới bị coi là hai tên khác nhau.** "Hoà bình" và "Hòa bình", "Thuỷ" và "Thủy", "Khoá" và "Khóa" giống nhau khi đọc nhưng là chuỗi ký tự khác nhau. Cách gõ phụ thuộc thiết lập bộ gõ (Unikey, EVKey, bàn phím điện thoại), nên sách nhập ở máy khác hoặc import từ Obsidian dễ lệch với cách đang gõ.
2. **Lỗi khi kiểm tra bị bỏ qua im lặng.** Nếu server đang chạy là bản cũ, lệnh kiểm tra trùng nhận lỗi 400. Giao diện bỏ qua lỗi đó, nên không cảnh báo gì và vẫn cho lưu. Server cũ có thể vẫn chạy khi cửa sổ `mo-app.bat` trước lúc cập nhật chưa được tắt: `mo-app.bat` mới đã dựng lại giao diện, nhưng không khởi động được server vì cổng 4317 đang bận.

## Đã sửa

1. **So trùng bỏ qua vị trí dấu thanh.** "Hoà bình" và "Hòa bình" được coi là trùng. Vẫn phân biệt có dấu và không dấu: "Hòa" khác "Hoa", "Mẹ" khác "Me".
2. **Báo rõ khi không kiểm tra được.** Dưới ô tên hiện khung vàng "Không kiểm tra được tên sách có bị trùng hay không", kèm lý do và hướng dẫn đóng mọi cửa sổ `mo-app.bat` rồi mở lại. Lần bấm lưu đầu tiên bị chặn và có thông báo; bấm lưu lần nữa thì lưu.

## File thay đổi

- `server/services/itemService.js`: hàm `titleKey`.
- `client/src/components/books/BookFormDialog.jsx`: `titleKey` phía giao diện, phần hiện và xử lý lỗi khi kiểm tra.
- `server/tests/patch6-quotes.test.js`: thêm kiểm tra dấu thanh kiểu cũ/mới.
- `client/src/i18n/source.json`, `client/src/i18n/locales/{en,zh,ja,vi}.tsv`: 3 chuỗi mới.
- `DOC-PATCH-PHIEN-6.1.md`: tài liệu này.

## Cài đặt

1. **Đóng hết app:** tắt **mọi** cửa sổ `mo-app.bat` đang mở (kiểm tra thanh taskbar) và mọi tab app.
2. **Giải nén đè:** giải nén `patch-update-6.1-sua-canh-bao-trung-ten.zip` đè vào thư mục gốc dự án bằng 7-Zip, chọn ghi đè.
3. **Kiểm tra:** chạy `kiem-tra.bat`. Mong đợi 198 test pass, verify ĐẠT.
4. **Mở app:** chạy `mo-app.bat`. Nếu cửa sổ báo `EADDRINUSE`, vẫn còn server cũ đang chạy: đóng nó rồi chạy lại.
5. **Bản điện thoại:** chạy `trien-khai-pages.bat --skip-tests --skip-google`.

## Kiểm thử đã chạy

- `npm test`: 198/198 pass.
- `npm run verify`: acceptance 68/68.
- `npm run build:pwa`: build thành công.
- Chrome thật, đã chạy:
  - Sách có sẵn "Chiến tranh và hoà bình", gõ "chiến tranh và hòa bình": có cảnh báo đỏ, có popup khi bấm lưu.
  - Giả lập server trả lỗi 400: hiện khung báo lỗi; lần lưu đầu bị chặn; lần thứ hai thì lưu.

## Checklist nghiệm thu

1. Thêm sách với đúng tên một sách đã có: ô tên đỏ, hiện sách trùng. Nhấn Tab hoặc bấm Thêm vào kệ: popup hiện ra.
2. Gõ lại tên đó nhưng đổi kiểu bỏ dấu (ví dụ "oà" và "òa", "uỷ" và "ủy"): vẫn cảnh báo.
3. Không có khung vàng "Không kiểm tra được..." trong lúc dùng bình thường. Nếu khung này xuất hiện, chụp lại nội dung lỗi trong khung và gửi kèm.
