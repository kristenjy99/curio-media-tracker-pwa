# Bàn giao: Reading Tracker, tiếp tục từ Phase 5

Tài liệu này dùng để mở một cửa sổ chat mới và làm tiếp mà không mất bối cảnh. Khi mở chat mới, đính kèm file `reading-tracker-phase4.zip` (bản mới nhất) cùng tài liệu này.

## 1. Vai trò và quy tắc làm việc

Bạn là Senior Full-Stack Engineer kiêm Software Architect, tiếp tục xây một Reading Tracker local-first (Node.js + Express + SQLite `better-sqlite3`, React + Vite + Tailwind, sync sang Obsidian) cho người dùng trên Windows.

Các quy tắc sau giữ nguyên từ đầu dự án và bắt buộc:

- Làm tuần tự từng phase. Hết mỗi phase thì dừng, tóm tắt việc đã làm, đưa cách kiểm tra, và chờ người dùng gõ "approved" mới làm tiếp. Người dùng có thể yêu cầu điều chỉnh trong phase đang làm; làm xong điều chỉnh thì lại dừng chờ "approved".
- Mã nguồn hoàn chỉnh, không placeholder, không comment kiểu "// code ở đây".
- Trước khi giao: chạy `npm test` và `npm run verify` (kiểm tra end-to-end trong thư mục tạm), chụp ảnh giao diện bằng Playwright (Chromium có sẵn trong môi trường) để tự soát, rồi đóng gói zip, bỏ `node_modules`, `data`, `client/dist`.
- Người dùng không phải lập trình viên web: hướng dẫn kiểm tra bằng thao tác bấm, không bắt gõ lệnh. Kiểm tra tự động qua `kiem-tra.bat`, mở app qua `mo-app.bat` hoặc lối tắt Desktop.
- Khi một quyết định thiết kế ảnh hưởng tới cách người dùng làm việc và khó đổi về sau, hỏi trước bằng câu hỏi lựa chọn kèm phương án đề xuất. Việc rõ ràng thì làm luôn.
- Văn phong trả lời: tiếng Việt kỹ thuật tự nhiên, kiểu tài liệu kỹ thuật, không cảm xúc. Ý liên quan viết liền thành đoạn, chỉ dùng bullet cho danh sách ngang hàng. Phân biệt rõ cái đã kiểm chứng và cái là suy luận.
- Giao diện chỉ dùng tiếng Việt, chữ thường kiểu câu, không dùng nhãn viết hoa toàn bộ.

## 2. Quyết định đã chốt với người dùng

- **Sync Obsidian:**
  - Chạy thủ công bằng nút Sync, có bước xem trước (dry-run).
  - Mặc định một chiều app → Obsidian: app là nguồn dữ liệu duy nhất. File bị sửa trong Obsidian vẫn bị ghi đè, nhưng bản sửa được giữ thành `Tên.conflict-YYYYMMDD-HHmmss.md`. File không do app tạo thì bỏ qua.
  - Chế độ hai chiều vẫn có, là tuỳ chọn.
  - Chỉ dùng trên một máy tại một thời điểm, không khoá DB.
- **Cấu trúc file trong vault:**
  - Mỗi sách là một file `.md`, gồm frontmatter và phần thân là freeform note.
  - Đặt trong `<vault>/Reading Tracker/<thư mục thể loại>/`, mặc định `Fiction`, `Fanfiction`, `Nonfiction`, `Comics`. Có thể đổi tên hoặc tắt việc chia thư mục.
  - Property `rt_id` đứng đầu file làm định danh.
  - Tên file lấy từ tiêu đề và không tự đổi khi tiêu đề đổi, để link `[[...]]` không gãy. Riêng thư mục thì app tự chuyển file khi thể loại đổi (chỉ ở chế độ một chiều).
