# Patch update 6.4: sửa lỗi "database trong bộ nhớ" trên điện thoại khi app mở ở hai nơi

Áp sau patch 6.3. Patch chỉ sửa bản điện thoại (PWA): không có migration, bản Windows không đổi hành vi.

## Lỗi

Mở app trên điện thoại thì hiện cảnh báo "Thiết bị này chưa lưu được dữ liệu lâu dài, app đang chạy với database trong bộ nhớ", lý do `createSyncAccessHandle ... another open Access Handle`.

## Nguyên nhân (đã tái hiện)

Bản điện thoại lưu dữ liệu bằng cơ chế chỉ cho **một** cửa sổ giữ file database tại một thời điểm. Khi app mở ở hai nơi cùng lúc, ví dụ tab Chrome vẫn chạy ngầm sau khi bấm "Cài đặt ứng dụng" rồi mở thêm app từ màn hình chính, cửa sổ mở sau không lấy được file. App lúc đó chuyển sang chạy tạm trong bộ nhớ. Dữ liệu đã lưu không mất; chỉ phiên tạm đó là không lưu được.

Đã tái hiện bằng bản cũ trên Chrome với hai tab cùng mở app: tab thứ hai hiện đúng thông báo trên.

Khi đọc mã thư viện SQLite, tôi phát hiện thêm một rủi ro. Khi không lấy được file, thư viện mặc định thử **xoá thư mục database** để dọn dẹp. Thường việc xoá thất bại vì file đang bị khoá, nhưng nếu cửa sổ kia nhả file đúng lúc đó thì dữ liệu trên điện thoại có thể bị xoá. Patch này tắt hẳn hành vi đó.

## Đã sửa

1. **Cửa sổ mở sau lấy quyền.** Khi mở app ở cửa sổ hoặc tab mới, cửa sổ cũ tự dừng dùng database và hiện màn hình "App đang được mở ở cửa sổ khác", kèm nút **Dùng app ở cửa sổ này** để giành lại quyền. Cửa sổ mới dùng dữ liệu bình thường.
2. **Chờ cửa sổ cũ nhả file.** Nếu file còn bị giữ, app thử lại trong khoảng 9 giây thay vì chuyển ngay sang chạy trong bộ nhớ. Trường hợp này cũng xảy ra khi tải lại trang.
3. **Không bao giờ xoá thư mục database khi mở lỗi** (đặt `preserveOnInitFailure`).
4. **Thông báo rõ khi vẫn bị khoá.** Sau khi đã chờ mà vẫn không lấy được file, thanh vàng báo rõ app đang mở ở nơi khác, dặn không nhập gì, và có nút **Thử lại**.

Lưu ý: nếu cửa sổ cũ đang ghi dở đúng lúc bị dừng, lần ghi dở đó bị huỷ (SQLite tự hoàn tác). Dữ liệu đã lưu trước đó không bị ảnh hưởng.

## File thay đổi

- `server/platform/browserConnection.js`: thử lại khi file bị giữ; không xoá thư mục database khi mở lỗi.
- `client/src/lib/workerTransport.js`: cơ chế "nhường quyền" giữa các cửa sổ qua BroadcastChannel; hàm `onSuperseded`.
- `client/src/lib/transport.pwa.js`, `client/src/lib/transport.js`: export `onSuperseded`. Bản Windows để trống.
- `client/src/components/layout/StorageWarning.jsx`: màn hình "đang mở ở cửa sổ khác" và thông báo riêng khi bị khoá.
- `client/src/i18n/source.json`, `client/src/i18n/locales/{en,zh,ja,vi}.tsv`: 5 chuỗi mới.

## Cài đặt

1. Giải nén đè `patch-update-6.4-pwa-mot-cua-so.zip` vào thư mục gốc dự án.
2. Chạy `kiem-tra-pages.bat`. Script tự commit patch, đẩy lên GitHub và dựng lại app.
3. Trên điện thoại:
   - Đóng hết app và Chrome trong màn hình đa nhiệm. Nếu vẫn còn chạy, vào Cài đặt → Ứng dụng → Chrome → Buộc dừng.
   - Mở app bằng biểu tượng trên màn hình chính.
   - Đóng rồi mở lại một lần nữa để chắc chắn đã nhận bản mới.

## Kiểm thử đã chạy

- `npm test`: 205/205. `npm run verify`: 68/68. Build bản Windows và bản điện thoại đều thành công.
- **Bản PWA build thật, chạy trên Chrome thật (hồ sơ có OPFS, giống điện thoại):**
  - Tab A thêm sách.
  - Mở tab B: B dùng được dữ liệu (thấy sách), không có cảnh báo; A hiện màn hình "đang mở ở cửa sổ khác".
  - Bấm nút ở A: A lấy lại quyền, vẫn thấy sách; B chuyển sang màn hình chắn.
  - Đóng B, tải lại A: không cảnh báo, dữ liệu còn.
  - Không có lỗi trang.
- **Bản cũ, cùng thao tác:** tab B hiện đúng lỗi bạn gặp.

Chưa kiểm được: Chrome trên Android thật, cụ thể là app cài trên màn hình chính chạy song song với tab Chrome.

## Nghiệm thu

1. Mở app từ màn hình chính: không có thanh vàng cảnh báo, dữ liệu đầy đủ.
2. Trong lúc app đang mở, mở thêm địa chỉ app bằng một tab Chrome. Tab mới dùng được bình thường. Quay lại app thì thấy màn hình "App đang được mở ở cửa sổ khác".
3. Bấm "Dùng app ở cửa sổ này": app dùng lại bình thường, dữ liệu không mất.
