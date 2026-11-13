# HANDOFF — Media tracker trên Android (PWA) + Windows

Cập nhật: cuối PHIÊN 5.

## Mục tiêu chung

Chạy song song trên Windows (Node.js + better-sqlite3) và Android (PWA trên trình duyệt, không APK/Capacitor, hosted trên GitHub Pages). Dữ liệu lưu cục bộ trên từng thiết bị, đồng bộ thủ công qua Google Drive bằng nút "Đồng bộ".

## Các điều đã chốt

Lõi DB chuyển sang async: interface `Db` gồm `all / get / run / exec / transaction` (thêm `pragma`, `backup`, `close`, `open`, `raw` là phần phụ thuộc nền tảng), mọi phương thức trả về Promise. Interface **không có `prepare()`**: câu SQL truyền vào từng lần gọi, lớp Db tự giữ cache prepared statement theo chuỗi SQL. Lý do: trên PWA, SQLite WASM đặt trong Web Worker (bắt buộc với OPFS) chỉ cho phép prepare bất đồng bộ, nên model không thể prepare sẵn lúc khởi tạo như better-sqlite3.

Mọi truy cập DB đi qua một Mutex nên được tuần tự hoá. Lý do: better-sqlite3 đồng bộ, nhưng khi tầng trên là async thì giữa hai lần `await` có thể chen vào request khác; nếu request đó ghi trong lúc một transaction đang mở thì câu ghi rơi vào transaction của người khác vì dùng chung một connection. Thao tác phát sinh từ **bên trong** transaction được nhận biết qua `AsyncLocalStorage` và chạy thẳng, không xin mutex (nếu xin sẽ tự khoá chính nó). Transaction lồng nhau dùng `SAVEPOINT` nên lỗi lớp trong không huỷ lớp ngoài. `AsyncLocalStorage` là API của Node nên `createAsyncDb` nhận `scope` từ ngoài (Phiên 3): bản Node truyền `createNodeScope` (`server/db/scope.node.js`, dùng `AsyncLocalStorage`), bản PWA truyền `createSerialScope` (`server/db/scope.browser.js`, một biến đơn). Biến đơn chỉ đúng khi mỗi thời điểm có đúng một request đang xử lý, nên worker API xếp hàng message và chỉ nhận request kế tiếp sau khi request hiện tại trả lời xong — đó là điều kiện đúng đắn, không phải tối ưu.

Migration vẫn chạy **đồng bộ** trên handle better-sqlite3 gốc, ngay lúc mở DB, trước khi app nhận DB. App chỉ thấy interface async. Test migration vì vậy dùng `openDatabase(...).db.raw`.

FileStore trừu tượng hoá đọc/ghi file người dùng tải lên: `write / read / exists / remove / removeDir / resolve`, mọi phương thức trả về Promise, đường dẫn truyền vào là đường dẫn tương đối kiểu URL (dấu `/`) theo gốc của store nên không phụ thuộc hệ điều hành. Bản Node quy chiếu về `<storage>/uploads`. Bản PWA lưu cùng những đường dẫn đó trong IndexedDB (`server/storage/browserFileStore.js`) mà không sửa tầng service; hai store dùng chung một IndexedDB, tách nhau bằng tiền tố (`''` cho sách, `media/` cho media) nên key phản ánh đúng cây `<storage>/` và `<storage>/media/` của bản Windows.

`imageService.toLocalPath` giữ **đồng bộ** có chủ ý: đó chỉ là phép tính đường dẫn, và nơi dùng nó (`createMediaMapper` trong đồng bộ Obsidian) vốn chỉ chạy trên Node.

DB Medias (`server/media/**`) đã chuyển sang async ở Phiên 2, dùng chung `createAsyncDb`. `context.mediaDb` giờ là interface async, không còn là handle better-sqlite3 thô; `seriesService`, `dataService`, `mediaSync` đều await khi đọc media DB. Phần tải ảnh/file của media cũng đã đi qua FileStore (`context.mediaFileStore`, gốc là `<storage>/media/uploads`).

Route được tách thành bảng khai báo `{ method, path, handler, validate?, rawBody? }`: `server/routes/routeTable.js` cho sách và `server/media/routeTable.js` cho media. Trên Node, `server/http/expressAdapter.js` gắn bảng vào một Express Router; `routes/api.js` và `media/routes.js` chỉ còn vài dòng adapter. Trên PWA, `server/http/dispatch.js` gọi thẳng handler trong trình duyệt với cùng bảng đó và trả về `{ status, headers, body }`.

Handler vẫn giữ dạng `(req, res)` có chủ ý. Lý do: `res` trong dispatcher là một đối tượng nhỏ chỉ thu lại kết quả (`status`, `type`, `location`, `set`, `json`, `send`, `end`) chứ không gửi gì đi, nên không phải viết lại toàn bộ controller để thêm nền tảng mới. Thứ tự các dòng trong bảng chính là thứ tự dò route, nên dòng cụ thể phải đứng trước dòng có tham số: `/items/facets` trước `/items/:id`.

Phần parse đầu vào và phần đổi lỗi thành response đã tách khỏi Express để hai lớp vận chuyển dùng chung: `server/http/validateInput.js` (`applyValidation`) và `toErrorResponse` trong `server/middleware/errorHandler.js`. Nhờ vậy dispatcher trả về đúng cùng dạng lỗi như khi chạy qua Express.

Route phục vụ file ảnh (`/media/...` của sách, `/api/media/files/...` của media) **không** nằm trong bảng route: đó là việc của lớp vận chuyển (`express.static` trên Node, Service Worker đọc IndexedDB trên PWA), không phải của handler.

## Trạng thái các phiên

| Phiên | Phạm vi | Trạng thái |
|---|---|---|
| 1 | Db async + FileStore (interface & bản Node) + DB Sách async + sửa 2 test fail + test mở DB v14 | **Xong** |
| 2 | DB Medias async + bảng route khai báo + Express adapter + migration v15 (`sync_uid`, `updated_at`, `tombstone`, sao lưu trước khi migrate) | **Xong** |
| 3 | PWA cục bộ (SQLite WASM + FileStore trình duyệt + Service Worker + Manifest + Vite base path) | **Xong** |
| 4 | GitHub Pages & hướng dẫn triển khai + OAuth Client Google Cloud | **Xong phần mã nguồn**; tạo repo, OAuth Client và kiểm trên điện thoại do người dùng làm theo `docs/TRIEN-KHAI-GITHUB-PAGES.md` |
| 5 | Đồng bộ Google Drive bằng nút bấm tay, quy tắc A (cả quyển), gộp ba chiều theo `sync_uid` / hash / `updated_at` / `sync_deletions`, bản chụp trước đồng bộ, khôi phục, ghi đè Drive | **Xong phần mã nguồn**; đăng nhập Google thật và chạy trên điện thoại do người dùng kiểm theo `DOC-PATCH-PHIEN-5.md` |
| 6 | Màn hình xử lý xung đột + tombstone xoá + hash file ảnh + hoàn thiện | Chưa làm |

## Schema v15: định danh cho đồng bộ

Để gộp dữ liệu giữa hai thiết bị, mỗi bản ghi người dùng cần ba thứ: `sync_uid` (định danh không phụ thuộc id tự tăng, vì cùng một bản ghi có id khác nhau trên hai máy), `updated_at` (biết bên nào mới hơn khi cùng bản ghi bị sửa hai nơi) và dấu đã xoá (nếu không ghi lại việc xoá thì lần gộp sau sẽ thấy bên kia còn bản ghi đó và làm thứ đã xoá sống lại).

Migration `015_sync_identity` dựng sẵn ba thứ đó và **chưa** quyết định cách gộp. Quy tắc gộp — gộp cả quyển sách như một đơn vị, hay gộp từng dòng — được chốt ở Phiên 5 và không cần đổi schema thêm lần nữa. Đây là lựa chọn có chủ ý để Phiên 5 không bị schema ép vào một hướng.

`sync_uid` được thêm cho `library_cards`, `reading_logs`, `reading_notes`, `goals`, `challenges`, `challenge_slots`, `brackets`, `monthly_favorites`, `series_positions`, `obsidian_templates` (`items` đã có từ migration 002). `updated_at` được thêm cho `challenges`, `challenge_slots`, `brackets`, `monthly_favorites`, `series_positions`, `app_settings`. Bảng mới `sync_deletions(table_name, sync_uid, deleted_at)` ghi dấu khi xoá, tách khỏi `sync_tombstones` vì sync Obsidian đọc rồi xoá sạch bảng đó sau mỗi lượt, còn dấu cho Drive phải sống tới khi mọi thiết bị đã nhận.

