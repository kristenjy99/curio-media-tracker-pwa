import { discoverVaults } from '../services/obsidian/vaultDiscovery.js';

export function createSyncController({ services }) {
  const { obsidianSync } = services;

  return {
    vaults(req, res) {
      res.json(discoverVaults());
    },

    async status(req, res) {
      res.json(await obsidianSync.getStatus());
    },

    async run(req, res) {
      res.json(await obsidianSync.run({ dryRun: req.valid.query.dry_run ?? false }));
    },
  };
}
