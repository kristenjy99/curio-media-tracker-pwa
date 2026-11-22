# Patch update 6: Quotes & highlights, lọc theo tác giả, cảnh báo trùng tên sách

Patch áp sau patch 5 (đồng bộ Google Drive), không phụ thuộc kế hoạch KOReader. Patch có một migration mới (016): DB sách lên **v16**, DB media giữ v8. Không thêm gói npm.

## Cài đặt

1. **Đóng app.** Đóng cửa sổ `mo-app.bat` và mọi tab app trên trình duyệt.
2. **Giải nén đè.** Giải nén `patch-update-6-quotes-tac-gia-trung-ten.zip` đè vào thư mục gốc dự án (chỗ có `package.json`) bằng 7-Zip và chọn ghi đè tất cả. Zip chỉ chứa file mới hoặc đã sửa, không xoá file nào. Phải dùng 7-Zip hoặc công cụ giữ tên file UTF-8.
3. **Kiểm tra.** Chạy `kiem-tra.bat`, hoặc `npm test` rồi `npm run verify`. Kết quả mong đợi: 198 test pass, verify PASS cả 5 mục (acceptance 68/68).
4. **Mở app.** Chạy `mo-app.bat`. Lần mở đầu tiên app tự chạy migration 016. Trước khi migrate, app tự sao lưu DB vào `<thư mục lưu trữ>\backups\truoc-khi-migrate-v15-v16-<thời điểm>-reading-tracker.sqlite`.
5. **Bản điện thoại.** Chạy `trien-khai-pages.bat` để đưa bản mới lên GitHub Pages, rồi mở app trên điện thoại một lần để nhận bản mới.

**Thứ tự với đồng bộ Google Drive:** cập nhật cả Windows lẫn điện thoại **trước** lần đồng bộ kế tiếp. Máy đã lên v16 ghi snapshot v16 lên Drive. Máy còn v15 sẽ từ chối snapshot đó với lỗi `SYNC_SCHEMA_NEWER` (thông báo "bản app mới hơn"); dữ liệu không hỏng, chỉ cần cập nhật máy đó rồi đồng bộ lại. Sách không có quote giữ nguyên dữ liệu đồng bộ như cũ, nên lần đồng bộ đầu sau khi cập nhật không phải đẩy lại toàn bộ thư viện.

## Hướng dẫn sử dụng

### Quotes & highlights

- **Mở mục riêng:** tab **Trích dẫn** (tiếng Anh: Quotes), nằm cạnh tab Mục tiêu dưới mục Sách. Giao diện tiếng Việt của app dùng từ thuần Việt nên "Quotes" hiện là "Trích dẫn" và "Highlights" là "Trích đoạn". Đường dẫn trực tiếp: `/quotes`.
- **Thêm quote:**
  - Bấm **Thêm trích dẫn**, chọn sách.
  - Chọn loại Trích dẫn (quote) hoặc Trích đoạn (highlight).
  - Dán nội dung. Có thể ghi thêm **Vị trí** (trang, chương hoặc %, chữ tự do) và **Ghi chú của bạn**.
- **Tìm kiếm:** ô tìm tìm trong nội dung, ghi chú, vị trí, tên sách và tác giả. App không phân biệt hoa thường và dấu: gõ `thoi gian` vẫn ra "Thời gian". Gõ nhiều từ thì quote phải chứa đủ các từ đó. Nút Tất cả / Trích dẫn / Trích đoạn lọc theo loại, kèm số lượng.
- **Biết quote từ sách nào:** mỗi quote hiện bìa sách và dòng "Trích từ <tên sách> · <tác giả> · <thể loại>". Bấm tên sách hoặc bìa để mở trang sách, app mở sẵn tab Trích dẫn của sách đó.
- **Trong trang sách:** có thêm tab **Trích dẫn** (cạnh Nhật ký đọc), chỉ gồm quotes của sách đó. Thêm quote ở đây thì không cần chọn sách.
- **Sửa và xoá:** dùng nút bút chì và thùng rác bên phải mỗi quote. Xoá sách thì quotes của sách đó bị xoá theo.

### Cảnh báo trùng tên sách

- Khi gõ tên sách trong form **Thêm sách** hoặc **Sửa thông tin sách**, nếu tên trùng với sách đã có, ô tên chuyển đỏ. Ngay dưới ô hiện danh sách sách trùng kèm tác giả, thể loại và trạng thái. App kiểm tra khoảng 0,4 giây sau khi ngừng gõ.
- Quy tắc so trùng:
  - Không phân biệt hoa thường, dấu câu, ký hiệu và khoảng trắng thừa. "Dune: Xứ Cát" trùng với "dune - xứ cát!".
  - **Vẫn phân biệt dấu tiếng Việt.** "Xứ Cát" không trùng "Xu Cat".
