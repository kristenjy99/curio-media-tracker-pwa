export function createReadingNoteController({ services }) {
  const { readingNotes, images } = services;

  return {
    async get(req, res) {
      res.json(await readingNotes.get(req.valid.params.itemId));
    },

    async upsert(req, res) {
      res.json(await readingNotes.upsert(req.valid.params.itemId, req.valid.body));
    },

    /** Body là nội dung file (nhị phân); loại file và tên gốc nằm trên query string. */
    async uploadFile(req, res) {
      const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      const file = await images.uploadNoteFile(req.valid.params.id, req.valid.query.kind, body, { name: req.valid.query.name });
      res.status(201).json(file);
    },
  };
}
