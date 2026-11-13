# Triển khai bản điện thoại (PWA) lên GitHub Pages

Tài liệu này là các bước làm lại từ đầu khi đổi máy, đổi tài khoản hoặc đổi repo. Bản Windows không liên quan tới các bước này: nó vẫn chạy bằng `mo-app.bat` như cũ.

Trong tài liệu, `<user>` là tên tài khoản GitHub, `<repo>` là tên repo. Địa chỉ app sau khi triển khai là `https://<user>.github.io/<repo>/`. Riêng repo tên đúng `<user>.github.io` thì app nằm ở gốc `https://<user>.github.io/`; workflow tự nhận ra trường hợp này.

## Cách nhanh: chạy `trien-khai-pages.bat`

Script này làm tự động các mục 1, 2, 3, 5 bên dưới và dẫn từng bước mục 4. Cần cài trước hai công cụ, mỗi máy một lần: Git for Windows (https://git-scm.com/download/win) và GitHub CLI (cmd: `winget install --id GitHub.cli`); cài xong mở lại cửa sổ.

Bấm đúp `trien-khai-pages.bat` ở thư mục dự án. Script lần lượt: kiểm tra công cụ, mở trình duyệt để đăng nhập GitHub (lần đầu), hỏi tên repo (Enter để dùng `media-tracker`), chạy `npm test` và `npm run verify`, commit (dừng nếu thấy file dữ liệu hay file build sắp bị đưa lên), tạo repo public, bật Pages, dẫn phần Google Cloud, đặt Client ID, push rồi chờ GitHub dựng app xong và mở địa chỉ app. Phần Google Cloud không làm bằng lệnh được: script in sẵn giá trị cần điền, mở từng trang khi bạn nhấn Enter, rồi chờ bạn dán Client ID (Enter để làm sau, chạy lại script lúc nào cũng được).

Chạy lại nhiều lần được, bước đã xong thì bỏ qua; lần sau muốn cập nhật app lên Pages cũng chỉ cần chạy lại. Tuỳ chọn (gõ trong cmd): `trien-khai-pages.bat --skip-tests` bỏ qua test cho nhanh, `--skip-google` bỏ qua phần Google, `--repo <tên>`, `--client-id <id>`, `--dry-run` chỉ in lệnh mà không chạy. Kiểm trên điện thoại (mục 6) vẫn phải tự làm.

Các mục dưới đây là cách làm bằng tay, dùng khi script dừng ở bước nào đó hoặc muốn hiểu script làm gì.

## 1. Đưa mã nguồn lên GitHub

Repo nên để **public**: GitHub Pages trên repo private cần gói trả phí (Pro/Team). Mã nguồn không chứa dữ liệu cá nhân vì `data/`, `*.sqlite`, `.env` đã nằm trong `.gitignore`; dữ liệu của bản điện thoại nằm trong trình duyệt của điện thoại, không bao giờ lên repo.

Nếu chưa có repo: tạo repo trống trên github.com (không tick tạo README), rồi trong thư mục dự án chạy trên cmd:

```
git init
git add .
git commit -m "Media tracker"
git branch -M main
git remote add origin https://github.com/<user>/<repo>.git
git push -u origin main
```

Trước lần commit đầu, chạy `git status` và kiểm là không có `node_modules`, `data`, file `.sqlite` hay `.env` trong danh sách.

## 2. Bật GitHub Pages theo kiểu GitHub Actions

Vào repo → **Settings → Pages → Build and deployment → Source**, chọn **GitHub Actions** (không chọn "Deploy from a branch"). Chỉ làm một lần cho mỗi repo.

## 3. Chạy workflow

Workflow nằm ở `.github/workflows/pages.yml`. Nó chạy mỗi khi push lên nhánh `main`, và chạy tay được ở tab **Actions → Deploy PWA to GitHub Pages → Run workflow** (có ô chọn bỏ qua `npm test` để chạy nhanh hơn). Các bước: `npm ci`, `npm test`, `npm run build:pwa` với `BASE_PATH=/<repo>/`, rồi đưa `client/dist-pwa` lên Pages.

Lần đầu push xong mà workflow báo lỗi ở bước deploy kiểu "Pages is not enabled" thì là chưa làm bước 2; làm xong bấm **Re-run jobs**. Khi xong, link app hiện trong ô `deploy` của lần chạy và ở Settings → Pages.

Nếu đổi tên repo: không cần sửa file nào, `BASE_PATH` lấy từ tên repo lúc chạy. Nhưng địa chỉ app đổi theo, nên app đã cài trên điện thoại phải cài lại, **và dữ liệu trên điện thoại không đi theo** (trình duyệt tách kho theo origin + đường dẫn cài đặt). Xuất file DB trước khi đổi tên. Đổi tài khoản GitHub thì origin đổi hẳn, cùng hệ quả.

## 4. Tạo OAuth Client trên Google Cloud (chuẩn bị cho Phiên 5)

Làm trên https://console.cloud.google.com bằng tài khoản Google sẽ dùng để chứa file đồng bộ.

1. **Tạo project**: thanh trên cùng → chọn project → New Project, đặt tên ví dụ `media-tracker`.
2. **Bật Drive API**: APIs & Services → Library → tìm "Google Drive API" → Enable.
3. **Màn hình đồng ý OAuth** (Google Auth Platform / OAuth consent screen): User type **External**; điền tên app, email hỗ trợ, email liên hệ. Ở phần Data access / Scopes thêm `https://www.googleapis.com/auth/drive.file` (app chỉ thấy file do chính nó tạo, không đọc được phần còn lại của Drive). Ở phần Audience / Test users thêm chính địa chỉ Gmail của bạn. Để ở trạng thái **Testing** là đủ cho dùng cá nhân; không cần gửi Google xét duyệt.
4. **Tạo Client**: Clients (hoặc Credentials → Create credentials → OAuth client ID) → Application type **Web application**.
   - **Authorized JavaScript origins**: `https://<user>.github.io` (chỉ origin, không có đường dẫn, không có dấu `/` cuối). Từ Phiên 5 bản Windows cũng đăng nhập Google để đồng bộ, nên thêm cả `http://localhost:4317` và `http://127.0.0.1:4317` (`mo-app.bat` mở bằng `127.0.0.1`, với Google đó là origin khác `localhost`). Thêm `http://localhost:4318` nếu muốn thử đăng nhập bằng `mo-app-dien-thoai.bat` trên máy tính.
   - **Authorized redirect URIs**: `https://<user>.github.io/<repo>/` (có dấu `/` cuối), và `http://localhost:4318/` nếu thêm localhost ở trên.
5. Bấm Create, chép **Client ID** (dạng `xxxx.apps.googleusercontent.com`). Google có thể hiện cả client secret: **không dùng, không chép vào đâu cả** — app chạy trong trình duyệt nên mọi thứ nằm trong bundle đều công khai, và luồng đăng nhập của Phiên 5 không cần secret.

Thay đổi origin/redirect bên Google có thể mất vài phút mới có hiệu lực.

## 5. Đưa Client ID vào bản build

Client ID không phải bí mật nhưng không viết cứng vào mã nguồn. Trên GitHub: repo → **Settings → Secrets and variables → Actions → tab Variables → New repository variable**, tên `VITE_GOOGLE_CLIENT_ID`, giá trị là Client ID. Dùng **Variables**, không phải Secrets (Secrets vẫn chạy được, nhưng không có lý do che giá trị vốn sẽ nằm công khai trong bundle). Sau đó chạy lại workflow (bước 3) để bản build mới có Client ID.

Khi build trên máy, đặt biến này trong file `.env` ở thư mục gốc dự án (`VITE_GOOGLE_CLIENT_ID=...`, xem `.env.example`) hoặc trong cmd: `set VITE_GOOGLE_CLIENT_ID=...` rồi `npm run build:pwa`.

Ở Phiên 4, mã nguồn mới chỉ có chỗ đọc giá trị này (`client/src/lib/googleConfig.js`); chưa có màn hình nào dùng tới, nên thiếu biến thì app vẫn chạy bình thường. Phiên 5 mới gắn nút đồng bộ.

## 6. Cài và kiểm tra trên điện thoại

Chỉ hỗ trợ Android (Chrome); iOS/Safari nằm ngoài phạm vi dự án. Phần này phải làm trên máy thật; ghi lại kết quả từng dòng (đạt / không đạt / ảnh chụp lỗi) để đưa vào handoff.

1. Mở `https://<user>.github.io/<repo>/` bằng Chrome. Mở lần đầu cần mạng.
2. Menu ⋮ → **Cài đặt ứng dụng** (hoặc "Thêm vào màn hình chính" → Cài đặt). Kiểm: biểu tượng trên màn hình chính đúng icon của app, tên "Media Tracker"; mở từ biểu tượng thì chạy **toàn màn hình**, không có thanh địa chỉ.
3. Trong app: thêm 1 sách có ảnh bìa tải lên từ máy, thêm 1 phim. Kiểm ảnh bìa hiện ở kệ sách và trang chi tiết.
4. **Lưu trữ bền**: vuốt tắt app khỏi đa nhiệm, mở lại từ biểu tượng → sách, phim, ảnh bìa còn nguyên. Khởi động lại điện thoại rồi kiểm lần nữa.
5. **Mở thẳng đường dẫn con**: đang ở trang một quyển sách thì kéo xuống để tải lại → vẫn đúng trang đó, không ra trang 404 của GitHub.
6. **Offline**: bật chế độ máy bay, mở app từ biểu tượng → app mở được, thấy dữ liệu và ảnh bìa đã có, thêm/sửa được sách. Tắt chế độ máy bay, mở lại → thay đổi lúc offline còn.
7. **Dải cảnh báo**: không được có dải cảnh báo lưu trữ ở đầu trang khi chỉ mở một cửa sổ. Nếu có, chụp lại nội dung.
8. Cài đặt → Dữ liệu → Xuất database → file về thư mục Tải xuống (Android không cho chọn nơi lưu; đây là giới hạn của Chrome).

## 7. Cập nhật app sau này

Push lên `main` là workflow tự build và đưa lên. Trên điện thoại, mở app khi có mạng; trang luôn lấy `index.html` mới từ mạng trước nên bản mới có hiệu lực từ lần mở đó hoặc lần mở kế tiếp. Không có bước sao lưu tự động trước khi migrate trên điện thoại như bản Windows, nên trước khi đẩy bản có migration mới, xuất file DB trên điện thoại.

## Gỡ rối nhanh

| Hiện tượng | Nguyên nhân thường gặp |
|---|---|
| Trang trắng, console báo 404 cho `/assets/...` ở gốc domain | Build sai `BASE_PATH`; chạy lại workflow, không build tay rồi upload |
| Tải lại trang con ra 404 của GitHub | Thiếu `404.html` trong bản build; `npm run build:pwa` tự tạo, kiểm `client/dist-pwa/404.html` |
| Workflow lỗi ở `deploy`: Pages chưa bật / không có quyền | Chưa làm bước 2 |
| Đăng nhập Google báo `origin_mismatch` / `redirect_uri_mismatch` (Phiên 5) | Origin/redirect ở bước 4 không khớp từng ký tự, hoặc vừa sửa chưa đủ vài phút |
| Đăng nhập Google báo app chưa được xác minh / bị chặn | Tài khoản chưa nằm trong Test users ở bước 4.3 |
