import { createDispatcher } from '../http/dispatch.js';
import { createMediaRouteTable } from '../media/routeTable.js';
import { createModels } from '../models/index.js';
import { createApiRouteTable } from '../routes/routeTable.js';
import { createServices } from '../services/index.js';
import { createBrowserFileStore, createIndexedDbBackend } from '../storage/browserFileStore.js';
import { openBrowserDatabases } from './browserConnection.js';

/**
 * Lắp ghép toàn bộ "server" cho bản PWA, tương đương buildContext trong server/app.js nhưng không
 * có Express, không có thư mục trên đĩa và không có chức năng đổi thư mục lưu trữ.
 *
 * Khác biệt so với bản Windows, tất cả đều có lý do:
 *  - `storagePaths: null`: trình duyệt không có đường dẫn đĩa. Mọi chỗ đọc/ghi file đi qua FileStore.
 *  - `desktop: null`: không có .ico và lối tắt Desktop (xem server/services/settingsService.js).
 *  - `services.obsidianSync` không được lắp: đồng bộ Obsidian đọc/ghi vault trên đĩa. Các route của
 *    nó đã bị cờ `nodeOnly` lọc ra nên không có đường gọi tới.
 *  - Hai FileStore dùng chung một IndexedDB, tách nhau bằng tiền tố: sách không tiền tố, media là
 *    "media/" — phản ánh đúng cây <storage>/ và <storage>/media/ của bản Windows, nên tên file khớp
 *    nhau khi đồng bộ ở Phiên 5.
 *
 * Trả về hai dispatcher: `api` cho /api/... và `mediaApi` cho /api/media/.... Chúng nhận
 * { method, path, query, body, headers } và trả { status, headers, body } — xem server/http/dispatch.js.
 */
export async function createBrowserContext() {
  const { books, media, persistent, storageReason } = await openBrowserDatabases();

  const backend = createIndexedDbBackend();
  const fileStore = createBrowserFileStore({ backend });
  const mediaFileStore = createBrowserFileStore({ backend, prefix: 'media' });

  const context = {
    db: books.db,
    models: createModels(books.db),
    storagePaths: null,
    fileStore,
    mediaFileStore,
    desktop: null,
    startedAt: Date.now(),
    platform: 'pwa',
    persistent,
    storageReason,
  };
  context.services = createServices(context);
  context.mediaDb = media.db;
  context.mediaMigration = media.migration;
  context.mediaServices = {};

  const mediaTable = createMediaRouteTable({
    db: media.db,
    migration: media.migration,
    storagePaths: null,
    fileStore: mediaFileStore,
    services: context.mediaServices,
  });
  // Bảng route của sách dựng sau bảng media: seriesService và dataService cần context.mediaDb,
  // còn mediaServices được điền trong lúc dựng bảng media.
  const bookTable = createApiRouteTable(context).filter((route) => !route.nodeOnly);

  return {
    context,
    persistent,
    storageReason,
    schema: { books: books.migration.to, media: media.migration.to },
    api: createDispatcher(bookTable),
    mediaApi: createDispatcher(mediaTable.filter((route) => !route.nodeOnly)),
  };
}
