# Reading Tracker — Local-First

Đã có: Phase 1 (Express local server, SQLite `better-sqlite3`, migration, data models, REST API), Phase 2 (đổi thư mục lưu trữ khi đang chạy, Obsidian sync chạy thủ công) và Phase 2.5 (template frontmatter theo từng thể loại, sync một chiều mặc định). Phase 3 thêm giao diện React (Vite + Tailwind): kệ sách, bộ lọc, form thêm/sửa sách, import Goodreads/Notion, trang chỉnh template, cài đặt Obsidian và lưu trữ. Phase 4 thêm trang chi tiết sách (note & review, thẻ thư viện, nhật ký đọc) và chép ảnh sang vault Obsidian khi sync. Phase 5 thêm trang thống kê `/dashboard` và trường `warnings`.

## Yêu cầu

Node.js >= 22. `better-sqlite3` có prebuilt binary cho Windows/macOS/Linux; nếu máy không tải được prebuilt thì cần build tools (Windows: Visual Studio Build Tools với workload "Desktop development with C++"; macOS: `xcode-select --install`).

## Mở app (Windows)

Double-click `mo-app.bat`: lần đầu cài thư viện và dựng giao diện (1–2 phút), những lần sau chỉ làm lại khi mã nguồn đổi hoặc thư mục được chép từ máy khác (`server/scripts/prepare.js`). Server khởi động và tự mở trình duyệt ở `http://127.0.0.1:4317`. Giữ cửa sổ đen mở trong lúc dùng, đóng cửa sổ để tắt app. `tao-shortcut-desktop.bat` tạo lối tắt "Ke sach" trên Desktop (icon ở `assets/ke-sach.ico`). `kiem-tra.bat` chạy toàn bộ kiểm tra tự động trong thư mục tạm.

### Dùng trên máy khác

Chép cả thư mục `reading-tracker` (có thể bỏ `node_modules` cho nhẹ), cài Node.js v24 LTS trên máy đó, chạy `mo-app.bat`. Thư mục `data` chứa toàn bộ sách; muốn hai máy dùng chung dữ liệu thì chuyển thư mục lưu trữ vào Google Drive/OneDrive (Cài đặt → Lưu trữ), trên máy còn lại chọn cùng thư mục đó và bấm "Mở dữ liệu có sẵn ở đây". Không mở app trên hai máy cùng lúc. Đường dẫn vault Obsidian khác nhau giữa các máy, chọn lại trong Cài đặt → Obsidian.

## Chạy (dòng lệnh)

```bash
npm install
cp .env.example .env        # tuỳ chọn
npm run db:migrate          # tạo DB + schema
npm run db:seed             # dữ liệu mẫu (bỏ qua nếu DB đã có dữ liệu; dùng -- --force để ép)
npm run build && npm start  # giao diện + API cùng cổng, http://127.0.0.1:4317
npm run dev                 # chỉ server, có auto-reload
npm run dev:client          # giao diện có hot reload ở http://127.0.0.1:5173 (chạy song song với npm run dev)
npm test                    # unit + integration test, DB in-memory
npm run verify              # nghiệm thu tự động Phase 1 → 5 trong thư mục tạm (không đụng dữ liệu thật)
npm run check               # kiểm tra server đang chạy (chỉ các bước an toàn với dữ liệu thật)
```

## Thư mục lưu trữ

Thứ tự ưu tiên: biến `READING_TRACKER_STORAGE` > `storage_path` trong `~/.reading-tracker/config.json` > `./data`. Đổi thư mục từ app (`PUT /api/storage`) sẽ ghi vào `config.json`; nếu đang đặt `READING_TRACKER_STORAGE` thì app từ chối đổi (409) vì biến môi trường luôn thắng. Bên trong thư mục storage:

```
<storage>/
  db/reading-tracker.sqlite
  notes/      # file .md (Phase 2)
  uploads/    # ảnh moodboard, character, file đính kèm (Phase 4)
```

Nếu đặt storage trong Google Drive/OneDrive/Obsidian Sync, giữ `SQLITE_JOURNAL_MODE=DELETE` (mặc định) và không mở cùng một DB từ hai máy cùng lúc. Dịch vụ sync chỉ thấy file, không hiểu transaction của SQLite, nên ghi đồng thời từ hai máy có thể tạo conflict copy hoặc làm hỏng DB.

## Cấu trúc