- **Template frontmatter theo từng thể loại:**
  - Dựng từ 3 note mẫu của người dùng, nằm trong `server/tests/fixtures/`: Howl's moving castle (Fiction), Tiếng lòng lặng thinh (Fanfiction), How to Take Smart Notes (Nonfiction).
  - Tên property viết hoa như `Author`, `Favorite?`, `FIN?`, `Series, PJ`. Giá trị bọc `[[...]]`, rating dạng `[[⭐⭐⭐⭐⭐]]`.
  - Có property `Category`.
  - Status ghi đúng chính tả `Finished`; khi đọc vẫn hiểu `Finshed`.
  - Ngày đọc: `Date started`/`Date finished` là của lượt gần nhất, `Reads` liệt kê mọi lượt re-read, `Year` tự tính.
  - Người dùng sửa template trong app: thêm, xoá, đổi tên, đổi thứ tự property, đổi kiểu, tạo trường riêng `custom:<slug>`, sửa phần thân mẫu.
- **Import:**
  - Goodreads CSV.
  - Notion CSV/JSON, có bước ghép cột.
  - Note Obsidian `.md` nhập một lần, không sửa file gốc. Thể loại lấy theo `Category`, không có thì đoán theo property đặc trưng của template, không đoán được thì dùng mặc định; người dùng đổi được ở bước xem trước.
- **Giao diện:**
  - Mỗi thể loại là một tầng kệ gỗ, gáy sách cuộn ngang. Rê chuột hoặc focus thì gáy mở ra thành bìa.
  - Có mèo ngồi trên kệ.
  - Tông chủ đạo xanh pastel; font Fraunces cho tiêu đề và Be Vietnam Pro cho nội dung.
  - Người dùng đổi được: tên app, 5 bảng màu sáng/tối, màu nhấn, font, cỡ chữ, ảnh nền và độ đậm của ảnh nền.
  - Ảnh gáy và ảnh bìa tải lên được cho từng sách.
  - Chế độ danh sách hiện đúng 5 cột: Tên sách, Tác giả, Thể loại, Ratings, Ngày review ("Chưa có" khi trống).
  - Ô ngôn ngữ là danh sách thả xuống, sửa danh sách trong Cài đặt → Ngôn ngữ.
- **Ảnh trong Obsidian (chốt ở Phase 4):**
  - Ảnh/file tải lên được chép vào `<thư mục sync>/_attachments/<tên file note>/`, mỗi sách một thư mục, app tự dọn file thừa vào `.trash`.
  - Moodboard, nhân vật, file đính kèm, playlist nhúng thành một mục cuối note giữa `%% rt-gallery ... %%` và `%% /rt-gallery %%`, tạo lại mỗi lần sync.
- **Nguồn chuẩn cho moodboard/playlist/file:** `reading_notes` (migration 007 đã bỏ 3 cột trùng ở `items`).

## 3. Trạng thái hiện tại (đã nghiệm thu Phase 1, 2, 2.5, 3; Phase 4 đã giao, chờ "approved")

**Kiểm thử:** 107 test (`npm test`) và 62 bước acceptance (`npm run verify`) đều đạt trên Linux. Các file `.bat` viết cho Windows. `tao-shortcut-desktop.bat` và `server/scripts/prepare.js` chưa được kiểm chứng trên Windows thật.

Toàn bộ kiến trúc, API, schema và quy ước code mô tả trong `README.md` của mã nguồn. Các điểm chính:

- ESM; model là factory `createXModel(db)`; service nhận `context` và gọi `context.services` lúc chạy; zod ở `req.valid`; lỗi dạng `{ error: { code, message, details[] } }`.
- Mỗi thay đổi schema là một migration mới (hiện tới 007); khi bump version phải sửa assert `schema_version` trong `server/tests/db.test.js`, `storage.test.js`, `server/scripts/acceptance.js`.
- Category `Visual/Comics` encode thành `Visual%2FComics` trong URL.

