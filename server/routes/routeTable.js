import { createDashboardController } from '../controllers/dashboardController.js';
import { createFeaturesController } from '../controllers/featuresController.js';
import { createImportController } from '../controllers/importController.js';
import { createItemController } from '../controllers/itemController.js';
import { createLibraryCardController } from '../controllers/libraryCardController.js';
import { createReadingLogController } from '../controllers/readingLogController.js';
import { createReadingNoteController } from '../controllers/readingNoteController.js';
import { createSettingsController } from '../controllers/settingsController.js';
import { createStorageController } from '../controllers/storageController.js';
import { createSyncController } from '../controllers/syncController.js';
import { createTemplateController } from '../controllers/templateController.js';
import { createSystemController } from '../controllers/systemController.js';
import { seriesOrderSchema } from '../services/seriesService.js';
import { exportSchema, passwordSchema, wipeSchema } from '../services/dataService.js';
import { idParam, itemIdParam } from '../validators/common.js';
import { analyzeImportSchema, convertImportSchema } from '../validators/importValidators.js';
import { imageParams, markdownImportSchema } from '../validators/markdownImportValidators.js';
import { dashboardQuerySchema } from '../validators/dashboardValidators.js';
import * as fv from '../validators/featuresValidators.js';
import { createItemSchema, listItemsQuerySchema, updateItemSchema } from '../validators/itemValidators.js';
import { createLibraryCardSchema, updateLibraryCardSchema } from '../validators/libraryCardValidators.js';
import {
  createReadingLogSchema,
  listReadingLogsQuerySchema,
  updateReadingLogSchema,
} from '../validators/readingLogValidators.js';
import { noteFileParams, noteFileQuery, upsertReadingNoteSchema } from '../validators/readingNoteValidators.js';
import { updateSettingsSchema } from '../validators/settingsValidators.js';
import { browseQuerySchema, changeStorageSchema, inspectStorageSchema } from '../validators/storageValidators.js';
import { runSyncQuerySchema, updateSyncConfigSchema } from '../validators/syncConfigValidators.js';
import { categoryParam, previewBody, templateBody } from '../validators/templateValidators.js';

/**
 * Bảng route của API sách, dạng khai báo và không phụ thuộc Express.
 *
 * Trên Node, server/http/expressAdapter.js gắn bảng này vào một Express Router.
 * Trên PWA, server/http/dispatch.js gọi thẳng handler trong trình duyệt với cùng bảng này.
 *
 * Mỗi dòng: { method, path, handler, validate?, rawBody?, nodeOnly? }. Thứ tự các dòng là thứ tự dò
 * route, nên dòng cụ thể phải đứng trước dòng có tham số: '/items/facets' trước '/items/:id'.
 *
 * `nodeOnly: true` là những tính năng cần đĩa hoặc Windows — chọn thư mục lưu trữ, đồng bộ Obsidian
 * (đọc/ghi vault), lối tắt Desktop. Bản PWA lọc các dòng này ra khỏi dispatcher
 * (xem server/platform/browserContext.js) nên gọi vào sẽ nhận 404 thay vì lỗi "fs không tồn tại".
 */