```
server/
  index.js              # entrypoint: storage -> DB -> app.listen (bind 127.0.0.1)
  app.js                # createApp({ db }) — tách riêng để test với ':memory:'
  config/               # env, storage path, nạp .env
  db/                   # connection, migrator (PRAGMA user_version), migrations/
  models/               # truy cập dữ liệu, prepared statements, (de)serialize JSON
  services/             # business logic, transaction, đồng bộ trạng thái item
  controllers/          # HTTP handlers mỏng
  routes/api.js         # khai báo route + validator
  validators/           # zod schemas
  middleware/           # validate, error handler
  scripts/              # migrate, seed
  tests/                # node:test
client/src/components/  # dùng từ Phase 3
```

## API

Mọi lỗi trả về dạng `{ "error": { "code", "message", "details?" } }`.

| Method | Path | Mô tả |
|---|---|---|
| GET | `/api/health` | Kiểm tra server + DB |
| GET | `/api/system/info` | Schema version, journal mode, đường dẫn storage |
| GET / PATCH | `/api/sync-config` | Cấu hình Obsidian (`vault_path`, `sync_enabled`) |
| GET | `/api/tags` | Danh sách tag kèm số lần dùng |
| GET | `/api/items` | Danh sách + filter (xem bên dưới) |
| POST | `/api/items` | Tạo item (bắt buộc `title`, `main_category`) |
| GET | `/api/items/:id` | Chi tiết item kèm `library_cards` |
| PATCH | `/api/items/:id` | Cập nhật một phần |
| DELETE | `/api/items/:id` | Xoá, cascade cards/notes/logs |
| GET / POST | `/api/items/:itemId/library-cards` | Lượt đọc; `read_number` tự tăng |
| PATCH / DELETE | `/api/library-cards/:id` | Sửa / xoá lượt đọc (tự đánh số lại) |
| GET / PUT | `/api/items/:itemId/note` | Freeform note (upsert, giữ trường không gửi); ảnh/file bị bỏ khỏi gallery thì file trên đĩa bị xoá |
| POST | `/api/items/:id/files?kind=moodboard\|character\|inline\|attachment&name=` | Tải file cho note (body nhị phân), trả `{ src, name, mime_type, size_bytes }` |
| GET | `/api/dashboard?year=&today=` | Thống kê theo năm: `totals`, `short_fanfic`, `by_category` (First-read/Re-read), `streak`, `heatmap`; `today` chỉ để kiểm thử |
| GET / POST | `/api/reading-logs` | Log đọc theo ngày; `advance_progress: true` cộng vào `current_unit`, phần đã cộng lưu ở `progress_applied` |
| PATCH / DELETE | `/api/reading-logs/:id` | Sửa / xoá log; tiến độ được trả lại theo `progress_applied` |

Query của `GET /api/items`: `q`, `status`, `main_category`, `media_type` (nhận nhiều giá trị: `?status=Reading,TBR`), `tag` (lặp lại = AND), `release_year`, `release_year_from`, `release_year_to`, `read_year`, `is_favorite`, `sort` (`title|created_at|updated_at|release_year|rating|last_read_date`), `order` (`asc|desc`), `limit` (<= 500), `offset`.

Trường dẫn xuất trên mỗi item: `read_count`, `finished_read_count`, `reread_count`, `last_read_date`, `progress_percent`.

## Quy tắc đồng bộ trạng thái

Khi thêm hoặc sửa lượt đọc **mới nhất**: chưa xong thì item chuyển `Reading` (nếu là re-read vừa thêm thì `current_unit` về 0); đã xong thì item chuyển `Finished` và `current_unit = total_units`. "Đã xong" là có `finish_date`, hoặc lượt chỉ biết năm (`finish_year`, không có ngày nào). Lượt có ngày cụ thể thì `finish_year` bị bỏ. Xoá lượt mới nhất thì trạng thái tính lại theo lượt đứng trước. Sửa/xoá lượt cũ hơn không đổi trạng thái. Có thể PATCH item để ghi đè (ví dụ `DNF`).

## Đổi thư mục lưu trữ (Phase 2)

`POST /api/storage/inspect { path }` kiểm tra thư mục trước khi đổi: có ghi được không, đã có DB chưa (và schema version), có nằm trong Google Drive/OneDrive/Dropbox/iCloud không. `PUT /api/storage { path, mode }` thực hiện đổi:

- `mode: "copy"`: sao chép DB (qua SQLite backup API, nhất quán kể cả khi đang mở), `uploads/` và `notes/` sang thư mục mới. Thư mục đích không được có sẵn DB. Dữ liệu ở thư mục cũ giữ nguyên, tự xoá khi đã chắc chắn.
- `mode: "open"`: mở DB có sẵn ở thư mục mới (ví dụ thư mục Drive đã sync từ máy khác) và chạy migration nếu DB cũ hơn app.

