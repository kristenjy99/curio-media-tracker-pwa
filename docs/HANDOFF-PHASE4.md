# Bàn giao: Reading Tracker, tiếp tục từ Phase 4

Tài liệu này dùng để mở một cửa sổ chat mới và làm tiếp mà không mất bối cảnh. Khi mở chat mới, đính kèm file `reading-tracker-phase3.zip` (bản mới nhất) cùng tài liệu này.

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

## 3. Trạng thái hiện tại (đã nghiệm thu Phase 1, 2, 2.5, 3)

**Kiểm thử:** 93 test (`npm test`) và 56 bước acceptance (`npm run verify`) đều đạt trên Linux. Các file `.bat` được viết cho Windows. `mo-app.bat` và `kiem-tra.bat` đã được người dùng chạy được trên Windows ở các phiên bản trước. `tao-shortcut-desktop.bat` và luồng `server/scripts/prepare.js` (bỏ qua cài/dựng khi không đổi) chưa được kiểm chứng trên Windows thật.

**Cấu trúc:**
- `server/`
  - `config/`: env, storage path, `~/.reading-tracker/config.json`.
  - `db/`: kết nối, migrator dùng `PRAGMA user_version`, migrations 001–006.
  - `models/`, `services/`, `controllers/`, `routes/api.js`, `validators/` (zod 4), `middleware/` (validate, errorHandler, hostGuard chống DNS rebinding).
  - `scripts/`: migrate, seed, acceptance, verify, prepare.
  - `tests/`.
- `server/services/obsidian/`
  - `markdown.js`: tách và dựng frontmatter.
  - `vaultFs.js`: ghi atomic, retry khi Windows khoá file, chuyển vào `.trash`, chuyển file, dọn thư mục trống.
  - `obsidianSyncService.js`: lập kế hoạch rồi thực thi.
  - `templates/`: `catalog.js` (danh mục trường), `defaults.js`, `codec.js` (render/parse theo template), `templateService.js`.
  - `vaultDiscovery.js`: đọc `obsidian.json` để liệt kê vault.
- `server/services/import/`: `importService.js` (CSV/JSON có ghép cột), `markdownImport.js`, `valueParsers.js` (ngày, rating, danh sách ở nhiều dạng).
- `server/services/`: `imageService.js` (ảnh bìa và gáy, kiểm tra định dạng theo nội dung file), `settingsService.js` (`general`, `languages`, `appearance`, ảnh nền), `storageService.js` (đổi thư mục lưu trữ, hoán DB khi đang chạy).
- `client/src/`: `pages/` (Bookshelf, Settings), `components/{bookshelf,books,import,sync,settings,layout,ui}`, `lib/` (api, appearance, images, labels, utils), `hooks/queries.js` (TanStack Query).
- Gốc project: `mo-app.bat`, `kiem-tra.bat`, `tao-shortcut-desktop.bat`, `assets/ke-sach.ico`, `docs/sample-output/`.

**Schema SQLite:**
- `items`: các trường theo spec, cộng thêm:
  - `unit_type`, `current_unit`, `is_favorite`
  - `pairings`, `fandoms`, `tropes`, `topics`
  - `custom_fields` (JSON), `obsidian_extra`
  - `sync_uid`, `obsidian_path`, `sync_db_hash`, `sync_file_hash`
  - `spine_image`, `review_date`
- `library_cards`: `read_number` liên tục, `finish_year` cho lượt chỉ biết năm.
- `reading_notes`: `content_markdown`, `moodboard_images`, `character_images`, `attached_files`, `playlist_links`.
- `reading_logs`
- `obsidian_sync_config`: `vault_path`, `vault_subfolder`, `sync_direction`, `sync_enabled`, `category_folders`, `folder_names`.
- `sync_tombstones`
- `obsidian_templates`
- `app_settings`

**API chính** (đều có tiền tố `/api`):
- **Hệ thống:** `GET /health`, `GET /system/info`.
- **Sách:**
  - `GET/POST /items`, `GET /items/facets`, `GET/PATCH/DELETE /items/:id`.
  - `PUT/DELETE /items/:id/images/cover|spine`: body là file ảnh nhị phân.
  - `GET /tags`.
- **Lượt đọc:** `GET/POST /items/:itemId/library-cards`, `PATCH/DELETE /library-cards/:id`.
- **Ghi chú:** `GET/PUT /items/:itemId/note`.
- **Log đọc:** `GET/POST /reading-logs`, `PATCH/DELETE /reading-logs/:id`.
- **Sync Obsidian:**
  - `GET/PATCH /sync-config`, `GET /sync/status`.
  - `POST /sync/run?dry_run=true`.
  - `GET /obsidian/vaults`.
- **Template:**
  - `GET /templates`, `GET/PUT /templates/:category`.
  - `POST /templates/:category/reset`, `POST /templates/:category/preview`.
  - Category `Visual/Comics` phải encode thành `Visual%2FComics`.