export function createApiRouteTable(context) {
  const system = createSystemController(context);
  const items = createItemController(context);
  const cards = createLibraryCardController(context);
  const notes = createReadingNoteController(context);
  const logs = createReadingLogController(context);
  const sync = createSyncController(context);
  const storage = createStorageController(context);
  const templates = createTemplateController(context);
  const importer = createImportController(context);
  const settings = createSettingsController(context);
  const dashboard = createDashboardController(context);
  const f = createFeaturesController(context);
  const { data, items: itemService, series } = context.services;

  return [
    { method: 'GET', path: '/health', handler: system.health },
    { method: 'GET', path: '/system/info', handler: system.info },
    // Cấu hình vault Obsidian là thiết lập riêng của từng máy và cần đọc thư mục trên đĩa.
    { method: 'GET', path: '/sync-config', nodeOnly: true, handler: system.getSyncConfig },
    { method: 'PATCH', path: '/sync-config', nodeOnly: true, validate: { body: updateSyncConfigSchema }, handler: system.updateSyncConfig },

    { method: 'GET', path: '/settings', handler: settings.get },
    { method: 'PATCH', path: '/settings', validate: { body: updateSettingsSchema }, handler: settings.update },
    { method: 'POST', path: '/settings/appearance/reset', handler: settings.resetAppearance },
    { method: 'PUT', path: '/settings/background', rawBody: '15mb', handler: settings.uploadBackground },
    { method: 'DELETE', path: '/settings/background', handler: settings.removeBackground },
    { method: 'PUT', path: '/settings/app-icon', rawBody: '3mb', handler: settings.uploadAppIcon },
    { method: 'DELETE', path: '/settings/app-icon', handler: settings.removeAppIcon },
    { method: 'POST', path: '/system/desktop-shortcut', nodeOnly: true, handler: settings.desktopShortcut },
    { method: 'POST', path: '/settings/ornaments', rawBody: '4mb', handler: settings.uploadOrnament },
    { method: 'DELETE', path: '/settings/ornaments/:id', handler: settings.removeOrnament },

    { method: 'GET', path: '/obsidian/vaults', nodeOnly: true, handler: sync.vaults },
    { method: 'GET', path: '/sync/status', nodeOnly: true, handler: sync.status },
    { method: 'POST', path: '/sync/run', nodeOnly: true, validate: { query: runSyncQuerySchema }, handler: sync.run },

    // Category "Visual/Comics" có dấu "/", client phải encode thành "Visual%2FComics".
    { method: 'GET', path: '/templates', handler: templates.list },
    { method: 'GET', path: '/templates/:category', validate: { params: categoryParam }, handler: templates.get },
    { method: 'PUT', path: '/templates/:category', validate: { params: categoryParam, body: templateBody }, handler: templates.save },
    { method: 'POST', path: '/templates/:category/reset', validate: { params: categoryParam }, handler: templates.reset },
    { method: 'POST', path: '/templates/:category/preview', validate: { params: categoryParam, body: previewBody }, handler: templates.preview },

    { method: 'GET', path: '/storage', nodeOnly: true, handler: storage.info },
    { method: 'POST', path: '/storage/inspect', nodeOnly: true, validate: { body: inspectStorageSchema }, handler: storage.inspect },
    { method: 'PUT', path: '/storage', nodeOnly: true, validate: { body: changeStorageSchema }, handler: storage.change },
    { method: 'GET', path: '/fs/dirs', nodeOnly: true, validate: { query: browseQuerySchema }, handler: storage.browse },

    { method: 'GET', path: '/data/status', handler: async (req, res) => res.json(await data.status()) },
    { method: 'PUT', path: '/data/password', validate: { body: passwordSchema }, handler: async (req, res) => res.json(await data.setPassword(req.valid.body)) },
    { method: 'POST', path: '/data/wipe', validate: { body: wipeSchema }, handler: async (req, res) => res.json(await data.wipe(req.valid.body)) },
    // Xuất file DB: trả byte, client tự hỏi người dùng lưu vào đâu.
    {
      method: 'POST',
      path: '/data/export',
      validate: { body: exportSchema },
      handler: async (req, res) => {
        const { bytes, filename } = await data.exportDb(req.valid.body);
        res.type('application/octet-stream');
        res.set('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes));
      },
    },

    { method: 'GET', path: '/items/fandom-pairings', handler: async (req, res) => res.json({ data: await itemService.fandomPairings() }) },
    { method: 'GET', path: '/items/tags', handler: async (req, res) => res.json({ data: await itemService.tagsForCategory(req.query.category) }) },
    { method: 'GET', path: '/series', handler: async (req, res) => res.json(await series.list()) },
    { method: 'GET', path: '/authors', handler: async (req, res) => res.json(await series.authors()) },
    { method: 'PUT', path: '/series/order', validate: { body: seriesOrderSchema }, handler: async (req, res) => res.json(await series.saveOrder(req.valid.body)) },
    { method: 'GET', path: '/dashboard', validate: { query: dashboardQuerySchema }, handler: dashboard.get },
    { method: 'GET', path: '/tags', handler: items.listTags },

    { method: 'GET', path: '/readings', validate: { query: fv.yearQuery }, handler: f.readings },
    { method: 'GET', path: '/goals', validate: { query: fv.yearQuery }, handler: f.goalsList },
    { method: 'PUT', path: '/goals', validate: { body: fv.goalBody }, handler: f.goalSet },
    { method: 'DELETE', path: '/goals/:id', validate: { params: idParam }, handler: f.goalRemove },
    { method: 'POST', path: '/items/:id/start-reading', validate: { params: idParam, body: fv.startBody }, handler: f.startReading },

    { method: 'GET', path: '/challenges', handler: f.challenges },
    { method: 'POST', path: '/challenges', validate: { body: fv.createChallengeSchema }, handler: f.challengeCreate },
    { method: 'PATCH', path: '/challenges/:id', validate: { params: idParam, body: fv.renameChallengeSchema }, handler: f.challengeRename },
    { method: 'DELETE', path: '/challenges/:id', validate: { params: idParam }, handler: f.challengeRemove },
    { method: 'POST', path: '/challenges/:id/prompts', validate: { params: idParam, body: fv.promptBody }, handler: f.promptAdd },
    { method: 'PATCH', path: '/challenge-slots/:id', validate: { params: idParam, body: fv.slotPatchSchema }, handler: f.slotUpdate },
    { method: 'DELETE', path: '/challenge-slots/:id', validate: { params: idParam }, handler: f.slotRemove },

    { method: 'GET', path: '/favorites/:year', validate: { params: fv.yearParams }, handler: f.favorites },
    { method: 'PUT', path: '/favorites/:year/:month', validate: { params: fv.favoritesParams, body: fv.favoritesBody }, handler: f.favoritesSet },

    { method: 'GET', path: '/brackets/candidates/:year', validate: { params: fv.yearParams }, handler: f.bracketCandidates },
    { method: 'GET', path: '/brackets', validate: { query: fv.yearQuery }, handler: f.brackets },
    { method: 'POST', path: '/brackets', validate: { body: fv.createBracketSchema }, handler: f.bracketCreate },
    { method: 'PUT', path: '/brackets/:id/pick', validate: { params: idParam, body: fv.pickSchema }, handler: f.bracketPick },
    { method: 'DELETE', path: '/brackets/:id', validate: { params: idParam }, handler: f.bracketRemove },

    { method: 'POST', path: '/import/analyze', validate: { body: analyzeImportSchema }, handler: importer.analyze },
    { method: 'POST', path: '/import/preview', validate: { body: convertImportSchema }, handler: importer.preview },
    { method: 'POST', path: '/import/commit', validate: { body: convertImportSchema }, handler: importer.commit },
    { method: 'POST', path: '/import/markdown/preview', validate: { body: markdownImportSchema }, handler: importer.markdownPreview },
    { method: 'POST', path: '/import/markdown/commit', validate: { body: markdownImportSchema }, handler: importer.markdownCommit },

    { method: 'GET', path: '/items', validate: { query: listItemsQuerySchema }, handler: items.list },
    { method: 'GET', path: '/items/facets', handler: items.facets },
    { method: 'GET', path: '/items/pairings', handler: items.pairings },
    { method: 'POST', path: '/items', validate: { body: createItemSchema }, handler: items.create },
    { method: 'GET', path: '/items/:id', validate: { params: idParam }, handler: items.get },
    { method: 'PATCH', path: '/items/:id', validate: { params: idParam, body: updateItemSchema }, handler: items.update },
    { method: 'DELETE', path: '/items/:id', validate: { params: idParam }, handler: items.remove },
    // Ảnh gửi thẳng dạng nhị phân (body là file ảnh), không cần multipart.
    { method: 'PUT', path: '/items/:id/images/:kind', rawBody: '15mb', validate: { params: imageParams }, handler: items.uploadImage },
    { method: 'DELETE', path: '/items/:id/images/:kind', validate: { params: imageParams }, handler: items.removeImage },

    { method: 'GET', path: '/items/:itemId/library-cards', validate: { params: itemIdParam }, handler: cards.listByItem },
    { method: 'POST', path: '/items/:itemId/library-cards', validate: { params: itemIdParam, body: createLibraryCardSchema }, handler: cards.create },
    { method: 'PATCH', path: '/library-cards/:id', validate: { params: idParam, body: updateLibraryCardSchema }, handler: cards.update },
    { method: 'DELETE', path: '/library-cards/:id', validate: { params: idParam }, handler: cards.remove },

    { method: 'GET', path: '/items/:itemId/note', validate: { params: itemIdParam }, handler: notes.get },
    { method: 'PUT', path: '/items/:itemId/note', validate: { params: itemIdParam, body: upsertReadingNoteSchema }, handler: notes.upsert },
    // Tải ảnh moodboard/nhân vật/ảnh chèn trong note hoặc file đính kèm (tối đa 50MB), body là file nhị phân.
    { method: 'POST', path: '/items/:id/files', rawBody: '51mb', validate: { params: noteFileParams, query: noteFileQuery }, handler: notes.uploadFile },

    { method: 'GET', path: '/reading-logs', validate: { query: listReadingLogsQuerySchema }, handler: logs.list },
    { method: 'POST', path: '/reading-logs', validate: { body: createReadingLogSchema }, handler: logs.create },
    { method: 'PATCH', path: '/reading-logs/:id', validate: { params: idParam, body: updateReadingLogSchema }, handler: logs.update },
    { method: 'DELETE', path: '/reading-logs/:id', validate: { params: idParam }, handler: logs.remove },
  ];
}