App mở DB mới trước, thành công mới ghi `config.json`, rồi chuyển toàn bộ API sang DB mới mà không cần restart. `GET /api/fs/dirs?path=` liệt kê thư mục con để frontend dựng hộp thoại chọn folder (trình duyệt không cung cấp đường dẫn tuyệt đối). Server chỉ nhận request có Host là `127.0.0.1`/`localhost` để chặn DNS rebinding.

## Obsidian sync (Phase 2 + 2.5)

Cấu hình qua `PATCH /api/sync-config`: `vault_path` (thư mục vault, có `.obsidian`), `vault_subfolder` (mặc định `Reading Tracker`), `sync_enabled`, `sync_direction` (`app_to_obsidian` mặc định, hoặc `two_way`). Chạy bằng `POST /api/sync/run`, thêm `?dry_run=true` để xem trước mà không ghi gì.

Mỗi sách là một file `.md` trong `<vault>/<vault_subfolder>/`, dựng theo template của thể loại. Tên file lấy từ tiêu đề sách. Property `rt_id` ở đầu file là định danh để app nhận ra file kể cả khi bạn đổi tên hoặc di chuyển; đừng xoá hay sửa property này.

Chế độ một chiều (`app_to_obsidian`, mặc định): app là nguồn dữ liệu duy nhất.

| Tình huống | Kết quả |
|---|---|
| Sách mới hoặc đã sửa trong app | Ghi file |
| File bị sửa trong Obsidian | Lần sync sau app ghi đè, bản Obsidian lưu thành `Tên.conflict-YYYYMMDD-HHmmss.md` |
| File trong thư mục không do app tạo | Bỏ qua, không sửa, báo `ignored` |
| Xoá sách trong app | File chuyển vào `<thư mục sync>/.trash/` |
| Xoá file trong vault | App tạo lại file |
| Đổi template | Lần sync sau mọi file của thể loại đó được ghi lại theo template mới |

Chế độ hai chiều (`two_way`) nhận thêm thay đổi từ Obsidian: chỉ file đổi thì nhập vào app, cả hai cùng đổi thì bên sửa sau cùng thắng (bản thua lưu thành file `.conflict`), file mới có property `Category` được nhập thành sách mới và được chèn `rt_id`. File lỗi YAML hoặc thiếu `Category` bị bỏ qua kèm lý do.

### Template theo thể loại

`GET /api/templates` trả 4 template (Fiction, Nonfiction, Fanfiction, Visual/Comics) và danh mục trường. Template mặc định dựng từ 3 note mẫu trong `server/tests/fixtures/`; file app tạo ra cho 3 cuốn đó nằm ở `docs/sample-output/`. Mỗi property gồm:

- `key`: tên property trong Obsidian, ví dụ `Author`, `Favorite?`, `Series, PJ`.
- `field`: trường của app (xem `catalog.fields`) hoặc `custom:<tên>` cho trường riêng như `custom:series`, `custom:completion` (FIN?). Trường riêng lưu trong `items.custom_fields`.
- `format`: `text`, `number`, `date`, `checkbox`, `stars` (⭐⭐⭐⭐½), `reads` (lịch sử lượt đọc).
- `link`: bọc giá trị thành `[[...]]`. `list`: luôn ghi dạng danh sách.

Các trường tính sẵn: `read_years` (Year), `latest_start_date`/`latest_finish_date` (Date started/finished của lượt gần nhất), `reads` (mỗi lượt một dòng `#1 · 2024-02-01 → 2024-02-20 · ⭐⭐⭐⭐`), `read_count`, `reread_count`, `progress_percent`.

`PUT /api/templates/:category` lưu template (property trùng tên, thiếu property Thể loại chính, format không hợp trường đều bị chặn và báo đúng dòng). `POST /api/templates/:category/preview` xem trước file `.md`, nhận cả template chưa lưu và `item_id` của sách thật. `POST /api/templates/:category/reset` trở về mặc định. Category `Visual/Comics` phải encode thành `Visual%2FComics` trong URL. Xoá property khỏi template không xoá dữ liệu trong app.

Trạng thái luôn được ghi đúng chính tả (`Finished`); khi đọc file, app vẫn hiểu `Finshed`, `to read`, `currently reading`, `abandoned`...

Ảnh và file đính kèm: xem mục Phase 4 bên dưới.

## Giao diện (Phase 3)

Mã nguồn ở `client/src`: `pages/` (Kệ sách, Cài đặt), `components/bookshelf` (tầng kệ, gáy sách, bộ lọc, danh sách), `components/books` (form thêm/sửa/xoá), `components/import`, `components/sync`, `components/settings` (Obsidian, template, lưu trữ, chọn thư mục), `components/ui` (nút, ô nhập, hộp thoại...). Bộ lọc nằm trên URL nên có thể lưu bookmark hoặc tải lại trang mà không mất.

