export function createImportController({ services }) {
  const { importer, markdownImport } = services;
  return {
    analyze(req, res) {
      res.json(importer.analyze(req.valid.body));
    },
    async preview(req, res) {
      res.json(await importer.preview(req.valid.body));
    },
    async commit(req, res) {
      res.json(await importer.commit(req.valid.body));
    },
    async markdownPreview(req, res) {
      res.json(await markdownImport.preview(req.valid.body));
    },
    async markdownCommit(req, res) {
      res.json(await markdownImport.commit(req.valid.body));
    },
  };
}
