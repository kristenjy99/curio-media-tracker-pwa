export function createSettingsController({ services }) {
  const { settings } = services;
  return {
    async get(req, res) {
      res.json(await settings.get());
    },
    async update(req, res) {
      res.json(await settings.update(req.valid.body));
    },
    async resetAppearance(req, res) {
      res.json(await settings.resetAppearance());
    },
    async uploadBackground(req, res) {
      res.json(await settings.uploadBackground(Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0)));
    },
    async removeBackground(req, res) {
      res.json(await settings.removeBackground());
    },
    async uploadAppIcon(req, res) {
      res.status(201).json(await settings.uploadAppIcon(Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0)));
    },
    async removeAppIcon(req, res) {
      res.json(await settings.removeAppIcon());
    },
    async desktopShortcut(req, res) {
      res.json(await settings.desktopShortcut());
    },
    async uploadOrnament(req, res) {
      res.status(201).json(await settings.uploadOrnament(Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0), typeof req.query.name === 'string' ? req.query.name : ''));
    },
    async removeOrnament(req, res) {
      res.json(await settings.removeOrnament(String(req.params.id)));
    },
  };
}