Import nhận Goodreads CSV (ánh xạ cột sẵn, kệ `read`/`to-read`/`currently-reading` thành trạng thái, `Read Count` thành số lượt đọc, `My Review` vào lượt đọc gần nhất), Notion CSV (đoán cột theo tên, bỏ link `notion.so` trong relation, hiểu cột ngày dạng `September 8, 2025 → September 14, 2025`) và CSV/JSON tự làm. Các bước: phân tích file (`POST /api/import/analyze`), xem trước kèm lỗi từng dòng và sách trùng (`/preview`, không ghi gì), rồi ghi (`/commit`, bỏ qua sách trùng theo tên + tác giả).

### Bổ sung trong Phase 3

- **Tự tìm vault Obsidian**: `GET /api/obsidian/vaults` đọc `obsidian.json` (Windows `%APPDATA%\obsidian`, macOS `~/Library/Application Support/obsidian`, Linux `~/.config/obsidian`) để liệt kê vault Obsidian đã mở; Cài đặt → Obsidian có nút "Dùng vault này" và hướng dẫn tự tìm đường dẫn.
- **Import note Obsidian (.md)**: chọn file hoặc cả thư mục. Thể loại lấy theo property `Category`; không có thì đoán theo property đặc trưng của template (Fandom/Ships → Fanfiction, Volumes → Truyện tranh); còn lại dùng thể loại mặc định, đổi được từng note ở bước xem trước. Property đọc theo template, nội dung note thành ghi chú, `Date started/Date finished` thành lượt đọc, các năm trong `Year` không có ngày thành lượt đọc chỉ biết năm (`library_cards.finish_year`). File gốc không bị sửa. API: `POST /api/import/markdown/preview` và `/commit` với `{ files: [{ path, content }], default_category, overrides }`.
- **Ảnh bìa và ảnh gáy sách**: `PUT /api/items/:id/images/cover|spine` (body là file ảnh, kiểm tra định dạng theo nội dung file: JPG, PNG, WebP, GIF, AVIF, tối đa 15MB), `DELETE` để bỏ ảnh. Ảnh lưu ở `<storage>/uploads/items/<rt_id>/`, phục vụ qua `/media/...`, đi theo khi đổi thư mục lưu trữ, bị xoá khi xoá sách. Giao diện thu nhỏ ảnh còn cạnh dài 1600px trước khi tải lên; gáy có ảnh thì rộng theo tỉ lệ ảnh.

### Cài đặt giao diện và danh sách

