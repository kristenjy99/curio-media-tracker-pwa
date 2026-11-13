import fs from 'node:fs/promises';
import path from 'node:path';
import { joinStorePath } from './fileStore.js';

/**
 * Bản FileStore cho Windows/Node: lưu thẳng xuống đĩa trong thư mục gốc được truyền vào
 * (thường là <storage>/uploads). Mọi đường dẫn đều được kiểm tra không vượt ra ngoài gốc.
 */
export function createNodeFileStore(rootDir) {
  const root = path.resolve(rootDir);

  function toAbsolute(relPath) {
    const normalized = joinStorePath(relPath);
    if (!normalized) return null;
    const absolute = path.resolve(root, ...normalized.split('/'));
    const relative = path.relative(root, absolute);
    if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
    return absolute;
  }

  return {
    root,

    resolve(relPath) {
      return Promise.resolve(toAbsolute(relPath));
    },

    async write(relPath, buffer) {
      const absolute = toAbsolute(relPath);
      if (!absolute) throw new Error(`Đường dẫn không hợp lệ: ${relPath}`);
      await fs.mkdir(path.dirname(absolute), { recursive: true });
      await fs.writeFile(absolute, buffer);
      return relPath;
    },

    async read(relPath) {
      const absolute = toAbsolute(relPath);
      if (!absolute) return null;
      try {
        return await fs.readFile(absolute);
      } catch (error) {
        if (error.code === 'ENOENT') return null;
        throw error;
      }
    },

    async exists(relPath) {
      const absolute = toAbsolute(relPath);
      if (!absolute) return false;
      try {
        await fs.access(absolute);
        return true;
      } catch {
        return false;
      }
    },

    async remove(relPath) {
      const absolute = toAbsolute(relPath);
      if (absolute) await fs.rm(absolute, { force: true });
    },

    async removeDir(relPath) {
      const absolute = toAbsolute(relPath);
      if (absolute) await fs.rm(absolute, { recursive: true, force: true });
    },
  };
}