- Popup "Tên sách bị trùng" hiện khi:
  - rời ô tên để sang ô khác trong form (Tab hoặc bấm vào ô khác);
  - hoặc bấm **Thêm vào kệ** / **Lưu thay đổi** khi tên đang trùng.
- Popup có hai lựa chọn:
  - **Có, nhập tiếp:** nhập và lưu bình thường. Với tên đó, app không hỏi lại trong lần mở form này. Nếu popup bật lên lúc bấm lưu thì app lưu luôn sau khi chọn.
  - **Không, huỷ thêm sách** (form thêm): đóng form, không lưu gì. **Không, giữ tên cũ** (form sửa): trả ô tên về tên ban đầu.
- Bấm X hoặc Esc trên popup chỉ đóng popup. Lần bấm lưu sau vẫn hỏi lại.
- Bấm **Huỷ** của form khi tên đang trùng thì không bật popup.
- Sửa một sách mà không đổi tên thì không cảnh báo, kể cả khi sách đó vốn đã trùng tên với sách khác.

### Lọc theo tác giả ở trang chủ (Kệ sách)

- Bộ lọc "Năm phát hành" đã bỏ. Ô năm còn lại là **năm đọc**, hiện là "Mọi năm đọc".
- Nút **Tác giả** (biểu tượng bút) mở danh sách tác giả có ô tìm và số sách của từng tác giả. Đang xem một thể loại (Fiction, Fanfiction...) thì danh sách và số đếm chỉ tính trong thể loại đó.
- Chọn được nhiều tác giả. Kệ hiện sách của **bất kỳ** tác giả nào đã chọn, khác với tag/fandom là phải có đủ.
- Ô tác giả của sách có nhiều người, cách nhau bằng dấu phẩy hoặc chấm phẩy, được tách thành từng tác giả. "Terry Pratchett, Neil Gaiman" hiện ở cả hai tác giả.
- Sắp xếp theo năm phát hành vẫn còn trong ô sắp xếp, vì đó là sắp xếp chứ không phải bộ lọc.
- Link cũ có `year_mode=release` sẽ bỏ qua điều kiện năm.

## Danh mục thay đổi

**File mới (8)**

- `server/db/migrations/016_quotes.js`:
  - Tạo bảng `quotes` (`item_id`, `kind` quote/highlight, `content`, `note`, `location`, `sync_uid`, `created_at`, `updated_at`).
  - Có trigger cấp `sync_uid` và trigger ghi dấu xoá vào `sync_deletions`.
- `server/models/quoteModel.js`, `server/services/quoteService.js`, `server/validators/quoteValidators.js`: API quotes. Tìm kiếm không phân biệt hoa thường và dấu được làm trong JS, vì `LIKE` của SQLite chỉ gộp hoa thường cho chữ ASCII.
- `server/tests/patch6-quotes.test.js`: 5 test.
  - CRUD quotes.
  - Tìm kiếm.
  - Trùng tên.
  - Lọc tác giả.
  - Đồng bộ Drive hai máy có quotes, gồm sửa, xoá và đồng bộ lặp lại không đẩy qua lại.
- `client/src/components/quotes/QuoteList.jsx`: danh sách, tìm kiếm, lọc loại, form thêm/sửa, xác nhận xoá. Dùng chung cho trang Quotes và tab trong trang sách.
- `client/src/pages/QuotesPage.jsx`: trang `/quotes`.
- `DOC-PATCH-PHIEN-6.md`: tài liệu này.

**File sửa: server**

- `server/db/migrations/index.js`: đăng ký migration 016.
- `server/models/index.js`, `server/services/index.js`: đăng ký model và service quotes.
- `server/routes/routeTable.js`: các route mới, chạy cả bản Windows lẫn bản điện thoại.
  - `GET/POST /quotes`
  - `PATCH/DELETE /quotes/:id`
  - `GET /items/title-check?title=&exclude_id=`
- `server/validators/itemValidators.js`:
  - Thêm tham số `author` cho `GET /items`. Tham số này không tách theo dấu phẩy, vì tên tác giả có thể có dấu phẩy.
  - Thêm schema `titleCheckQuerySchema`.
- `server/models/itemModel.js`: lọc `author` (tách tác giả theo `,` `;`, không phân biệt hoa thường, nhiều tác giả là OR); hàm `splitAuthors`.
- `server/services/itemService.js`:
  - `titleKey`, `titleMatches`.
  - `authorFacet`: `facets.authors` gồm tên, tổng số sách và số theo thể loại.
- `server/services/driveSync/units.js`, `apply.js`: quotes là dòng con của đơn vị sách khi đồng bộ Google Drive. Khoá `quotes` chỉ có mặt khi sách có quote.
- `server/services/dataService.js`: "Xoá toàn bộ dữ liệu" xoá cả bảng `quotes`.
- `server/scripts/acceptance.js`, `server/tests/db.test.js`, `phase3-wasm-db.test.js`, `phase4.test.js`, `storage.test.js`: đổi mốc schema v15 thành v16. Các test mô phỏng DB cũ xoá thêm bảng `quotes`.