Cách làm trong SQLite: `ALTER TABLE ... ADD COLUMN` không nhận giá trị mặc định động, nên cột mới được thêm ở dạng cho phép NULL rồi điền cho các dòng đã có bằng UPDATE. Bản ghi tạo mới sau này được trigger `AFTER INSERT` điền `sync_uid`, và `updated_at` của các bảng mà code chưa tự ghi được trigger `AFTER UPDATE` bơm hộ — nhờ vậy **tầng model không phải sửa gì**. SQLite mặc định tắt `recursive_triggers` nên UPDATE trong trigger không tự gọi lại chính nó.

`app_settings` dùng `key` làm định danh (ổn định giữa các máy) nên không cần `sync_uid`; trigger xoá ghi `key` vào `sync_deletions`. Không đồng bộ: `obsidian_sync_config` (đường dẫn vault là thiết lập riêng của từng máy — có test chốt điều này), `sync_tombstones` và chính `sync_deletions`.

DB media có migration 8 tương ứng: `sync_uid` cho `media_watch_cards` và `media_notes` (`media_items` đã có), cộng bảng `media_sync_deletions`. Schema media đi từ v7 lên **v8**, độc lập với `user_version` của DB sách.

## Sao lưu tự động trước khi migrate

`server/db/backup.js` được gọi ngay trước khi mở DB để migrate. Nếu file DB đã tồn tại và schema của nó thấp hơn bản mới nhất, hàm tạo một bản sao đầy đủ rồi mới để migration chạy. Lý do: migration sửa cấu trúc dữ liệu thật, nếu sai thì không còn đường lùi; và vì file DB có thể nằm trong thư mục Google Drive nên không thể trông vào bản sao của dịch vụ sync.

Dùng `VACUUM INTO` thay vì copy file thô: câu này tạo bản sao nhất quán ở mức SQLite, gộp cả phần chưa checkpoint, và chạy đồng bộ nên đặt được vào luồng mở DB (khác với `db.backup()` là async). Lỗi khi sao lưu được ném ra để chặn migration — thà không mở được DB còn hơn migrate mà không có bản lùi.

Bản sao nằm ở `<storage>/backups/truoc-khi-migrate-v<từ>-v<đến>-<thời điểm>-reading-tracker.sqlite`, và `<storage>/media/backups/...` cho DB media. App không bao giờ tự xoá thư mục này. Đường dẫn bản sao được trả về trong `migration.backup_path` (null khi không cần sao lưu).

## Kiến trúc bản PWA (Phiên 3)

Toàn bộ DB và dispatcher nằm trong **một Web Worker** do trang sở hữu (`client/src/worker/apiWorker.js`), không nằm trong Service Worker. Lý do: Service Worker bị hệ thống dừng bất kỳ lúc nào, mà VFS `opfs-sahpool` giữ khoá độc quyền trên file DB và một transaction đang mở sẽ chết theo. Trang gửi `{ id, method, path, query, body, headers }` vào worker và nhận lại `{ status, headers, body }` — đúng dạng `createDispatcher` của Phiên 2 trả về, nên handler không phải sửa một dòng nào. Worker **xếp hàng** message: xử lý xong request này mới nhận request kế tiếp; đây là điều kiện để `createSerialScope` đúng (xem mục trên), không phải để tiết kiệm.

VFS là `opfs-sahpool`, không phải `opfs`: VFS `opfs` đòi header COOP/COEP mà GitHub Pages không cho đặt, nên hướng đó chết ngay từ Phiên 4. `opfs-sahpool` không cần `SharedArrayBuffer`, bù lại **chỉ một tab được giữ DB tại một thời điểm**; tab thứ hai rơi về DB trong bộ nhớ và giao diện hiện dải cảnh báo (`client/src/components/layout/StorageWarning.jsx`) thay vì im lặng làm mất dữ liệu. Không dùng được OPFS (chế độ ẩn danh, trình duyệt cũ) cũng xử lý như vậy.

`server/platform/sqliteWasm.js` bọc `sqlite3.oo1.DB` thành handle có cùng bề mặt với better-sqlite3 (`prepare` → statement có `reader/pluck/all/get/run`, cộng `exec`, `pragma`, `transaction` đồng bộ, `inTransaction`, `unsafeMode`, `close`). Nhờ vậy **migration chạy đồng bộ ngay lúc mở DB y như trên Node**, dùng lại nguyên `server/db/migrator.js` và toàn bộ `server/db/migrations/**`, và `createAsyncDb` không phải biết mình đang bọc engine nào. Hai khác biệt đã biết: `unsafeMode()` là no-op (WASM không chặn sửa `sqlite_master` nên migration 011 vẫn chạy), và `backup(path)` không có — muốn lấy file DB thì dùng `exportBytes` (`sqlite3_js_db_export`).

Một điểm phải cẩn thận khi sửa code dùng chung: **SQLite WASM báo lỗi ràng buộc (CHECK, FOREIGN KEY) ở `reset()`, không phải ở `step()`**. Vì vậy `sqliteWasm.js` không dọn statement trong `finally`; nếu đang có lỗi khác lan ra thì lỗi của `reset()` bị bỏ qua để giữ nguyên nguyên nhân gốc.

Bundle cho trình duyệt được dựng bằng hai thủ pháp. Thứ nhất, module Node được thay lúc build (alias trong `vite.config.js`): `node:path` và `node:crypto` có bản viết lại cho trình duyệt (`server/platform/shims/`), `node:url` trả chuỗi vô hại, còn `node:fs`, `node:os`, `node:child_process` thành chốt chặn ném lỗi **khi bị gọi** chứ không ném lúc import — vì bảng route là một file duy nhất nên bản PWA vẫn import tĩnh controller của những tính năng chỉ chạy trên Windows. Thứ hai, những dòng route đó được gắn cờ `nodeOnly: true` và bị lọc khỏi dispatcher của trình duyệt, nên gọi vào sẽ nhận 404 thay vì lỗi "fs không tồn tại". Danh sách có test chốt (`phase3-data-export.test.js`): `/sync-config` (GET, PATCH), `/obsidian/vaults`, `/sync/status`, `/sync/run`, `/storage` (GET, PUT), `/storage/inspect`, `/fs/dirs`, `/system/desktop-shortcut`. Giao diện cũng ẩn các mục tương ứng theo `IS_PWA`: tab Obsidian và tab Lưu trữ trong Cài đặt, nút Sync Obsidian ở thanh trên, nút tạo lối tắt Desktop.

`Buffer` toàn cục được nạp bằng polyfill (`client/src/worker/bufferGlobal.js`, import đầu tiên trong worker) vì tầng service dùng `Buffer.isBuffer`, `.subarray().toString('latin1')`, `.equals()`, `Buffer.alloc`, `readUInt32BE`. Viết lại 23 chỗ đó thành `Uint8Array` thuần sẽ rủi ro hơn cho bản Windows đang chạy tốt.

Lớp vận chuyển phía client được **hoán đổi module lúc build**, không phải `import()` động có điều kiện: `client/src/lib/transport.js` (fetch tới Express) và `client/src/lib/transport.pwa.js` (gọi worker), chọn bằng plugin `rt-pwa-transport` trong `vite.config.js`. Cách `import()` động đã thử và bị bỏ: rolldown vẫn để lại chunk worker, WASM và polyfill Buffer trong bản Windows. Đã kiểm: `client/dist/` không còn bất kỳ file nào chứa `sqlite3` hay `apiWorker`.

## Phục vụ file ảnh trên PWA và chuyện base path

Trong DB, ảnh được lưu dạng `/media/...` (sách) và `/api/media/files/...` (media) — đúng với bản Windows phục vụ ở gốc domain. Trên GitHub Pages app nằm ở `/<tên-repo>/`, nên `<img src="/media/x.webp">` sẽ gọi ra **gốc domain**, nằm ngoài phạm vi Service Worker, và trả 404. Cách xử lý: `resolveFileUrl` trong `client/src/lib/api.js` thêm tiền tố base **lúc render** (giá trị trong DB không bao giờ bị đổi, nên `isLocalImage` và logic gửi lại `cover_image` vẫn đúng), và Service Worker (`client/public/sw.js`) chặn đúng những đường dẫn đã có tiền tố đó rồi đọc byte từ IndexedDB. `resolveFileUrl` đã được gắn vào 17 chỗ render ảnh, cộng một bước viết lại `src` trong HTML do `marked` sinh ra (`client/src/lib/markdown.js`) cho ảnh chèn trong note. Khi `base` là `/` thì hàm này là no-op, nên bản Windows không đổi hành vi.

Service Worker chỉ làm hai việc: phục vụ file tải lên từ IndexedDB (cùng quy tắc `Content-Disposition`/CSP với `express.static` trong `server/app.js`, kể cả việc coi `/media`, `/media/stats`, `/media/<id>` là trang SPA chứ không phải file), và cache vỏ app để mở được khi không có mạng. Tên IndexedDB trong `sw.js` phải khớp `server/storage/browserFileStore.js`; file nằm trong `client/public` nên Vite copy nguyên văn, không bundle, vì vậy hằng số phải lặp lại.