`GET/PATCH /api/settings` lưu `languages` (danh sách cho ô Ngôn ngữ) và `appearance` (`preset`: moss/ocean/rose/lavender/slate, `accent` #RRGGBB, `display_font`, `body_font`, `font_size` 13–20, `background_opacity` 0–1) trong bảng `app_settings`, nên đi theo thư mục lưu trữ. Ảnh nền: `PUT/DELETE /api/settings/background`, lưu ở `uploads/app/`. `POST /api/settings/appearance/reset` trở về mặc định. Font đều có bộ chữ tiếng Việt và được đóng gói sẵn, chạy được khi không có mạng.

`items.review_date` (migration 005) là trường chính; dữ liệu `custom_fields.review_date` cũ và template đã lưu được chuyển sang tự động. Chế độ xem danh sách hiện Tên sách, Tác giả, Thể loại, Ratings, Ngày review.

### Thư mục theo thể loại và tên app

Sync đặt mỗi sách vào thư mục con theo thể loại trong thư mục sync: mặc định `Fiction/`, `Fanfiction/`, `Nonfiction/`, `Comics/` (`obsidian_sync_config.category_folders`, `folder_names`, migration 006; đổi tên hoặc tắt trong Cài đặt → Obsidian). Ở chế độ một chiều, file nằm sai thư mục (sync từ trước khi bật tính năng, vừa đổi thể loại, vừa đổi tên thư mục) được chuyển sang đúng chỗ (`move_file`), giữ nguyên tên file; nếu file đã bị sửa trong Obsidian thì bản đó được giữ thành `.conflict` ở thư mục mới. Thư mục con trống sau khi chuyển được xoá. Ở chế độ hai chiều, app chỉ đặt file mới vào thư mục thể loại, không di chuyển file người dùng đã tự sắp xếp.

Tên app (`settings.general.app_name`, mặc định "Kệ sách") đổi trong Cài đặt → Giao diện, hiện ở thanh trên cùng và tiêu đề tab trình duyệt.

## Phase 4: trang chi tiết sách

Bấm vào sách trên kệ hoặc trong danh sách mở `/books/:id`: tiêu đề serif lớn, bìa lớn, tiến độ, số lần re-read, ngày đọc gần nhất, nút yêu thích và nút sửa thông tin. Ba tab (`?tab=note|card|log`):

- **Note & Review**: editor markdown (textarea + thanh công cụ, xem trước bằng `marked` + `DOMPurify`, hiểu `[[link]]`, `==highlight==`, `%%comment%%` kiểu Obsidian), tự lưu sau khi ngừng gõ khoảng 1 giây. Dán/kéo ảnh vào ô soạn để chèn ảnh. Moodboard (ảnh + chú thích, dán bằng Ctrl+V, kéo thả, hoặc link), gallery nhân vật (tên, ảnh, chú thích), file/link đính kèm (tối đa 50MB), playlist Spotify/YouTube/Apple Music/SoundCloud phát ngay trong trang (trình phát chỉ tải khi bấm phát, cần mạng).
- **Thẻ thư viện**: mỗi lượt đọc một dòng kèm con dấu; thêm, sửa, xoá lượt đọc, kể cả lượt chỉ nhớ năm.
- **Nhật ký đọc**: ghi log theo ngày (số trang/chương đã đọc hoặc "đọc tới trang", số phút), mặc định cộng vào tiến độ; sửa/xoá log thì tiến độ được trả lại. Có nút bắt đầu lượt đọc và đánh dấu đọc xong khi tới trang cuối.

Migration 007 gộp trùng lặp: `items.moodboard_urls`, `items.playlist_url`, `items.file_links` chuyển vào `reading_notes.moodboard_images`, `playlist_links`, `attached_files` rồi bị bỏ. Property template `Playlist (link)` và `Moodboard (ảnh)` vẫn dùng được, giá trị lấy từ note và chỉ ghi ra file.

File của note lưu ở `<storage>/uploads/items/<rt_id>/` (`moodboard-*`, `character-*`, `inline-*`, `files/<mã>/<tên gốc>`). `/media` chỉ mở trong trình duyệt các file ảnh raster, âm thanh, video, PDF; file khác luôn tải xuống (`Content-Disposition: attachment`, CSP sandbox) để file HTML/SVG tải lên không chạy được script.

### Ảnh trong Obsidian

Khi sync, mọi file `/media/...` mà file `.md` nhắc tới được chép vào `<thư mục sync>/_attachments/<tên file note>/` và ghi thành link vault: `Cover: "[[Reading Tracker/_attachments/Howl's Moving Castle/cover-....webp]]"`, ảnh chèn trong nội dung thành `![[...|alt]]`. Tên thư mục chọn ở lần sync đầu có ảnh (trùng thì thêm ` (2)`), lưu ở `items.obsidian_media_dir` và không đổi khi đổi tiêu đề.

Moodboard, nhân vật, file đính kèm và playlist được ghi thành một mục ở cuối note, nằm giữa `%% rt-gallery ... %%` và `%% /rt-gallery %%`. App tạo lại mục này mỗi lần ghi file; ở chế độ hai chiều mục này bị bỏ qua khi nhập, link vault của ảnh được đổi ngược về file trong app.

App quản lý `_attachments/<tên>`: file thiếu hoặc khác kích thước thì chép lại, file không còn được dùng (ảnh đã bỏ trong app, hoặc file người dùng tự thả vào) chuyển vào `.trash/_attachments/...`; xoá sách thì cả thư mục ảnh vào `.trash`. File `.md` trong `_attachments` không được coi là note.

## Phase 5: thống kê và warnings

Trang `/dashboard` (menu "Thống kê") tính theo lượt đọc đã xong (`library_cards`): lượt có `finish_date` tính vào năm của ngày đó, lượt chỉ biết năm (`finish_year`) tính vào năm đó. `read_number = 1` là First-read, còn lại là Re-read. Streak đếm ngày liên tiếp có ít nhất một dòng `reading_logs`; hôm nay chưa ghi log thì chuỗi vẫn giữ đến hết ngày. Heatmap là các ngày trong năm, màu theo số log trong ngày.

Quy tắc nhóm thống kê (`server/services/dashboardService.js`):

- Fanfiction có `word_count` ≤ 80.000 vào nhóm riêng "Fanfic ngắn", hiện ở biểu đồ nhưng không cộng vào tổng KPI. Không có số chữ thì tính Fanfiction thường.
- Sách ghi thể loại Fiction nhưng `media_type` là Manga/Manhwa/Manhua/Comic/Webtoon và `volume_count` > 60 được tính vào Visual/Comics.

Migration 008 thêm `items.warnings` (mảng JSON). Nhập được ở form sửa sách của Fiction và Fanfiction, hiện màu đỏ ngay dưới thể loại ở trang chi tiết. Trường có trong danh mục template (`warnings`) nên thêm được vào file Obsidian qua Cài đặt → Template; template mặc định chưa có property này.

## Lịch đọc, thống kê mở rộng, mục tiêu và fun spreads (migration 009)

**Nguồn dữ liệu chung.** Mỗi lượt đọc là một dòng `library_cards`; `server/services/readingsService.js` là chỗ duy nhất đọc chúng ra dạng "reading" cho lịch (`GET /api/readings`), thống kê (`GET /api/dashboard` → `stats`) và mục tiêu (`GET /api/goals`), nên ba nơi không thể lệch số. Migration 009 sinh một lượt #1 (chưa có ngày) cho mỗi sách Đang đọc/Đã đọc/Bỏ dở chưa có lượt nào; sách TBR chưa đọc nên không có lượt. `itemService` giữ quy tắc này cho sách tạo hoặc đổi trạng thái về sau.

**Quy tắc tính.**
- Trạng thái lượt: `dnf` nếu là lượt mới nhất của sách có status DNF; `finished` nếu có `finish_date`, chỉ có `finish_year`, hoặc là lượt mới nhất của sách Finished chưa ghi ngày; còn lại `reading`. Chỉ lượt mới nhất mang trạng thái DNF (hạn chế đã biết).
- Năm của lượt = năm `finish_date` (sách xuyên năm gán theo ngày xong), không có thì `finish_year`, không có nữa thì không thuộc năm nào và không vào thống kê/lịch theo năm (được đếm ở mục "Chưa đặt lên lịch được" và "Dữ liệu thiếu").
- Re-read là một lượt riêng, tính ở ngày xong của lượt đó; rating của lượt, thiếu thì lấy rating của sách; số trang là `total_units` khi đơn vị là trang, thiếu thì không cộng vào tổng trang; số giờ là tổng `minutes_spent` trong nhật ký đọc của năm.
- Thống kê dùng cùng quy tắc KPI cũ (loại fanfic ngắn ≤ 80.000 chữ). Genre là `tags` của sách, mỗi sách đếm một lần cho từng genre. Trung bình rating theo thể loại/format/tác giả chỉ hiện khi nhóm có ít nhất 5 sách đã chấm điểm.
- Mục tiêu: kế hoạch tuyến tính theo số ngày đã qua; mức cần đạt mỗi tháng/tuần = phần còn lại chia thời gian còn lại; trạng thái vượt/đúng/chậm kế hoạch (đúng nếu chênh dưới 1% mục tiêu).
- TBR → đã đọc chỉ đếm từ khi có cột `items.from_tbr` (đặt khi sách rời TBR), không suy ngược dữ liệu cũ.

**Giao diện:** `/calendar` (lịch tháng/cả năm), `/goals/:tab` (mục tiêu năm, challenge, TBR, yêu thích tháng, book bracket), phần mới ở cuối `/dashboard`, cột Tags trong chế độ danh sách của kệ sách. Nhãn trạng thái TBR hiển thị là "TBR" (trước là "Muốn đọc"). Test mới: `server/tests/phase6.test.js`.

## Series, danh sách chọn giá trị đã nhập (migration 012)

Trang `/series` (tab lớn "Series") gom sách và media theo tên series, không phân biệt hoa thường: sách lấy từ trường riêng `custom:series` (property `Series` / `Series, PJ` của template, link `[[...]]` được bỏ ngoặc, giá trị dạng danh sách thì sách thuộc mọi series trong đó), media lấy từ `media_items.series_name`. Thứ tự lưu ở bảng `series_positions (series_key, source, item_id, position)` trong DB sách; phần chưa có thứ tự đứng sau, theo năm rồi theo tên. Trang có bộ lọc Books/Medias/Cả hai, lọc theo thể loại sách hoặc loại media (series phải có ít nhất một phần thuộc loại đó), và ở Books có chế độ xem Tác giả: mỗi tác giả kèm các sách, số đã đọc, điểm trung bình (`GET /api/authors`, tách tác giả theo dấu phẩy như thống kê). API: `GET /api/series`, `PUT /api/series/order { name, entries: [{ source: 'book'|'media', id }] }` (entries là toàn bộ phần theo thứ tự mới).

`GET /api/items/pairings?fandom=A&fandom=B` trả pairing kèm số sách, chỉ tính sách có đủ các fandom đã cho; bộ lọc Pairing ở kệ Fanfiction và gợi ý Ship/pairing trong form dùng API này. `GET /api/items` nhận thêm `topic` (lặp lại = AND), dùng cho nút lọc Chủ đề ở kệ Nonfiction; ô Chủ đề trong form sửa sách Nonfiction có danh sách thả xuống. `GET /api/items/facets` có thêm `topics`, `formats` (nền tảng/định dạng theo thể loại) và `custom_values` (giá trị đã nhập của từng trường riêng, ví dụ `completion` cho FIN?). Ô Nền tảng, Fandom, Pairing, Genres và các trường riêng dạng chữ trong form sửa sách có danh sách thả xuống các giá trị đã nhập, vẫn gõ được giá trị mới.

Thống kê: bỏ mục Năm xuất bản; bảng Pairing và các bảng điểm trung bình hiện 5 dòng nhiều nhất, phần còn lại sau nút "Xem thêm"; bảng Fandom hiện tất cả; biểu đồ genre hiện 5 genre nhiều nhất, các genre trong "Khác" xem được bằng "Xem thêm".

## Làm sạch dữ liệu và tags theo thể loại

Cài đặt → Dữ liệu: đặt/đổi mật khẩu (lưu dạng scrypt + salt ở `app_settings.security`, không trả về qua `GET /api/settings`) và nút xoá toàn bộ dữ liệu. API: `GET /api/data/status`, `PUT /api/data/password { current_password?, new_password }`, `POST /api/data/wipe { password }`. Thao tác xoá mọi dòng của `items`, `library_cards`, `reading_notes`, `reading_logs`, `goals`, `challenges`, `challenge_slots`, `monthly_favorites`, `brackets`, `series_positions`, `sync_tombstones` và `media_items`; giữ `app_settings`, `obsidian_templates`, `obsidian_sync_config` và ảnh nền. Tombstone cũng bị xoá nên lần sync sau không chuyển file trong vault vào `.trash`. Trước khi xoá, DB sách và DB media được chép (SQLite backup API) và `uploads/items`, `media/uploads` được chuyển vào `<storage>/backups/truoc-khi-xoa-<thời điểm>/`. Quên mật khẩu thì không xoá được qua app.

`GET /api/items/tags?category=` trả tag trong một thể loại chính; nút lọc Tags ở kệ sách và gợi ý Genres trong form dùng theo thể loại đang chọn.

## Trang chi tiết media và sync media (media migration 7, migration 013)

Route `/media/:id`, tab `note` (Note & Review, dùng chung `NoteTab` với sách; hàm tải file truyền qua `NoteUploadContext`) và `card` (thẻ lượt xem). Trường mới của `media_items`: `youtube_channel`, `cast_members`, `studios`, `platforms`, `episodes_per_season` (mảng số tập theo season, `null` = chưa biết), `language`, `trailer_url`, `warnings`, `topics` (chỉ hiện ở YouTube). `GET /api/media/items/values` trả giá trị đã nhập cho các ô chọn.

`media_watch_cards`: mỗi lượt xem có `season` (null = cả bộ), thời gian theo tháng/năm hoặc chỉ năm (`start_year/start_month/finish_year/finish_month`), `rating`, `note`. Số lượt (`watch_number`) và số lần xem của season (`season_watch_number`) tính khi đọc, theo thời điểm bắt đầu. Có lượt xem thì `start_year`/`finish_year` của media tự lấy theo các lượt (thống kê dùng hai cột này). Migration 7 tạo sẵn lượt #1 cho media đã có năm xem. API: `GET/POST /api/media/items/:id/watch-cards`, `PATCH/DELETE /api/media/watch-cards/:id`, `GET/PUT /api/media/items/:id/note`, `POST /api/media/items/:id/files?kind=`.

Sync Obsidian: `server/services/obsidian/mediaSync.js`, chạy cùng nút Sync sau phần sách, luôn một chiều. File ở `<vault>/<media_subfolder>/<TV Series|Movies|Animation|YouTube|Short Dramas>/<tên>.md` (`media_subfolder` mặc định `Media Tracker`, rỗng = tắt; chia thư mục theo `category_folders`), một template chung (`renderMediaNote`), ảnh/file vào `<media_subfolder>/_attachments/<tên note>/`. File sửa trong Obsidian bị ghi đè, bản sửa giữ thành `.conflict`; media xoá thì file vào `.trash` qua `media_sync_tombstones`. Kết quả sync đánh dấu `scope: 'media'`. Nếu thư mục media nằm trong thư mục sync sách, phần sách bỏ qua thư mục đó khi quét.

Server chỉ phục vụ file tải lên ở `/media/items/...` và `/media/app/...`; các đường dẫn `/media`, `/media/stats`, `/media/<id>` là trang giao diện (trước đây tải lại trang Medias bị 404).

## Đồ trang trí kệ sách

Cài đặt → Giao diện → Đồ trang trí kệ sách. File PNG/SVG (tối đa 3MB; SVG nhận diện theo thẻ `<svg>` ở đầu file) lưu ở `uploads/app/ornaments/`, danh sách ở `app_settings.ornaments = { enabled, per_shelf, items: [{ id, name, src, enabled, size: sm|md|lg }] }`. API: `POST /api/settings/ornaments?name=` (body là file), `DELETE /api/settings/ornaments/:id`, `PATCH /api/settings { ornaments }` (chỉ sửa enabled/per_shelf và name/enabled/size/thứ tự của từng món, không đổi `src`). SVG được phục vụ kèm `Content-Security-Policy: sandbox` nên mở trực tiếp không chạy được script; trên kệ chỉ hiển thị qua `<img>`. Vị trí trên kệ do `client/src/lib/ornaments.js` chọn ngẫu nhiên theo hạt giống lưu trong sessionStorage; nút "Xếp lại đồ trang trí" đổi hạt giống. Làm sạch dữ liệu và khôi phục giao diện mặc định không xoá đồ trang trí.

## Theme tự tạo

Cài đặt → Giao diện → Màu chủ đề → "Tạo theme mới". Mỗi theme lưu ở `app_settings.themes = [{ id: 'custom-…', name, light, dark }]`, mỗi chế độ 7 màu hex: `paper`, `surface`, `ink`, `moss`, `sage`, `honey`, `walnut`. Các biến còn lại (`surface-2`, `ink-muted`, `line`, `on-moss`, `walnut-dark`, `walnut-light`) do `deriveColors` trong `client/src/lib/appearance.js` suy ra; `on-moss` chọn màu có tương phản cao nhất với `moss`. Dùng theme bằng `appearance.preset = <id>`; xoá theme đang dùng thì server đặt lại `preset = 'moss'`. Bản tối có thể sinh từ bản sáng (`autoDarkColors`). Editor cảnh báo khi tương phản chữ/nền dưới 4.5 hoặc chữ trên nút chính dưới 3. Theme đang dùng được lưu kèm trong localStorage để áp màu trước khi tải xong cài đặt. Màu nhấn tuỳ chỉnh vẫn áp lên trên theme.

## Đa ngôn ngữ giao diện, độ spicy, kho fandom & cặp đôi

Ngôn ngữ giao diện (`app_settings.general.ui_language`: `vi` | `en` | `zh` | `ja`, chọn ở Cài đặt → Giao diện) được áp bằng `client/src/i18n/translator.js`: một MutationObserver thay chữ trong text node và các thuộc tính `placeholder`, `aria-label`, `title`, `alt` theo bảng dịch, nên component không phải bọc `t()`. Chuỗi nguồn là tiếng Việt trong mã, liệt kê ở `client/src/i18n/source.json` (sinh tự động bằng cách quét JSX/chuỗi có dấu và chuỗi trong thuộc tính giao diện, cộng một số service server có chuỗi hiện ở dashboard/template). Bảng dịch là `client/src/i18n/locales/<lang>.tsv`, mỗi dòng `mã<TAB>bản dịch`, mã là FNV-1a của chuỗi nguồn (`i18n/hash.js`). `vi.tsv` chỉ chứa các chuỗi cần đổi sang từ thuần Việt. Chuỗi có `{0}`, `{1}` là mẫu; mẫu có chữ cố định ngắn (dưới 8 chữ cái) chỉ áp cho chữ hiển thị khi phần thay đổi là số hoặc là một từ có trong bảng dịch, để không dịch nhầm nội dung người dùng. Vùng `translate="no"` (phần xem trước markdown) không bị dịch. Khi thêm chuỗi giao diện mới, sinh lại `source.json` rồi thêm dòng dịch theo mã mới; chuỗi chưa có bản dịch hiện nguyên tiếng Việt. Nội dung người dùng nhập, file Obsidian và thông báo lỗi trả về từ server không dịch.

Độ spicy: `items.spice_rating` (migration 014, 0–5 bước 0,5), chỉ hiện ở sách có tag `smut` (không phân biệt hoa thường). Thống kê: `stats.spice` và `by_scope[*].spice` (phân bố 1–5 ớt, trung bình theo thể loại/format/tác giả, chỉ tính lượt đọc của sách có tag smut); mục Đánh giá trên dashboard có bộ lọc Sao / Độ spicy. Template Obsidian có trường `spice_rating` với định dạng `chilis` (🌶️🌶️🌶️½), thêm vào template trong Cài đặt nếu muốn ghi ra vault.

Kho fandom & cặp đôi: `app_settings.fandom_library = [{ fandom, pairings }]`, sửa ở Cài đặt → Template. `GET /api/items/fandom-pairings` trả `{ fandom: [pairing] }` từ dữ liệu sách. Form sửa fanfic: đã chọn fandom thì ô Ship / pairing chỉ gợi ý pairing của các fandom đó (kho + sách); chưa chọn thì gợi ý toàn bộ. Ô Tropes có danh sách thả xuống (`facets.tropes`).
