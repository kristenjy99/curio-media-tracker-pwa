import fs from 'node:fs';
import path from 'node:path';
import { ValidationError } from '../utils/errors.js';

function assertDirectory(dirPath) {
  let stat;
  try {
    stat = fs.statSync(dirPath);
  } catch {
    throw new ValidationError('vault_path không tồn tại', [{ path: ['vault_path'], message: dirPath }]);
  }
  if (!stat.isDirectory()) {
    throw new ValidationError('vault_path không phải thư mục', [{ path: ['vault_path'], message: dirPath }]);
  }
}

export function createSyncConfigService({ models }) {
  const { syncConfig } = models;

  function withDiagnostics(config) {
    const isVault = Boolean(config.vault_path) && fs.existsSync(path.join(config.vault_path, '.obsidian'));
    return {
      ...config,
      // Vault Obsidian luôn có thư mục .obsidian; thiếu thì nhiều khả năng người dùng chọn nhầm thư mục.
      vault_detected: config.vault_path ? isVault : null,
    };
  }

  return {
    async get() {
      return withDiagnostics(await syncConfig.get());
    },

    async update(patch) {
      const merged = { ...(await syncConfig.get()), ...patch };
      if (patch.vault_path) assertDirectory(patch.vault_path);
      if (merged.sync_enabled && !merged.vault_path) {
        throw new ValidationError('Cần cấu hình vault_path trước khi bật sync', [
          { path: ['sync_enabled'], message: 'vault_path đang trống' },
        ]);
      }
      return withDiagnostics(await syncConfig.update(patch));
    },
  };
}
