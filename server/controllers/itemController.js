export function createItemController({ services }) {
  const { items, images } = services;

  return {
    async list(req, res) {
      res.json(await items.list(req.valid.query));
    },

    async get(req, res) {
      res.json(await items.getDetail(req.valid.params.id));
    },

    async create(req, res) {
      const item = await items.create(req.valid.body);
      res.status(201).location(`/api/items/${item.id}`).json(item);
    },

    async update(req, res) {
      res.json(await items.update(req.valid.params.id, req.valid.body));
    },

    async remove(req, res) {
      await items.delete(req.valid.params.id);
      res.status(204).end();
    },

    async uploadImage(req, res) {
      const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      res.json(await images.upload(req.valid.params.id, req.valid.params.kind, body));
    },

    async removeImage(req, res) {
      res.json(await images.remove(req.valid.params.id, req.valid.params.kind));
    },

    async facets(req, res) {
      res.json(await items.facets());
    },

    /** Pairing kèm số sách, chỉ tính các sách có đủ mọi fandom trong ?fandom= (lặp lại được). */
    async pairings(req, res) {
      const raw = req.query.fandom;
      const fandoms = (Array.isArray(raw) ? raw : raw ? [raw] : []).map((value) => String(value).trim()).filter(Boolean).slice(0, 20);
      res.json({ data: await items.pairingsForFandoms(fandoms) });
    },

    async listTags(req, res) {
      res.json({ data: await items.listTags() });
    },
  };
}