**File sửa: client**

- `client/src/App.jsx`: route `/quotes`.
- `client/src/components/layout/AppShell.jsx`: tab Quotes (Trích dẫn) trong mục Sách.
- `client/src/pages/BookDetailPage.jsx`: tab Quotes trong trang sách (`?tab=quotes`).
- `client/src/components/books/BookFormDialog.jsx`:
  - Cảnh báo đỏ dưới ô tên.
  - Popup "Tên sách bị trùng".
  - Kiểm tra lại khi bấm lưu.
- `client/src/components/bookshelf/FilterBar.jsx`: bỏ "Năm phát hành", thêm bộ lọc Tác giả, ô năm chỉ còn năm đọc.
- `client/src/pages/BookshelfPage.jsx`: truyền `author` vào truy vấn, giữ bộ lọc tác giả trên URL.
- `client/src/hooks/queries.js`:
  - Thêm `useQuotes` và `fetchTitleMatches`.
  - Làm mới quotes khi sửa hoặc xoá sách.
- `client/src/i18n/source.json`, `client/src/i18n/locales/{en,zh,ja,vi}.tsv`: thêm 42 chuỗi giao diện mới, có bản dịch cho en, zh, ja và bản thuần Việt.

## Kiểm thử đã chạy

- `npm test`: 198/198 pass (193 cũ cộng 5 mới).
- `npm run verify`: PASS cả 5 mục, acceptance 68/68.
- `npm run build:pwa`: build bản điện thoại thành công.
- Chạy trên Chrome thật (bản Windows, server thật, dữ liệu mẫu):
  - Lọc 1 tác giả ra đúng 2 sách.
  - Cảnh báo đỏ và popup trùng tên. "Có" lưu được và không hỏi lại; "Không" đóng form, không tạo sách; bấm Huỷ không bật popup.
  - Trang Quotes: tìm `THOI GIAN` ra đúng 1 quote kèm nguồn; lọc loại; báo lỗi khi bỏ trống sách hoặc nội dung; thêm, sửa, xoá.
  - Tab Quotes trong trang sách.
  - Sửa sách không đổi tên thì không cảnh báo.
  - Giao diện tiếng Anh trên khung điện thoại 390px.
  - Không có lỗi console.

## Chưa kiểm hoặc chưa làm

Chưa kiểm, cần bạn tự kiểm khi nghiệm thu:

- Bản điện thoại trên GitHub Pages chạy trên máy Android thật. Phần dữ liệu (migration v16 trên SQLite WASM) có test tự động; giao diện bản PWA chưa mở trên trình duyệt.
- Đồng bộ Drive thật giữa Windows và điện thoại có quotes. Test tự động dùng Drive giả lập.
- Hiệu năng tìm kiếm với vài nghìn quotes. Mỗi lần tìm, app lọc toàn bộ quotes trong bộ nhớ; tôi suy luận là đủ nhanh với thư viện cá nhân nhưng chưa đo.

Chưa làm, đề xuất cho phiên sau:

- Đồng bộ Obsidian chưa ghi quotes vào file `.md` của sách.
- Chưa nhập highlight từ KOReader. Có thể ghép với kế hoạch KOReader.
- Chưa có nút sao chép quote, chưa xuất quotes ra file.
- Cảnh báo trùng tên chỉ áp dụng cho sách, chưa áp dụng cho Phim ảnh (media).

## Checklist nghiệm thu

1. Sau khi áp patch, `kiem-tra.bat` báo 198 test pass và verify ĐẠT.
2. Mở app: dữ liệu cũ còn nguyên. Thư mục `backups` có file `truoc-khi-migrate-v15-v16-...`.
3. Kệ sách: không còn lựa chọn "Năm phát hành" trong bộ lọc. Nút Tác giả lọc đúng. Chọn hai tác giả thì ra sách của cả hai.
4. Thêm sách với tên đã có, viết khác hoa thường hoặc dấu câu: ô tên đỏ, hiện sách trùng kèm tác giả. Nhấn Tab: popup hiện ra.
5. Ở popup:
   - "Có, nhập tiếp": lưu được sách.
   - "Không, huỷ thêm sách": form đóng, không có sách mới.
6. Tab Trích dẫn:
   - Thêm 2–3 quote ở các sách khác nhau.
   - Tìm theo từ không dấu ra đúng quote, có tên sách và tác giả.
   - Bấm tên sách thì mở trang sách ở tab Trích dẫn.
7. Sửa và xoá một quote. Xoá một sách có quote thì quote của sách đó biến mất khỏi tab Trích dẫn.
8. Trên điện thoại, sau khi chạy `trien-khai-pages.bat`: tab Trích dẫn dùng được. Đồng bộ Windows rồi đồng bộ điện thoại thì quotes sang đủ.