`BASE_PATH` là biến môi trường, mặc định `/`. `npm run build:pwa` (qua `server/scripts/buildPwa.js`, viết bằng Node để chạy được trên cmd của Windows) dựng ra `client/dist-pwa`, tách khỏi `client/dist` của bản Windows. Phiên 4 chỉ cần đặt `BASE_PATH=/<tên-repo>/`.

## Mật khẩu xoá dữ liệu: scrypt -> PBKDF2

`dataService` chuyển từ `scryptSync` sang PBKDF2-SHA256 (210.000 vòng, 64 byte). Lý do: scrypt không có trong WebCrypto nên bản PWA không băm được, còn PBKDF2 thì Node và trình duyệt cho ra cùng một giá trị với cùng tham số — điều này cần thiết vì Phiên 5 sẽ đồng bộ bảng `app_settings`, mật khẩu đặt ở máy nào cũng phải kiểm được ở máy kia. Bản ghi cũ (scrypt, không có trường `algo`) **vẫn kiểm được trên Windows** và được viết lại theo PBKDF2 ngay khi người dùng đổi mật khẩu; trên điện thoại thì không kiểm được và người dùng nhận thông báo rõ là phải đặt lại mật khẩu, thay vì một lỗi khó hiểu. Có test chốt cả ba đường.

## Xuất file DB để tự giữ

`POST /data/export` nhận `{ password, db: 'books' | 'media' }`, trả byte của file SQLite kèm `Content-Disposition`. Cần mật khẩu xoá dữ liệu vì file này chứa toàn bộ dữ liệu, kể cả ghi chú riêng tư. Byte lấy bằng `VACUUM INTO` một file tạm rồi đọc lên trên Node, bằng `sqlite3_js_db_export` trên WASM; cả hai cho một file SQLite hoàn chỉnh, mở được bằng bản app bên kia.

Nơi lưu do người dùng chọn: `client/src/lib/saveFile.js` dùng `showSaveFilePicker` khi có (Chrome/Edge trên máy tính) nên hộp thoại hỏi thư mục và tên file; không có thì tải xuống thư mục Tải xuống, và giao diện nói thẳng điều đó cùng cách bật "Hỏi nơi lưu mỗi file". **Chrome trên Android không có `showSaveFilePicker`** — đây là giới hạn của trình duyệt, không phải của app.

Trên PWA, `data/wipe` không còn bước sao lưu ra đĩa (không có thư mục `backups`), `backup_dir` trả null; đường lùi ở đó là tự xuất file trước khi xoá. Trên Windows hành vi không đổi.

## Phần ảnh/biểu tượng của Cài đặt chuyển sang FileStore

`settingsService` trước Phiên 3 ghi ảnh nền, biểu tượng app và đồ trang trí **trực tiếp bằng `node:fs`**, không đi qua FileStore — handoff Phiên 2 không ghi nhận chỗ này. Nay cả ba đi qua FileStore (`app/...` và `app/ornaments/...` trong store) nên dùng được trên điện thoại. Phần chỉ có trên Windows (dựng file `.ico`, bản sao `assets/custom-icon.ico`, lối tắt Desktop) gom vào một adapter `createDesktopAdapter()` trong `desktopShortcut.js` và truyền qua `context.desktop`; bản PWA truyền `null`, khi đó biểu tượng chỉ lưu bản PNG và `app_icon_ico` là null. Nhờ cách này `settingsService` không còn import `desktopShortcut.js`, nên bundle PWA không kéo theo `node:child_process` và `node:url`.

`imageService` cũng đổi điều kiện: trước đây đòi `fileStore && storagePaths`, nay chỉ đòi `fileStore` — trên PWA `storagePaths` luôn null trong khi store vẫn có.

## Bẫy đã gặp, đáng ghi lại

`server/services/obsidian/vaultFs.js` có dòng `const sleepBuffer = new Int32Array(new SharedArrayBuffer(4))` ở **cấp module** (dùng cho `Atomics.wait` để ngủ đồng bộ khi Windows khoá file). File này nằm trong đồ thị import của bảng route vì phần import markdown dùng chung bộ parse với sync Obsidian, nên nó cũng được nạp trong worker của PWA — và `SharedArrayBuffer` không tồn tại khi không có header COOP/COEP, nên **cả worker chết ngay lúc nạp** dù không ai gọi tới hàm đó. Đã sửa thành khởi tạo lúc dùng (`sleepBuffer ??= ...`). Rút ra: trong code dùng chung, mọi thứ chạm vào API của nền tảng phải nằm trong thân hàm, không ở cấp module.

## Sửa sau nghiệm thu Phiên 3

Ba việc phát sinh sau khi người dùng chạy nghiệm thu trên máy mình, đã sửa và kiểm lại bằng Chrome thật trên cả hai bản.

**Màn hình trắng ở Cài đặt → Dữ liệu.** `ExportForm` mới truyền JSX làm `children` cho `Field`, trong khi `Field` (`client/src/components/ui/Field.jsx`) nhận **render prop**: nó gọi `children({ id, aria-describedby, aria-invalid })`. Gọi một phần tử JSX như gọi hàm nên component ném lỗi, React gỡ toàn bộ cây và màn hình trắng, bấm Back cũng không về được vì không còn gì để render. Sửa thành dạng `{(props) => <Input {...props} ... />}` như các `Field` khác trong cùng file.

**Thêm lớp chặn lỗi.** Một lỗi render ở bất kỳ trang nào trước đây làm trắng cả app. Nay `client/src/components/layout/ErrorBoundary.jsx` bọc `<Outlet />` trong `AppShell`: khung app (thanh trên, điều hướng) vẫn còn, chỉ phần thân hiện thông báo kèm nội dung lỗi để gửi lại, và `resetKey` theo `pathname` nên chuyển trang là thử render lại. Đây là lưới an toàn, không phải lý do để bỏ qua lỗi.

**Mô tả nút xoá dữ liệu nói sai trên bản PWA.** Phần mô tả khẳng định app chép database vào thư mục `backups` trước khi xoá, nhưng trên điện thoại không có thư mục đĩa nên không có bước đó. Nay đoạn mô tả rẽ theo `IS_PWA`: bản điện thoại nói thẳng là không có bản sao tự động và nhắc xuất bản sao trước khi xoá.

## Chạy thử bản điện thoại ngay trên máy

`mo-app-dien-thoai.bat` ở thư mục gốc (cạnh `mo-app.bat`) dựng lại bản PWA rồi phục vụ `client/dist-pwa` qua HTTP bằng `server/scripts/servePwa.js`; cổng mặc định 4318, đổi bằng biến `PWA_PORT`. Phải qua HTTP chứ không mở bằng `file://`: trình duyệt không cho dùng OPFS lẫn Service Worker trên giao thức đó.

Điều phải nói rõ với người dùng, script cũng in ra lúc chạy: mở bằng `http://localhost:<cổng>` trên chính máy tính thì được bản **đầy đủ** (lưu trữ thật, Service Worker, ảnh hiện bình thường), nhưng mở bằng `http://192.168.x.x:<cổng>` từ điện thoại trong cùng Wi-Fi thì chỉ là **bản xem thử**: địa chỉ IP trần không phải "ngữ cảnh an toàn" nên trình duyệt tắt OPFS và Service Worker, database nằm trong bộ nhớ và ảnh không hiển thị. Muốn kiểm tra thật trên máy điện thoại thì chờ Phiên 4 (GitHub Pages có HTTPS sẵn), hoặc cắm cáp USB và dùng Port forwarding trong `chrome://inspect` để điện thoại thấy cổng đó dưới dạng localhost.

Dữ liệu của bản điện thoại tách hoàn toàn với app Windows (một bên là file trên ổ đĩa, một bên là kho trong trình duyệt), nên lần đầu mở sẽ trống — đó là đúng, nối hai bên lại là việc của Phiên 5.

## Phiên 4: GitHub Pages và cấu hình OAuth

**Phạm vi nền tảng (chốt ở Phiên 4): chỉ Android (Chrome) và Windows. Không hỗ trợ, không kiểm iOS/Safari**; các ghi chú về Safari ở mục Phiên 3 chỉ còn giá trị tham khảo.

Hướng dẫn triển khai đầy đủ (repo, bật Pages, OAuth Client, biến Client ID, danh sách kiểm tra trên Android, gỡ rối) nằm ở `docs/TRIEN-KHAI-GITHUB-PAGES.md`. Mục này chỉ ghi quyết định và lý do.

