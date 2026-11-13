export function createDashboardController({ services }) {
  return {
    async get(req, res) {
      res.json(await services.dashboard.get(req.valid.query));
    },
  };
}