**Phase 4 đã làm:**
- Route `/books/:id` (`client/src/pages/BookDetailPage.jsx`, `components/detail/`): header (bìa lớn, % tiến độ, re-read, ngày đọc gần nhất, yêu thích, sửa), tab `note` / `card` / `log` trên URL.
- Note & Review: editor markdown tự viết (textarea + `marked` + `DOMPurify`), tự lưu; moodboard, nhân vật, file đính kèm, playlist nhúng. API `POST /items/:id/files?kind=moodboard|character|inline|attachment`.
- Thẻ thư viện: con dấu cho từng lượt; thêm/sửa/xoá, kể cả lượt chỉ biết năm. Sửa lỗi: lượt chỉ có `finish_year` giờ tính là đã đọc xong; xoá lượt mới nhất thì trạng thái tính lại theo lượt trước.
- Nhật ký đọc: `reading_logs.progress_applied` ghi phần đã cộng vào tiến độ; sửa/xoá log trả lại đúng phần đó.
- Sync ảnh: `server/services/obsidian/mediaLinks.js`; `items.obsidian_media_dir`, `sync_tombstones.obsidian_media_dir`; action mới `sync_media`, `trash_media`.

## 4. Phase 5 và bản đóng gói cuối

**Phase 5 (Module 3 Dashboard):**
- Tổng số sách đã đọc trong năm.
- Streak đọc liên tục, có icon vết chân mèo 🐾.
- Biểu đồ Recharts theo category, sau khi áp quy tắc.
- Heatmap kiểu GitHub.
- Tách số lượt First-read và Re-read.
- Đọc skill `dataviz` trước khi vẽ biểu đồ.

Hai quy tắc KPI chưa được người dùng xác nhận, phải hỏi trước khi code:
- Fanfic có `word_count` ≤ 80.000 bị loại hoàn toàn khỏi KPI, hay vẫn được tính ở một nhóm riêng.
- Manga/comics có > 60 volume thì cộng vào `Visual/Comics` hay vào Fiction.

Lượt đọc chỉ biết năm (`finish_year`) được tính vào năm đó.

**Bản đóng gói cuối** (đã đề xuất, người dùng muốn "click là chạy, có shortcut Desktop"):
- Thư mục chạy được mà không cần cài Node: kèm Node runtime portable, bản `better-sqlite3` cho win32-x64, giao diện dựng sẵn.
- Mở app không hiện cửa sổ đen (launcher `.vbs` hoặc `.exe` nhỏ).
- Nút "Tắt app" trong Cài đặt.
- Tự tạo lối tắt Desktop ở lần chạy đầu.
- Khó khăn đã biết: môi trường build chỉ có Linux và mạng giới hạn, nên cần kiểm tra trước khả năng tải Node win-x64 và prebuild `better-sqlite3`, hoặc dặn người dùng chạy một script đóng gói trên chính máy Windows.

## 5. Hạn chế đã biết

- Ảnh chèn trong nội dung note (`inline-*`) không tự xoá khi xoá khỏi nội dung (để Ctrl+Z vẫn khôi phục được); bị dọn khi xoá sách.
- Ảnh embed `![[...]]` trong note nhập từ vault (chưa tải lên app) hiện dạng nhãn trong phần xem trước, vì app không đọc vault.
- Trình phát playlist cần mạng.

- Bộ đếm cạnh mỗi trạng thái trên thanh lọc là tổng toàn thư viện, không đổi theo thể loại đang lọc.
- Ở chế độ một chiều, property người dùng tự thêm trong Obsidian bị ghi đè; bản cũ còn trong file `.conflict`.
- Ảnh bìa dạng link ngoài (Goodreads) cần có mạng mới hiện; không có mạng thì hiện bìa tự vẽ.
- Thư mục `notes/` trong storage hiện chưa dùng.

## 6. Câu mở đầu cho chat mới

> Tôi đính kèm `reading-tracker-phase4.zip` (mã nguồn tới Phase 4) và `HANDOFF-PHASE5.md`. Đọc kỹ tài liệu bàn giao và README, giải nén, chạy `npm install`, `npm test`, `npm run verify` để xác nhận trạng thái, sau đó bắt đầu Phase 5 theo đúng quy tắc trong tài liệu. Hỏi tôi hai quy tắc KPI trước khi code.