**Workflow** `.github/workflows/pages.yml`: chạy khi push `main` và khi bấm tay (`workflow_dispatch`, có ô bỏ qua test). Các bước `npm ci` → `npm test` → `npm run build:pwa` → `upload-pages-artifact` (`client/dist-pwa`) → `deploy-pages`. `BASE_PATH` **lấy từ tên repo lúc chạy** (`/<repo>/`, hoặc `/` nếu repo là `<user>.github.io`), nên đổi tên repo không phải sửa file nào. Pages phải đặt Source = "GitHub Actions". Chạy `npm test` trên Ubuntu trước khi build để không đẩy lên bản hỏng; better-sqlite3 có binary dựng sẵn cho Linux nên `npm ci` không cần thêm gì.

**Lỗi thật phát hiện ở phiên này: router không biết base path.** `BrowserRouter` trong `client/src/main.jsx` chưa có `basename`, nên dưới `/<repo>/` không route nào khớp. Kiểm tra bằng Chrome ở Phiên 3 không bắt được vì chỉ xem app có render và API có trả lời, không xem đúng trang. Nay `basename` lấy từ `import.meta.env.BASE_URL` bỏ dấu `/` cuối; với base `/` giá trị là `undefined` nên bản Windows không đổi. Đã kiểm bằng Chrome headless trên một server giả lập Pages (phục vụ dưới `/media-tracker/`, file không có thì trả `404.html` kèm status 404): `/`, `/dashboard`, `/media`, `/series` đều render đúng trang, link điều hướng đều mang tiền tố `/media-tracker/`.

**SPA fallback trên Pages.** Pages không có rewrite, nên mở thẳng hoặc tải lại `/<repo>/books/12` sẽ nhận `404.html`. `buildPwa.js` sau khi build chép `index.html` thành `404.html` (cùng nội dung, router tự xử lý đường dẫn) và tạo `.nojekyll`. Status HTTP vẫn là 404 nhưng trình duyệt render bình thường; Service Worker không bị ảnh hưởng vì nhánh điều hướng chỉ rơi về cache khi `fetch` lỗi mạng, không xét status.

**Client ID.** Đọc ở `client/src/lib/googleConfig.js` từ `import.meta.env.VITE_GOOGLE_CLIENT_ID`; kèm scope `drive.file` và `googleRedirectUri()` (= origin + base). Trên GitHub đặt ở **repository variable** `VITE_GOOGLE_CLIENT_ID` (không phải secret: giá trị nằm công khai trong bundle); trên máy đặt trong `.env` ở gốc dự án — `vite.config.js` thêm `envDir: root` vì `root` của Vite là `client/`, trước đó `.env` ở gốc không được đọc (Vite chỉ đưa biến tiền tố `VITE_` vào bundle nên biến của server không lọt ra). Chưa màn hình nào import module này, nên bundle hiện tại chưa chứa Client ID và thiếu biến không làm hỏng gì; Phiên 5 import khi làm nút đồng bộ. Không có client secret ở bất kỳ đâu.

Quyết định cho Phiên 5 rút ra từ cấu hình này: scope `drive.file` (app chỉ thấy file nó tạo, không phải scope nhạy cảm nên không cần Google xét duyệt), consent screen để ở chế độ Testing với Gmail của người dùng trong Test users. Luồng đăng nhập dự kiến là token model của Google Identity Services trong trình duyệt (access token ngắn hạn, không refresh token, không secret) — đây là **giả định** chưa làm thử, Phiên 5 phải xác nhận.

**Những gì chưa kiểm được, vẫn mở.** Không có thiết bị thật trong phiên này, nên các mục ở cuối Phiên 3 (cài từ manifest, offline thật, lưu trữ sau khi khởi động lại máy) **vẫn chưa kiểm**; danh sách bước kiểm cụ thể nằm ở mục 6 của `docs/TRIEN-KHAI-GITHUB-PAGES.md`. Repo, Pages và OAuth Client cũng chưa được tạo — người dùng tự làm theo mục 1–5. Kết quả kiểm trên điện thoại cần được ghi vào đây ở đầu Phiên 5.

Điểm đã biết nhưng chưa xử lý: `CACHE` trong `sw.js` cố định (`media-tracker-shell-v1`) nên file build cũ (tên có hash) tích lại trong cache qua các lần cập nhật. Không gây sai vì `index.html` luôn lấy từ mạng trước, chỉ tốn dung lượng; xử lý khi có lý do. `client/dist/` (bản Windows) có chứa bản sao `sw.js` do thư mục `public` dùng chung, nhưng bản Windows không đăng ký nó — giống Phiên 3.

**Script triển khai** `trien-khai-pages.bat` → `server/scripts/deployPages.js` (thêm sau khi chốt Phiên 4): tự động hoá mục 1–3 và 5 của hướng dẫn qua `git` và GitHub CLI (`gh`): đăng nhập kèm quyền `workflow` (bắt buộc để đẩy file trong `.github/workflows`) và `gh auth setup-git` để `git push` dùng token của `gh`; commit có chốt chặn từ chối nếu `data/`, `node_modules/`, `client/dist*`, `*.sqlite`, `.env` bị stage; tạo repo public; bật Pages bằng `POST/PUT repos/{repo}/pages build_type=workflow`; đặt variable; push rồi tìm lần chạy workflow (nếu push không có commit mới thì `gh workflow run`) và `gh run watch`. Phần tạo OAuth Client chỉ là trình dẫn mở trang Google Cloud và in sẵn origin/redirect, vì Google không có API công khai tạo OAuth Client loại Web cho tài khoản cá nhân. Idempotent: chạy lại thì bước đã xong được bỏ qua. git và gh chạy không qua shell để giữ tham số có dấu cách; chỉ `npm` (file `.cmd`) chạy qua shell. Đã kiểm bằng `--dry-run` với `gh` giả lập, và chạy thật phần git trên một bản sao (287 file được commit, không có `data/`, có workflow); phần gọi GitHub thật chưa chạy được trong môi trường phát triển. Lỗi gặp khi người dùng chạy thật (sửa ở patch 4.2): readline được mở một lần cho cả script nên chiếm stdin và nuốt phím Enter mà `gh auth login` chờ ("Press Enter to open..."); nay mỗi câu hỏi mở rồi đóng readline riêng.

**Sửa sau khi chạy thật trên Android (patch 4.3).** Lần mở đầu trên điện thoại hiện dải cảnh báo "Access Handles cannot be created if there is another open Access Handle..." — khoá của `opfs-sahpool` đang bị giữ. Nguyên nhân chưa xác định chắc: có thể app đang mở ở tab khác, hoặc worker của lần mở trước (tải lại trang, mở lại app) chưa nhả khoá. Trường hợp thứ hai là lỗi của code: `browserConnection.js` trước đây chỉ thử mở pool một lần. Nay thử lại tối đa 8 lần trong khoảng 8,5 giây, chỉ khi lỗi là lỗi khoá (`isLockError`), với `forceReinitIfPreviouslyFailed` để sqlite-wasm không trả lại promise thất bại đã cache. Tab thứ hai thật sự vẫn rơi về bộ nhớ như thiết kế, chỉ chậm hơn vài giây. Chưa kiểm trên điện thoại sau khi sửa.

**Sửa sau khi chạy thật trên Android (patch 4.4).** Hai lỗi người dùng báo. (1) Thêm ảnh bìa phim báo "Server chưa có thư mục lưu trữ": `mediaItemService.setCover` và `mediaDetailService.uploadFile` vẫn đòi `uploadsDir && fileStore` — đúng cái điều kiện Phiên 3 đã sửa ở `imageService` của sách nhưng bỏ sót ở media. Nay chỉ đòi `fileStore`; `toLocal` (chỉ dùng cho sync Obsidian trên Node) vẫn cần `uploadsDir`, giữ nguyên. Có test chốt trong `phase3-filestore.test.js` (đã xác nhận test fail trên code cũ). (2) Kệ sách chỉ lật ra bìa khi hover, màn hình cảm ứng không có hover: `BookSpine.jsx` thêm trạng thái `peek` bật bằng ấn giữ (Android phát `contextmenu` khi ấn giữ; bỏ qua khi con trỏ là chuột để không đổi chuột phải trên Windows), tự thu lại khi chạm chỗ khác hoặc sau 4 giây; kèm `select-none` và `-webkit-touch-callout:none` để Chrome không hiện menu chọn chữ. Chưa kiểm trên điện thoại.

**Quyết định cho Phiên 5: quy tắc gộp A — gộp cả quyển.** Mỗi quyển sách (cùng lượt đọc, log, ghi chú, ảnh) là một đơn vị; cùng quyển sửa ở hai nơi giữa hai lần đồng bộ thì bản có `updated_at` mới hơn thắng nguyên khối. Người dùng chốt ngày 2026-11-13.

### Kết quả kiểm tra cuối Phiên 4

