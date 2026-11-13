import { z } from 'zod';
import { createMediaDetailService, mediaNoteSchema, noteFileQuery, watchCardCreateSchema, watchCardUpdateSchema } from './mediaDetailService.js';
import { createMediaItemService, createSchema, listSchema, updateSchema } from './mediaItemService.js';
import { createMediaStatsService, statsQuerySchema } from './mediaStatsService.js';

const idParams = z.object({ id: z.coerce.number().int().positive() });

/**
 * Bảng route của API media, cùng dạng khai báo như phía sách (xem server/routes/routeTable.js).
 * Express gắn bảng này ở /api/media; bản PWA gọi thẳng handler qua server/http/dispatch.js.
 *
 * Route phục vụ file ảnh (/files/...) không nằm trong bảng: đó là việc của lớp vận chuyển
 * (express.static trên Node, FileStore của trình duyệt ở Phiên 3), không phải của handler.
 */
export function createMediaRouteTable({ db, migration, storagePaths, fileStore, services = {} }) {
  const items = createMediaItemService({ db, storagePaths, fileStore });
  const stats = createMediaStatsService({ db });
  const detail = createMediaDetailService({ db, storagePaths, items, fileStore });
  // Dùng chung với sync Obsidian và các service khác qua context.
  services.items = items;
  services.detail = detail;
  const id = (req) => req.valid.params.id;

  return [
    {
      method: 'GET',
      path: '/health',
      // Không có thư mục trên đĩa thì đó là bản PWA (DB nằm trên OPFS của trình duyệt), không phải DB in-memory.
      handler: (_req, res) => res.json({ ok: db.open, schema_version: migration.to, directory: storagePaths?.mediaDir ?? null }),
    },

    { method: 'GET', path: '/stats', validate: { query: statsQuerySchema }, handler: async (req, res) => res.json(await stats.get(req.valid.query)) },
    { method: 'GET', path: '/items/genres', handler: async (_req, res) => res.json(await items.genreNames()) },
    { method: 'GET', path: '/items/countries', handler: async (_req, res) => res.json(await items.countryNames()) },
    { method: 'GET', path: '/items/series', handler: async (_req, res) => res.json(await items.seriesNames()) },
    { method: 'GET', path: '/items/values', handler: async (_req, res) => res.json(await items.values()) },
    { method: 'GET', path: '/items', validate: { query: listSchema }, handler: async (req, res) => res.json(await items.list(req.valid.query)) },
    { method: 'POST', path: '/items', validate: { body: createSchema }, handler: async (req, res) => res.status(201).json(await items.create(req.valid.body)) },
    {
      method: 'GET',
      path: '/items/:id',
      validate: { params: idParams },
      handler: async (req, res) => res.json({ ...(await items.get(id(req))), watch_cards: await detail.cardsOf(id(req)) }),
    },
    { method: 'PATCH', path: '/items/:id', validate: { params: idParams, body: updateSchema }, handler: async (req, res) => res.json(await items.update(id(req), req.valid.body)) },
    {
      method: 'DELETE',
      path: '/items/:id',
      validate: { params: idParams },
      handler: async (req, res) => {
        await items.delete(id(req));
        res.status(204).end();
      },
    },
    {
      method: 'PUT',
      path: '/items/:id/cover',
      rawBody: '15mb',
      validate: { params: idParams },
      handler: async (req, res) => res.json(await items.setCover(id(req), Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0))),
    },
    { method: 'DELETE', path: '/items/:id/cover', validate: { params: idParams }, handler: async (req, res) => res.json(await items.removeCover(id(req))) },

    { method: 'GET', path: '/items/:id/watch-cards', validate: { params: idParams }, handler: async (req, res) => res.json(await detail.listCards(id(req))) },
    {
      method: 'POST',
      path: '/items/:id/watch-cards',
      validate: { params: idParams, body: watchCardCreateSchema },
      handler: async (req, res) => res.status(201).json(await detail.createCard(id(req), req.valid.body)),
    },
    { method: 'PATCH', path: '/watch-cards/:id', validate: { params: idParams, body: watchCardUpdateSchema }, handler: async (req, res) => res.json(await detail.updateCard(id(req), req.valid.body)) },
    {
      method: 'DELETE',
      path: '/watch-cards/:id',
      validate: { params: idParams },
      handler: async (req, res) => {
        await detail.deleteCard(id(req));
        res.status(204).end();
      },
    },
    { method: 'GET', path: '/items/:id/note', validate: { params: idParams }, handler: async (req, res) => res.json(await detail.getNote(id(req))) },
    { method: 'PUT', path: '/items/:id/note', validate: { params: idParams, body: mediaNoteSchema }, handler: async (req, res) => res.json(await detail.saveNote(id(req), req.valid.body)) },
    {
      method: 'POST',
      path: '/items/:id/files',
      rawBody: '60mb',
      validate: { params: idParams, query: noteFileQuery },
      handler: async (req, res) => {
        const { kind, name } = req.valid.query;
        res.status(201).json(await detail.uploadFile(id(req), kind, Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0), { name }));
      },
    },
  ];
}
