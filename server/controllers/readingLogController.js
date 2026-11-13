export function createReadingLogController({ services }) {
  const { readingLogs } = services;

  return {
    async list(req, res) {
      res.json(await readingLogs.list(req.valid.query));
    },

    async create(req, res) {
      res.status(201).json(await readingLogs.create(req.valid.body));
    },

    async update(req, res) {
      res.json(await readingLogs.update(req.valid.params.id, req.valid.body));
    },

    async remove(req, res) {
      await readingLogs.delete(req.valid.params.id);
      res.status(204).end();
    },
  };
}