`npm test`: **184 pass, 0 fail** (183 + 1 test ảnh bìa media không cần thư mục đĩa). `npm run verify`: PASS cả 5 hạng mục, acceptance **68/68**. `npm run build` (Windows) chạy được, `client/dist/` không chứa `sqlite3` hay `apiWorker`. `BASE_PATH=/media-tracker/ npm run build:pwa`: có `404.html` trùng `index.html`, `.nojekyll`, mọi `href` mang tiền tố. Schema không đổi (sách v15, media v8).

### File đã đổi trong Phiên 4

**Mới:** `.github/workflows/pages.yml`, `trien-khai-pages.bat`, `server/scripts/deployPages.js`, `client/src/lib/googleConfig.js`, `docs/TRIEN-KHAI-GITHUB-PAGES.md`, `DOC-PATCH-PHIEN-4.md`. **Sửa:** `client/src/main.jsx` (`basename`), `server/platform/browserConnection.js` (thử lại khi khoá OPFS bận), `server/media/mediaItemService.js` và `server/media/mediaDetailService.js` (bỏ điều kiện `uploadsDir`), `client/src/components/bookshelf/BookSpine.jsx` (ấn giữ để xem bìa), `server/tests/phase3-filestore.test.js` (+1 test), `server/scripts/buildPwa.js` (`404.html`, `.nojekyll`), `vite.config.js` (`envDir`), `.env.example` (`VITE_GOOGLE_CLIENT_ID`), `docs/HANDOFF-ANDROID-S.md`.

## Phiên 5: Đồng bộ Google Drive

**Kết quả kiểm trên Android trước Phiên 5:** người dùng chưa gửi kết quả 7 mục (bản gửi đầu phiên để trống). Vẫn coi là chưa kiểm, gồm cả hai bản sửa 4.3 (khoá OPFS) và 4.4 (ảnh bìa media, ấn giữ gáy sách).

**Kiến trúc.** Mọi việc với Google (đăng nhập, gọi Drive API) nằm ở trình duyệt, ở cả hai bản (bản Windows cũng là trang web ở cổng 4317): `client/src/lib/googleAuth.js`, `driveApi.js`, `driveSync.js`. Access token không bao giờ xuống server Node. Phần dữ liệu (xuất đơn vị, băm, gộp, áp vào DB, sao lưu, khôi phục) là service dùng chung `server/services/driveSync/` trên lõi Db async, gọi qua bảng route như mọi tính năng khác, nên chạy y hệt trên Express và trong worker của PWA, và có test bằng `node --test`. Các route `/drive-sync/status`, `/apply`, `/commit`, `/restore`, `/file` (GET/PUT) **không** có cờ `nodeOnly`.

**Đăng nhập.** Token model của Google Identity Services, dạng popup, `prompt: ''`. Đã xác nhận đây là hướng đúng cho giới hạn một tab: chuyển hướng cả trang hay mở tab mới đều có thể làm tab app mất khoá `opfs-sahpool`. Trình duyệt chỉ cho mở popup ngay trong sự kiện bấm, nên script GIS được nạp khi mở hộp thoại, còn `requestDriveToken()` gọi popup đồng bộ trong `onClick`, không `await` gì trước đó. Token giữ trong bộ nhớ trang, dùng lại khi còn hạn trên 2 phút; hết hạn (hoặc Drive trả 401) thì lần bấm sau mở lại popup. Client ID có giá trị mặc định trong `googleConfig.js` (là thông tin công khai), `VITE_GOOGLE_CLIENT_ID` vẫn ghi đè được, nên bản Windows không cần `.env`. Bản Windows cần thêm origin `http://localhost:4317` **và** `http://127.0.0.1:4317` vào OAuth Client, vì `mo-app.bat` mở bằng `127.0.0.1`. Không cần redirect URI cho luồng popup.

**Định dạng trên Drive.** Thư mục `Media Tracker Sync` ở gốc My Drive gồm hai thứ. Thứ nhất là `snapshot.json` (`format_version: 1`, `schema` {books, media}, `written_at`, `device`, `units`, `deletions`, `files`). Thứ hai là thư mục con `files/`: mỗi ảnh hoặc file đính kèm là một file Drive, tên là khoá store (`books/items/<uid>/cover-<mốc>.png`, `books/app/...`, `media/items/...`). Tên file trong store luôn có mốc thời gian (đã kiểm `imageService`, `mediaItemService`, `mediaDetailService`, `settingsService`), nên một khoá không bao giờ đổi nội dung: chỉ đẩy khoá Drive chưa có, chỉ tải khoá máy đang thiếu, không cần băm byte ảnh. File cần đồng bộ được suy ra từ chuỗi `/media/...` và `/api/media/files/...` trong dữ liệu đơn vị (gồm cả ảnh chèn trong markdown và đường dẫn đã `encodeURIComponent`). Ở Phiên 5, sync không xoá file ảnh nào, kể cả khi xoá sách: file mồ côi để Phiên 6 dọn, và nhờ vậy bản chụp trước đồng bộ luôn còn ảnh.

**Đơn vị gộp (quy tắc A).** Mỗi loại dữ liệu được gộp như sau:

- **Sách:** `items` cùng `library_cards`, `reading_logs` và `reading_notes`.
- **Media:** `media_items` cùng `media_watch_cards` và `media_notes`.
- **Challenge:** challenge kèm các slot của nó.
- **Bracket:** mỗi bracket là một đơn vị.
- **Ba khối:** `goals`, `monthly_favorites`, `series_positions`, mỗi bảng một khối vì có khoá tự nhiên UNIQUE.
- **Cài đặt:** mỗi key của `app_settings` là một đơn vị.

Dữ liệu đơn vị không có id tự tăng: `challenge_slots.item_id`, `monthly_favorites.item_id`, `brackets.entries` và `picks`, `series_positions.item_id` (của sách hoặc media theo `source`) được đổi sang `item_uid` khi xuất và đổi lại id cục bộ khi áp. Tham chiếu tới sách/media không còn ở máy nhận thì thành `null` (slot, bracket) hoặc bị bỏ (yêu thích, thứ tự series).

Có những thứ không đồng bộ. Các cột riêng của từng máy `obsidian_path`, `obsidian_media_dir`, `sync_db_hash`, `sync_file_hash` bị bỏ khỏi dữ liệu đơn vị. `general.app_icon_ico` (file .ico lối tắt Desktop) không đi theo, và khi áp thì máy nhận giữ giá trị của mình. Cũng không đồng bộ key `drive_sync_state`, `obsidian_sync_config` và `obsidian_templates`; Obsidian chỉ có trên Windows, đây là quyết định đã duyệt.

**Gộp ba chiều.** Mỗi máy lưu `base` (hash từng đơn vị ở lần đồng bộ thành công gần nhất) trong `app_settings` key `drive_sync_state`, cùng `last_sync_at` và danh sách bản chụp. Không đổi schema. `planMerge` (`server/services/driveSync/merge.js`, hàm thuần) quyết định cho từng đơn vị:

- **Hash hai bên bằng nhau:** bỏ qua.
- **Chỉ một bên khác `base`:** lấy bên đó.
- **Cả hai bên khác `base`:** là xung đột. Bản có `updated_at` mới hơn thắng nguyên khối; hoà thì bản cục bộ thắng.
- **Một bên có dấu xoá, bên kia không sửa kể từ `base`:** xoá theo.
- **Một bên có dấu xoá, bên kia đã sửa:** so `updated_at` với `deleted_at`.

Dấu xoá chỉ được xét cho khoá không còn đơn vị ở chính bên đó, nên một đơn vị đã "sống lại" hợp lệ (sửa sau khi bị xoá) không bị xoá lại. `updated_at` của đơn vị là mốc lớn nhất của `updated_at` và `created_at` trên mọi dòng. Khi so xung đột, bên cục bộ còn tính thêm `deleted_at` của những dòng con mà máy này đã xoá nhưng bản trên Drive vẫn còn (`children` lưu sync_uid của dòng con), vì xoá một log không đổi `updated_at` của sách. Dấu xoá trên Drive là hợp của dấu đã có và dấu cục bộ (`sync_deletions` và `media_sync_deletions`), giữ vĩnh viễn ở Phiên 5. Dọn dấu cũ là việc Phiên 6.

