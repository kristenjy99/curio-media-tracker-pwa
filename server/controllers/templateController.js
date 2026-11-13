export function createTemplateController({ services }) {
  const { templates } = services;

  return {
    async list(req, res) {
      res.json({ templates: await templates.all(), catalog: templates.catalog() });
    },

    async get(req, res) {
      res.json(await templates.get(req.valid.params.category));
    },

    async save(req, res) {
      res.json(await templates.save(req.valid.params.category, req.valid.body));
    },

    async reset(req, res) {
      res.json(await templates.reset(req.valid.params.category));
    },

    async preview(req, res) {
      const markdown = await templates.preview(req.valid.params.category, req.valid.body);
      res.type('text/markdown; charset=utf-8').send(markdown);
    },
  };
}
