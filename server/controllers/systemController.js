/**
 * `platform` cho giao diện biết mình đang chạy ở đâu ('node' trên Windows, 'pwa' trong trình duyệt)
 * để ẩn các mục chỉ có trên Windows: thư mục lưu trữ, đồng bộ Obsidian, lối tắt Desktop.
 * `persistent` chỉ có nghĩa trên PWA: false là đang mở DB trong bộ nhớ vì không dùng được OPFS.
 */
export function createSystemController({ db, services, storagePaths, startedAt, platform = 'node', persistent = true, storageReason = null }) {
  const { syncConfig } = services;

  return {
    async health(req, res) {
      await db.get('SELECT 1');
      res.json({ status: 'ok', uptime_seconds: Math.round((Date.now() - startedAt) / 1000) });
    },

    async info(req, res) {
      res.json({
        schema_version: await db.pragma('user_version', { simple: true }),
        journal_mode: await db.pragma('journal_mode', { simple: true }),
        storage: storagePaths,
        node_version: globalThis.process?.version ?? null,
        platform,
        persistent,
        storage_reason: storageReason,
      });
    },

    async getSyncConfig(req, res) {
      res.json(await syncConfig.get());
    },

    async updateSyncConfig(req, res) {
      res.json(await syncConfig.update(req.valid.body));
    },
  };
}