**Ba điều chặn việc hai máy đẩy qua đẩy lại.** Thứ nhất, hash không tính `updated_at` (ở mọi tầng). Thứ hai, khi áp, dòng con và bảng có trigger "touch" của migration 015 được xoá rồi **chèn lại** với nguyên giá trị từ Drive (trigger `AFTER UPDATE` không chạy với INSERT), còn `items`/`media_items` thì UPDATE tại chỗ để giữ id. Thứ ba, dấu `sync_deletions` sinh ra trong lúc áp (do xoá rồi chèn) bị xoá ngay trong cùng transaction. Có test chốt: sau khi hai máy khớp nhau, đồng bộ thêm nhiều lần đều trả 0 lấy về, 0 đẩy lên. Cột được ghi chỉ là cột bảng cục bộ có (`PRAGMA table_info`), nên tên cột không đi thẳng từ file vào SQL và dữ liệu từ schema thấp hơn vẫn áp được. Snapshot do schema **cao hơn** ghi thì bị từ chối (409 `SYNC_SCHEMA_NEWER`) trước khi đụng dữ liệu. Media áp trước sách, vì `series_positions` của DB sách tham chiếu id media. Hai DB là hai transaction riêng: nếu phần sách lỗi sau khi phần media đã ghi thì còn bản chụp để lùi, và lần đồng bộ sau gộp lại đúng.

**Luồng một lần bấm** (`client/src/lib/driveSync.js`):

1. Lấy token.
2. Tìm hoặc tạo thư mục, tải `snapshot.json` và nhớ `modifiedTime`.
3. `POST /drive-sync/apply`: server chụp lại, gộp, áp và trả snapshot mới (xuất lại từ DB **sau khi áp**, nên snapshot luôn đúng bằng trạng thái máy này), danh sách file cần tải về và cần đẩy lên, số liệu và danh sách xung đột.
4. Tải file thiếu qua `PUT /drive-sync/file`, đẩy file mới lên `files/`.
5. Kiểm lại `modifiedTime` của snapshot. Nếu máy khác vừa ghi xen vào thì dừng với lỗi `concurrent` và báo bấm lại.
6. Ghi `snapshot.json`.
7. `POST /drive-sync/commit` để lưu `base`.

Hỏng ở bất kỳ bước nào trước bước 7 thì lần bấm sau làm lại, không mất gì. File ảnh còn thiếu được tải bù ở mọi lần đồng bộ.

**Đường lùi.** Trước mỗi lần áp có lấy về hoặc xoá, app chụp lại dữ liệu cục bộ:

- **Bản chụp JSON (cả hai bản):** toàn bộ đơn vị kèm `base` cũ, giữ 5 bản. Bản Windows lưu ở `<storage>/backups/dong-bo-json/` (ngoài `uploads`, nên không bị phục vụ qua `/media`). Bản PWA lưu ở `syncBackupStore`, cùng IndexedDB với ảnh, tiền tố `sync-backups/`.
- **Bản sao SQLite bằng `db.backup()` (chỉ bản Windows):** cả hai DB, ở `<storage>/backups/truoc-khi-dong-bo-<mốc>/`, giữ 10 thư mục gần nhất. Chỉ thư mục có tiền tố này bị dọn, các bản sao lưu khác giữ nguyên quy tắc không tự xoá.

"Khôi phục" (`POST /drive-sync/restore`) đặt dữ liệu máy này về một bản chụp và trả `base` về giá trị lúc đó. Trước khi khôi phục, app chụp trạng thái hiện tại nên khôi phục cũng hoàn tác được. Dấu xoá sinh ra lúc khôi phục bị dọn, vì vậy khôi phục **chỉ** đổi máy này và không biến thành lệnh xoá trên máy kia. Muốn Drive và máy kia theo, bấm thêm "Ghi đè Drive" (`mode: 'push'`): không lấy gì về, mọi đơn vị cục bộ thành bản trên Drive, đơn vị chỉ có trên Drive bị gắn dấu xoá với mốc hiện tại. Máy kia xoá theo, trừ mục nó sửa sau mốc đó.

**Giao diện.** Nút "Đồng bộ" (biểu tượng đám mây) nằm trên thanh trên ở mọi tab, cả hai bản, và mở `client/src/components/sync/DriveSyncDialog.jsx`. Hộp thoại có các phần sau:

- Thời điểm đồng bộ gần nhất.
- Nút "Đồng bộ ngay" kèm dòng tiến trình theo bước.
- Kết quả: số mục lấy về, đẩy lên, xoá ở máy này, xoá trên Drive, số ảnh tải về và đẩy lên, cùng danh sách xung đột và bên thắng.
- Mục "Khôi phục và ghi đè": danh sách bản chụp và nút Ghi đè Drive. Hai thao tác này phải bấm hai lần để xác nhận, không dùng `confirm()` của trình duyệt.

Lỗi được đổi sang câu dễ hiểu (`DriveSyncError` trong `driveErrors.js`): không tải được GIS, popup bị chặn, popup đóng, từ chối quyền hoặc chưa ở Test users, thiếu quyền scope, token hết hạn, Drive API chưa bật, giới hạn tần suất, hết dung lượng, mất mạng, snapshot hỏng, schema mới hơn, máy khác ghi xen. Sau khi đồng bộ hoặc khôi phục, toàn bộ cache React Query bị làm mới. So với kế hoạch: các thao tác khôi phục và ghi đè nằm trong chính hộp thoại đồng bộ chứ không ở một tab riêng trong Cài đặt, vì đó là chỗ người dùng đang đứng khi cần.

**Những gì đã kiểm và chưa kiểm.** Đã kiểm bằng test tự động:

- Hai chiều sách và media có ảnh.
- Xoá không sống lại.
- Xung đột thì bản mới hơn thắng nguyên khối.
- Không đẩy qua đẩy lại.
- Đổi tham chiếu id.
- Bản chụp, khôi phục, ghi đè, key riêng của máy.
- Từ chối schema mới hơn và khoá file có `..`.
- Bản WASM nhận dữ liệu từ bản Node với hash khớp từng đơn vị.
- Lớp `driveApi` với fetch giả lập.

Đã kiểm thêm bằng Chrome headless thật trên **cả hai bản build**: Windows chạy `server/index.js`, PWA chạy `servePwa.js` trên localhost với OPFS và Service Worker thật. GIS được thay bằng đối tượng giả và Drive bằng server giả lập Drive v3 (có CORS). Kịch bản như sau: Windows đẩy sách có ảnh bìa và một phim; điện thoại lấy về, ảnh bìa phục vụ qua Service Worker trả 200; thêm sách trên điện thoại bằng form thật rồi đồng bộ; Windows lấy về; đồng bộ lại hai bên đều báo "Hai bên đã khớp".

Chưa kiểm được trong môi trường phát triển và phải kiểm trên máy thật:

- Popup GIS thật trên Windows (`127.0.0.1` và `localhost`).
- Popup GIS trên Android khi app chạy toàn màn hình sau khi cài.
- Việc file do máy này tạo bằng scope `drive.file` thấy được từ máy kia (suy luận: cùng một OAuth Client nên được).
- Định dạng multipart trước Drive thật (đã kiểm với server giả lập theo đặc tả).

**Giới hạn đã biết.**

- Cùng một quyển tạo riêng ở hai máy (khác `sync_uid`) sẽ thành hai bản trùng. Lần đầu đồng bộ điện thoại có dữ liệu thử thì nên xoá dữ liệu thử trước.
- "Xoá toàn bộ dữ liệu" ghi dấu xoá cho mọi sách, nên đồng bộ sau đó sẽ xoá trên mọi máy. Đó là đúng nghĩa của thao tác, nhưng phải biết trước khi dùng để "làm sạch" một máy.
- Snapshot là một file JSON chứa cả ghi chú, nên tải lại toàn bộ mỗi lần đồng bộ. Ổn với thư viện cá nhân; nếu lớn tới hàng chục MB thì cân nhắc gzip hoặc tách file ở Phiên 6.
- Giới hạn body JSON của Express là 25 MB, áp cho cả `/drive-sync/apply`.

### Kết quả kiểm tra cuối Phiên 5

`npm test`: **193 pass, 0 fail** (184 + 9 test trong `phase5-drive-sync.test.js`). `npm run verify`: PASS cả 5 hạng mục, acceptance **68/68**. `npm run build` (Windows): `client/dist/` không chứa `sqlite3` hay `apiWorker`. `BASE_PATH=/media-tracker/ npm run build:pwa`: chạy được, service đồng bộ nằm trong `apiWorker`, bundle không kéo `better-sqlite3`. Schema không đổi (sách v15, media v8).

### File đã đổi trong Phiên 5

**Mới:** `server/services/driveSync/index.js`, `server/services/driveSync/units.js`, `server/services/driveSync/merge.js`, `server/services/driveSync/apply.js`, `client/src/lib/driveErrors.js`, `client/src/lib/googleAuth.js`, `client/src/lib/driveApi.js`, `client/src/lib/driveSync.js`, `client/src/components/sync/DriveSyncDialog.jsx`, `server/tests/phase5-drive-sync.test.js`, `DOC-PATCH-PHIEN-5.md`. **Sửa:** `server/services/index.js` (đăng ký `driveSync`), `server/routes/routeTable.js` (route `/drive-sync/*`), `server/app.js` và `server/platform/browserContext.js` (`syncBackupStore`), `client/src/lib/googleConfig.js` (Client ID mặc định), `client/src/components/layout/AppShell.jsx` (nút Đồng bộ), `server/scripts/deployPages.js` (in thêm origin localhost), `docs/TRIEN-KHAI-GITHUB-PAGES.md` (origin bản Windows), `docs/HANDOFF-ANDROID-S.md`.