- **Import:** `POST /import/analyze|preview|commit`, `POST /import/markdown/preview|commit`.
- **Lưu trữ:** `GET /storage`, `POST /storage/inspect`, `PUT /storage`, `GET /fs/dirs`.
- **Cài đặt:**
  - `GET/PATCH /settings`, `POST /settings/appearance/reset`.
  - `PUT/DELETE /settings/background`.
- **Ảnh:** phục vụ qua `/media/items/<rt_id>/...` và `/media/app/...`, từ thư mục `uploads` của storage hiện tại.

**Quy ước code:**
- ESM.
- Model là factory `createXModel(db)`. Service nhận `context` và truy cập `context.services` lúc gọi (lazy) để tránh phụ thuộc vòng.
- Validator zod đặt ở `req.valid`.
- Lỗi theo dạng `{ error: { code, message, details[] } }`, trong đó `details.path` dùng để gắn lỗi vào đúng ô trên giao diện.
- Mỗi thay đổi schema là một migration mới; không sửa migration cũ.
- Khi schema đổi version, cập nhật các assert `schema_version` trong `server/tests/db.test.js`, `storage.test.js` và `server/scripts/acceptance.js`.

## 4. Phase 4 cần làm

Theo spec gốc (Module 2) và các việc đã hẹn với người dùng:

1. **Trang chi tiết sách** `/books/:id`, mở khi bấm vào sách trên kệ hoặc trong danh sách. Hiện tại bấm vào sách chỉ mở form sửa. Bố cục tham khảo video người dùng gửi: tiêu đề serif lớn bên trái, bìa lớn bên phải.
   - Header: bìa, meta, % tiến độ, số lần re-read, ngày đọc gần nhất, trạng thái yêu thích, nút sửa thông tin (mở `BookFormDialog`).
2. **Tab Freeform Note & Review:**
   - Editor markdown có xem trước. Chọn thư viện editor gọn, chạy offline.
   - Dán hoặc tải ảnh moodboard và gallery nhân vật (tên, ảnh, chú thích).
   - Đính kèm file và link.
   - Widget phát nhanh playlist Spotify/YouTube dạng embed.
   - Dữ liệu dùng các cột sẵn có của `reading_notes`. Cần gộp trùng lặp: `items.moodboard_urls` với `reading_notes.moodboard_images`, `items.playlist_url` với `reading_notes.playlist_links`. Chọn một nguồn chuẩn và migrate.
3. **Tab Vintage Library Card:** thẻ thư viện giấy cổ điển, mỗi lượt đọc là một con dấu (Read #1, #2...).
   - Nút "Thêm lượt đọc mới".
   - Sửa và xoá lượt đọc (API đã có, chưa có giao diện), kể cả lượt chỉ biết năm (`finish_year`).
4. **Ghi log đọc hằng ngày** (trang/chương, phút) trên trang chi tiết. Phase 5 cần dữ liệu này cho streak và heatmap, mà hiện chưa có giao diện nhập.
5. **Ảnh trong Obsidian:**
   - Hiện ảnh bìa, gáy và moodboard tải lên chỉ là đường dẫn nội bộ `/media/...` trong file `.md`, Obsidian không hiển thị được.
   - Đã hẹn xử lý ở Phase 4: khi sync, chép ảnh vào một thư mục attachments trong vault (ví dụ `Reading Tracker/_attachments/`), ghi `Cover` thành đường dẫn vault, và nhúng moodboard bằng `![[...]]`.
   - Nên hỏi người dùng muốn để ảnh ở đâu và có nhúng moodboard vào phần thân hay không.

## 5. Phase 5 và bản đóng gói cuối

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

## 6. Hạn chế đã biết

- Bộ đếm cạnh mỗi trạng thái trên thanh lọc là tổng toàn thư viện, không đổi theo thể loại đang lọc.
- Ở chế độ một chiều, property người dùng tự thêm trong Obsidian bị ghi đè; bản cũ còn trong file `.conflict`.
- Ảnh bìa dạng link ngoài (Goodreads) cần có mạng mới hiện; không có mạng thì hiện bìa tự vẽ.
- Thư mục `notes/` trong storage hiện chưa dùng.

## 7. Câu mở đầu cho chat mới

> Tôi đính kèm `reading-tracker-phase3.zip` (mã nguồn đã nghiệm thu tới Phase 3) và `HANDOFF-PHASE4.md`. Đọc kỹ tài liệu bàn giao, giải nén mã nguồn, chạy `npm install`, `npm test`, `npm run verify` để xác nhận trạng thái, sau đó bắt đầu Phase 4 theo đúng quy tắc trong tài liệu. Câu nào cần tôi quyết định thì hỏi trước khi code.
