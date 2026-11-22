# Patch update 6.3: script tự kiểm tra và sửa bản điện thoại (GitHub Pages)

Áp sau patch 6.2. Patch chỉ thêm 2 file mới (`kiem-tra-pages.bat`, `server/scripts/checkPages.js`) và tài liệu này. Không sửa code của app.

## Cách dùng

1. Giải nén đè `patch-update-6.3-kiem-tra-pages.zip` vào thư mục gốc dự án.
2. Bấm đúp `kiem-tra-pages.bat`.
3. Nếu script hỏi tên repo, nhấn Enter để dùng `curio-media-tracker-pwa`, hoặc gõ tên khác.
4. Khi có câu hỏi `(c/k)`, gõ `c` để đồng ý, `k` để bỏ qua.
5. Cuối cửa sổ có bảng **TỔNG KẾT**. Mỗi mục là một trong bốn trạng thái: ĐẠT, ĐÃ SỬA, CHÚ Ý, CÒN LỖI. Nếu còn lỗi, chụp toàn bộ cửa sổ gửi lại.

Tuỳ chọn khi chạy từ cửa sổ lệnh:

- `kiem-tra-pages.bat --chi-kiem`: chỉ kiểm tra và báo cáo, không sửa gì.
- `kiem-tra-pages.bat --repo <tên>`: kiểm một repo cụ thể.
- `kiem-tra-pages.bat --yes`: tự đồng ý mọi câu hỏi.

Chạy lại bao nhiêu lần cũng được. Bước nào đã đúng thì script bỏ qua.

## Script kiểm tra và sửa gì

1. **Công cụ:** máy đã có git và GitHub CLI (gh).
2. **Đăng nhập GitHub:**
   - Nếu chưa đăng nhập, script mở trình duyệt để đăng nhập.
   - Nếu thiếu quyền "workflow" (cần để đẩy file dựng app), script xin thêm quyền.
3. **Git trên máy:**
   - Đưa về nhánh main nếu đang ở nhánh khác.
   - Commit các thay đổi chưa commit, ví dụ file của patch vừa giải nén, vì GitHub chỉ dựng từ bản đã commit.
   - Chặn và dừng nếu lỡ có file dữ liệu, file build hoặc `.env` trong danh sách commit.
4. **Repo trên GitHub:**
   - Nếu origin trỏ tới repo không còn tồn tại (như `media-tracker` cũ), script hỏi repo muốn dùng, mặc định `curio-media-tracker-pwa`.
   - Nếu repo không có, script hỏi rồi tạo repo public mới, đồng thời nhắc chỗ khôi phục repo đã xoá.
   - Nhận ra repo đã đổi tên.
   - Repo đang Private: hỏi rồi chuyển sang Public, vì tài khoản miễn phí không chạy Pages cho repo riêng tư.
   - Báo nếu repo bị Archived.
5. **Liên kết origin:** trỏ origin về đúng repo.
6. **Mã nguồn trên GitHub:**
   - Đẩy lên nếu máy có bản mới hơn GitHub.
   - Nếu repo mới tạo đã có sẵn README/.gitignore/license, script hỏi rồi ghi đè bằng mã nguồn trên máy.
   - Nếu GitHub có commit khác không phải file tạo sẵn, script cảnh báo rõ là commit sẽ mất, rồi mới hỏi.
   - Đặt nhánh mặc định là main.
7. **GitHub Pages:** bật Pages và đặt nguồn là GitHub Actions.
8. **Client ID Google:** nếu repo chưa có `VITE_GOOGLE_CLIENT_ID`, script chép từ file `.env` trên máy. Không có thì báo: app vẫn chạy nhưng không đồng bộ Drive được.
9. **Lần dựng app:**
   - Script dựng lại khi chưa có lần dựng nào, lần gần nhất lỗi, lần gần nhất không phải bản mới nhất, hoặc vừa đặt Client ID. Sau đó theo dõi đến khi xong (3–5 phút).
   - Nếu dựng lỗi, script in 30 dòng cuối của bước lỗi và gợi ý nguyên nhân thường gặp: môi trường github-pages chặn nhánh main, Pages chưa bật, lỗi cài thư viện, test lỗi.
10. **Địa chỉ app:** mở thử địa chỉ app, thử lại trong tối đa 2 phút, và xác nhận đúng là trang của app.

Việc không hoàn tác được thì luôn phải hỏi trước: tạo repo, chuyển repo sang Public, ghi đè lịch sử trên GitHub. Dữ liệu sách không bao giờ được đẩy lên GitHub.

## Kiểm thử đã chạy

Môi trường của tôi không có quyền vào tài khoản GitHub của bạn. Vì vậy script được chạy với GitHub giả lập: một lệnh `gh` giả, và một repo git cục bộ thay cho github.com. Kết quả:

- **Mô phỏng đúng tình huống hiện tại:** origin trỏ `media-tracker` đã mất, repo `curio-media-tracker-pwa` chỉ có README, Pages chưa bật, chưa có Client ID, chưa dựng lần nào. Script đã:
  - chuyển sang repo mới;
  - commit;
  - đổi origin;
  - ghi đè README;
  - bật Pages;
  - chép Client ID;
  - dựng app thành công.
- **Chạy lại lần hai:** các mục đều ĐẠT.
- **Dựng lỗi do chặn nhánh:** script in log và chỉ đúng chỗ cần sửa.

**Chưa kiểm được:** chạy với GitHub thật, chạy trên Windows, và bước mở địa chỉ app (môi trường của tôi không truy cập được github.io).

## Nghiệm thu

1. Chạy `kiem-tra-pages.bat`. Bảng TỔNG KẾT không còn mục CÒN LỖI.
2. Mở `https://kristenjy99.github.io/curio-media-tracker-pwa/` trên điện thoại, app hiện kệ sách và có tab Trích dẫn.
3. Chạy lại `kiem-tra-pages.bat --chi-kiem`: tất cả ĐẠT.