## Kết quả kiểm tra cuối Phiên 3

`npm test`: 183 test, **183 pass, 0 fail** (168 của Phiên 2 + 15 test mới).
`npm run verify`: PASS toàn bộ 5 hạng mục, acceptance qua HTTP **68/68 PASS, 0 FAIL, 0 SKIP**.
`npm run build` (Windows): chạy được, và `client/dist/` **không chứa** worker, WASM hay polyfill Buffer.
`npm run build:pwa`: chạy được, `client/dist-pwa/` có `apiWorker`, `sqlite3.wasm` (879 KB, gzip 412 KB), `sw.js`, `manifest.webmanifest`, `icon-192.png`, `icon-512.png`; không còn `node:` builtin nào trong bundle.
Schema sách: **v15, không đổi**. Schema media: **v8, không đổi**. Không có migration mới trong phiên này.

Ngoài test tự động, bản PWA đã được chạy thử trên **Chrome thật** (headless, phục vụ qua HTTP cục bộ) và kiểm được những thứ chỉ hiện ra trên trình duyệt:
- Worker mở DB trên OPFS, `persistent: true`, migration lên v15 (sách) và v8 (media).
- `GET /health`, `POST /items`, `GET /items`, `PUT /items/:id/images/cover`, `GET /media/health`, `GET /dashboard` đều trả 200/201 đúng dạng, không có lỗi console.
- Dữ liệu **còn sau khi tải lại trang**: 1 → 2 → 3 bản ghi qua ba lần mở (có đóng tab giữa các lần để nhả khoá SAHPool).
- Service Worker trả đúng ảnh bìa vừa tải lên (`image/png`, đúng byte PNG) và trả 404 cho file không tồn tại.
- Lặp lại toàn bộ với `BASE_PATH=/media-tracker/` phục vụ dưới đường dẫn con: app render, SW đúng phạm vi, ảnh phục vụ ở `/media-tracker/media/...`.
- Mở tab thứ hai khi tab đầu còn mở: `persistent: false` kèm lý do từ SAHPool, đúng như thiết kế, và giao diện có dải cảnh báo.

Sau khi sửa ba việc ở mục trên, đã kiểm lại bằng Chrome thật: trang Cài đặt → Dữ liệu render đủ và không có lỗi console trên **cả hai bản**; bản PWA ẩn đúng tab Lưu trữ và nút Sync Obsidian; `mo-app-dien-thoai.bat` phục vụ được `index.html`, `sw.js` và `manifest.webmanifest`.

Chưa kiểm được ở phiên này (phải chờ Phiên 4, trên thiết bị thật): cài đặt app từ manifest trên Android, hành vi khi offline thật, và Safari/iOS.

## Danh sách file đã đổi trong Phiên 3

**Mới (26):** `server/db/scope.node.js`, `server/db/scope.browser.js`, `server/platform/sqliteWasm.js`, `server/platform/browserConnection.js`, `server/platform/browserContext.js`, `server/platform/shims/path.js`, `server/platform/shims/crypto.js`, `server/platform/shims/url.js`, `server/platform/shims/nodeOnly.js`, `server/storage/browserFileStore.js`, `server/scripts/buildPwa.js`, `client/src/worker/apiWorker.js`, `client/src/worker/bufferGlobal.js`, `client/src/lib/workerTransport.js`, `client/src/lib/transport.js`, `client/src/lib/transport.pwa.js`, `client/src/lib/apiError.js`, `client/src/lib/saveFile.js`, `client/src/components/layout/StorageWarning.jsx`, `client/public/sw.js`, `client/public/manifest.webmanifest`, `client/public/icon-192.png`, `client/public/icon-512.png`, cộng ba test `server/tests/phase3-wasm-db.test.js`, `server/tests/phase3-filestore.test.js`, `server/tests/phase3-data-export.test.js`.

**Lõi DB:** `server/db/async.js` (bỏ import `node:async_hooks`, nhận `scope` và `exportBytes` từ ngoài), `server/db/connection.js`, `server/media/db/connection.js`, `server/db/backup.js` (thêm `exportDatabaseBytes`).

**Service & route:** `server/services/settingsService.js` (sang FileStore, bỏ `node:fs`/`node:path`), `server/services/desktopShortcut.js` (thêm `createDesktopAdapter`), `server/services/dataService.js` (PBKDF2, `exportDb`), `server/services/imageService.js` (điều kiện store), `server/services/obsidian/vaultFs.js` (SharedArrayBuffer lazy), `server/routes/routeTable.js` (cờ `nodeOnly`, route `/data/export`), `server/media/routeTable.js` (`directory` null khi không có đĩa), `server/controllers/systemController.js` (`platform`, `persistent`, bỏ `process.version` cứng), `server/app.js` (truyền `context.desktop`).

**Client:** `client/src/lib/api.js` (viết lại quanh lớp vận chuyển), `client/src/lib/images.js`, `client/src/lib/markdown.js`, `client/src/media/queries.js`, `client/src/pages/SettingsPage.jsx`, `client/src/components/layout/AppShell.jsx`, `client/src/components/settings/{AppearanceSettings,AppIconSettings,OrnamentSettings,DataSettings}.jsx`, cộng 13 file chỉ thêm `resolveFileUrl` vào chỗ render ảnh (`Cover.jsx`, `BookHeader.jsx`, `BookSpine.jsx`, `ListView.jsx`, `Shelf.jsx`, `ImagePicker.jsx`, `NoteGallery.jsx`, `NoteLinks.jsx`, `MediaDetailPage.jsx`...).

**Sau nghiệm thu:** `client/src/components/settings/DataSettings.jsx` (sửa `Field`, mô tả xoá dữ liệu theo nền tảng), `client/src/components/layout/ErrorBoundary.jsx` (mới), `client/src/components/layout/AppShell.jsx` (bọc `Outlet`), `server/scripts/servePwa.js` (mới), `mo-app-dien-thoai.bat` (mới).

**Build:** `vite.config.js` (base path, alias shim, hoán đổi transport, chèn manifest/SW cho bản PWA), `package.json` (`@sqlite.org/sqlite-wasm`, `buffer`, script `build:pwa` và `dev:pwa`), `.gitignore`.

## Kết quả kiểm tra cuối Phiên 2

`npm test`: 168 test, **168 pass, 0 fail**.
`npm run verify`: PASS toàn bộ 5 hạng mục, acceptance qua HTTP **68/68 PASS, 0 FAIL, 0 SKIP**.
Schema sách: **v15** (từ v14). Schema media: **v8** (từ v7).
Không có thay đổi giao diện nên không cần chụp ảnh Playwright.

## Kết quả kiểm tra cuối Phiên 1

`npm test`: 159 test, **159 pass, 0 fail** (trước phiên: 150 test, 148 pass, 2 fail — xem mục sự cố bản zip cũ bên dưới để hiểu vì sao con số test khác nhau giữa hai lần đo).
`npm run verify`: PASS toàn bộ — unit + integration test, build giao diện, migrate + seed, khởi động server, acceptance qua HTTP **67/67 PASS, 0 FAIL, 0 SKIP**.
Schema version: **14, không đổi**. Không có migration mới trong phiên này.
Không có thay đổi giao diện nên không cần chụp ảnh Playwright.

## Nguyên nhân 2 test fail và cách sửa

Hai test `phase5.test.js:68` (`đếm First-read và Re-read theo năm`) và `sync.test.js:256` (`dry-run không ghi gì; sync tạo file theo template`) cùng một nguyên nhân gốc: `itemService.ensureReading` tự tạo một lượt đọc **rỗng** khi sách được tạo với `status` thuộc `['Reading','Finished','DNF']`, và lượt rỗng này không bao giờ được thu hồi khi người dùng nhập lượt đọc thật ngay sau đó. Lượt đọc thật đầu tiên vì thế mang `read_number = 2`; `dashboardService` xác định lượt đầu bằng `card.read_number === 1` nên đếm nó thành re-read, còn phía Obsidian thì lượt rỗng vẫn được ghi vào trường `Reads` của file .md.

Cách sửa: `libraryCardService.create` nhận diện trường hợp sách chỉ có **đúng một** lượt và lượt đó rỗng ở toàn bộ 5 trường người dùng (`start_date`, `finish_date`, `finish_year`, `rating`, `review_summary`), rồi **điền dữ liệu vào lượt đó** thay vì chèn lượt mới; các trường hợp còn lại giữ nguyên hành vi chèn thêm. Hàm nhận diện là `isBlankCard`, export từ `libraryCardService.js`. Không đổi schema.

