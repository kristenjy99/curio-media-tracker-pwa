# Patch update 6.6: kiểu xem Lưới bìa cho kệ sách

Áp sau patch 6.5. Chỉ sửa giao diện, không có migration. Áp dụng cho cả bản Windows lẫn bản điện thoại.

## Tính năng

- Ở trang Kệ sách, nút chọn kiểu hiển thị (góc phải, cạnh ô sắp xếp) có thêm kiểu thứ ba: **Lưới bìa** (biểu tượng 4 ô vuông), nằm giữa **Kệ sách** và **Danh sách**. Dùng được với mọi thể loại (Tất cả, Fiction, Fanfiction, Nonfiction, Truyện tranh) và kết hợp với mọi bộ lọc, sắp xếp.
- Sách được chia nhóm theo trạng thái (Đang đọc, Đã đọc, Muốn đọc, Bỏ dở) như kiểu Kệ sách. Mỗi nhóm hiện số lượng và có nút **Thêm vào kệ này**.
- Mỗi thẻ gồm:
  - ảnh bìa tỉ lệ 2:3, bo góc nhẹ (khoảng 8 px), có bóng mờ; di chuột vào thì thẻ nhấc lên nhẹ;
  - tên sách (tối đa 2 dòng), tác giả và số sao;
  - biểu tượng trái tim ở góc bìa nếu sách được đánh dấu yêu thích.
- Sách chưa có ảnh bìa hiện bìa màu, có tên sách và tác giả.
- Thanh **Cỡ bìa** chỉnh độ rộng bìa từ 96 đến 220 px. App nhớ cỡ đã chọn trên từng máy.
- Trên điện thoại, lưới luôn có ít nhất 2 cột.
- Kiểu xem được lưu trên địa chỉ trang (`view=grid`). Mở một sách rồi quay lại thì vẫn ở Lưới bìa.
- Dùng được bằng bàn phím: Tab để chọn sách, Enter để mở.

Phim ảnh vốn đã có kiểu lưới riêng nên không đổi.

## File thay đổi

- `client/src/components/bookshelf/GridView.jsx` (mới).
- `client/src/components/bookshelf/FilterBar.jsx`: thêm nút Lưới bìa.
- `client/src/pages/BookshelfPage.jsx`: hiển thị kiểu `grid`.
- `client/src/i18n/source.json`, `client/src/i18n/locales/{en,zh,ja}.tsv`: thêm chuỗi "Lưới bìa".

## Cài đặt

1. Giải nén đè vào thư mục dự án.
2. Chạy `kiem-tra.bat`.
3. Mở app.
4. Nếu dùng bản điện thoại: chạy `kiem-tra-pages.bat`.

## Kiểm thử đã chạy

- Build giao diện thành công.
- Chrome thật với 8 sách mẫu (5 sách có ảnh bìa, 3 sách không có ảnh, có sách tên rất dài, có sách yêu thích):
  - Lưới hiện đủ 7 sách Fiction, chia 3 nhóm.
  - Góc bìa bo 7,5 px.
  - Enter mở đúng sách; quay lại vẫn ở Lưới bìa.
  - Khung 390 px (điện thoại) hiện 2 cột.
  - Không có lỗi console.

## Nghiệm thu

1. Kệ sách → bấm biểu tượng 4 ô vuông: sách hiện dạng lưới bìa bo góc, chia nhóm theo trạng thái.
2. Kéo thanh Cỡ bìa: bìa to hoặc nhỏ theo. Tải lại trang thì cỡ bìa vẫn giữ.
3. Bấm một bìa thì mở trang sách. Quay lại thì vẫn ở Lưới bìa.
4. Trên điện thoại: hiện 2 cột, cuộn mượt.
