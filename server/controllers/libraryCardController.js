export function createLibraryCardController({ services }) {
  const { libraryCards } = services;

  return {
    async listByItem(req, res) {
      res.json({ data: await libraryCards.listByItem(req.valid.params.itemId) });
    },

    async create(req, res) {
      res.status(201).json(await libraryCards.create(req.valid.params.itemId, req.valid.body));
    },

    async update(req, res) {
      res.json(await libraryCards.update(req.valid.params.id, req.valid.body));
    },

    async remove(req, res) {
      await libraryCards.delete(req.valid.params.id);
      res.status(204).end();
    },
  };
}