## Danh sách file đã đổi trong Phiên 1

**Mới (4):** `server/db/async.js`, `server/storage/fileStore.js`, `server/storage/nodeFileStore.js`, `server/tests/db-async.test.js`.

**Lõi & lắp ghép (3):** `server/db/connection.js`, `server/app.js`, `server/routes/api.js`.

**Models (7):** `itemModel.js` (gồm cả việc cho phép `listValues('warnings')`), `libraryCardModel.js`, `readingLogModel.js`, `readingNoteModel.js`, `syncConfigModel.js`, `syncTombstoneModel.js`, `templateModel.js`.

**Services (17):** `itemService.js`, `libraryCardService.js`, `readingLogService.js`, `readingNoteService.js`, `syncConfigService.js`, `dashboardService.js`, `readingsService.js`, `statsService.js`, `goalsService.js`, `funService.js`, `seriesService.js`, `dataService.js`, `settingsService.js`, `imageService.js`, `import/importService.js`, `import/markdownImport.js`, `obsidian/obsidianSyncService.js`, `obsidian/templates/templateService.js`.

**Controllers (11):** `dashboardController.js`, `featuresController.js`, `importController.js`, `itemController.js`, `libraryCardController.js`, `readingLogController.js`, `readingNoteController.js`, `settingsController.js`, `syncController.js`, `systemController.js`, `templateController.js`.

**Scripts & test (5):** `scripts/seed.js`, `scripts/acceptance.js`, `tests/db.test.js`, `tests/phase4.test.js`, `tests/data.test.js`.

`server/media/**`, `server/services/storageService.js`, `server/db/migrator.js`, `server/db/migrations/**` và toàn bộ `client/**` **không đổi**.

## Quyết định kỹ thuật khác

`readingsService.yearTotals` trở thành async (cần truy vấn số phút từ `reading_logs`) và không còn tham số mặc định `reads = this.all()`; mọi lời gọi phải truyền `reads` vào. `statsService.compute` vì thế cũng async. `goalsService.list(year, today, reads)` nhận `reads = null` và tự gọi `readings.all()` khi không được truyền.

`dashboardService.get` gọi `readings.all()` **một lần** rồi truyền xuống `stats.compute` và `goals.list`, thay vì mỗi nơi tự truy vấn lại.

Express 5 tự chuyển promise bị reject của handler sang error middleware, nên controller async không cần `try/catch` hay `next(error)`.

Interface Db hỗ trợ `{ pluck: true }` ở `get`/`all` để thay cho `.pluck()` của better-sqlite3; `get` trả `null` khi không có dòng (hoặc `undefined` khi dùng `pluck`).

## Sự cố bản zip cũ và cách đã xử lý

Bản zip mã nguồn dùng để làm Phiên 1 cũ hơn mã nguồn thật trên máy, nên patch đợt đầu đã ghi đè một số file bằng bản cũ. Hậu quả duy nhất phát hiện được: hàm `itemService.facets` trên máy có thêm trường `warnings` (danh sách giá trị cảnh báo đã nhập, dùng làm gợi ý trong form sách ở `client/src/components/books/BookFormDialog.jsx`), và trường này bị mất khi ghi đè, làm test `facets: warnings, tropes và series đã nhập được dùng làm danh sách chọn` trong `series.test.js` fail.

Đã dựng lại: thêm `'warnings'` vào whitelist cột của `itemModel.listValues`, và thêm `warnings: await items.listValues('warnings')` vào `itemService.facets`. Đã đối chiếu toàn bộ trường mà client đọc từ `/items/facets` (`total`, `tags`, `fandoms`, `topics`, `tropes`, `warnings`, `formats`, `custom_values`) — tất cả đều có mặt, không còn khoảng trống nào khác.

Các thay đổi mới khác trên máy nằm ở những file không thuộc patch nên còn nguyên: `client/src/components/books/BookFormDialog.jsx`, `client/src/components/detail/BookHeader.jsx`, `client/src/i18n/**`, `client/src/media/**`, `server/media/mediaItemService.js` (thêm `cover_image` dạng link ngoài http/https và gỡ file ảnh cũ khi đổi sang link), `server/tests/media.test.js`, `server/tests/series.test.js`.

Rút ra cho các phiên sau: zip gửi kèm phải được nén từ chính thư mục làm việc ngay trước khi gửi, và phải nén bằng công cụ giữ tên file UTF-8 (7-Zip hoặc `tar`).

## Vấn đề tồn đọng

Roadmap ghi Phiên 2 sẽ "thêm `sync_uid`, `updated_at`, `tombstone`" ở migration v15, nhưng `sync_uid` và bảng `sync_tombstones` (kèm trigger `trg_items_tombstone`) **đã tồn tại từ migration 002**, chỉ áp dụng cho bảng `items` và phục vụ đồng bộ Obsidian. Phạm vi thật của Phiên 2 có thể là mở rộng các cột này sang `library_cards`, `reading_logs` và các bảng còn lại cho đồng bộ Google Drive, chứ không phải thêm mới từ đầu. Cần xác nhận hoặc khảo sát lại ở đầu Phiên 2.

Khi nén source để gửi kèm, phải dùng công cụ giữ tên file UTF-8 (7-Zip hoặc `tar`). Bản zip nhận ở đầu Phiên 1 làm hỏng tên file tiếng Việt (`tiếng lòng lặng thinh.md` thành `ti#U1ebfng l#U00f2ng l#U1eb7ng thinh.md`), khiến 6 test fail giả do không đọc được fixture.

Giới hạn còn lại của bản PWA, đã biết và đã có cảnh báo cho người dùng, chưa có cách khắc phục trong phạm vi hiện tại: chỉ mở được ở **một tab** tại một thời điểm (`opfs-sahpool` giữ khoá độc quyền), tab thứ hai chạy với DB trong bộ nhớ; không có bước **sao lưu tự động trước khi migrate** như trên Windows, nên trước khi cập nhật app nên tự xuất file DB; **Chrome trên Android không cho chọn nơi lưu file** khi xuất, file về thư mục Tải xuống.

Chưa kiểm trên thiết bị thật: cài app từ manifest, hành vi offline thật, và Safari/iOS (OPFS có từ Safari 16.4 nhưng chưa thử).

Quy tắc gộp đã chốt là A (cả quyển) và đã làm ở Phiên 5, xem mục Phiên 5.

## Danh sách file đã đổi trong Phiên 2

**Mới (9):** `server/db/backup.js`, `server/db/migrations/015_sync_identity.js`, `server/http/dispatch.js`, `server/http/expressAdapter.js`, `server/http/validateInput.js`, `server/routes/routeTable.js`, `server/media/routeTable.js`, `server/tests/phase2-sync-core.test.js`.

**Lõi & lắp ghép:** `server/app.js` (thêm `mediaFileStore`), `server/db/connection.js`, `server/db/migrations/index.js`, `server/middleware/errorHandler.js` (tách `toErrorResponse`), `server/middleware/validate.js`, `server/routes/api.js`.

**Media:** `server/media/db/connection.js`, `server/media/db/migrations.js`, `server/media/mediaItemService.js`, `server/media/mediaDetailService.js`, `server/media/mediaStatsService.js`, `server/media/routes.js`.

**Service dùng media DB:** `server/services/seriesService.js`, `server/services/dataService.js`, `server/services/obsidian/mediaSync.js`, `server/services/obsidian/obsidianSyncService.js`.

**Sửa sót của Phiên 1:** `server/models/itemModel.js`, `server/services/itemService.js` (dựng lại trường `warnings` trong `facets`).

**Scripts & test:** `server/scripts/acceptance.js`, `server/tests/db.test.js`, `server/tests/storage.test.js`, `server/tests/phase4.test.js`, `server/tests/media.test.js`.

Toàn bộ `client/**` **không đổi**.

## Phạm vi phiên kế tiếp (PHIÊN 6)

Việc đầu phiên: ghi kết quả kiểm đồng bộ thật (mục "Các bước test" trong `DOC-PATCH-PHIEN-5.md`) và 7 mục kiểm trên điện thoại vào handoff. Phạm vi dự kiến:

- Màn hình xử lý xung đột chọn tay. Phiên 5 tự giải theo quy tắc A và chỉ liệt kê.
- Dọn dấu xoá cũ trên Drive.
- Dọn file ảnh mồ côi trên Drive và trên máy.
- Cân nhắc nén hoặc tách `snapshot.json` nếu file lớn.
- Bỏ `openUrl(appUrl)` trong `deployPages.js` nếu người dùng muốn.
- Đổi tên cache `sw.js` theo phiên bản.

Các patch của Phiên 5: 5 (đồng bộ Google Drive).
