import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ValidationError } from '../utils/errors.js';

function listWindowsDrives() {
  const drives = [];
  for (let code = 65; code <= 90; code += 1) {
    const root = `${String.fromCharCode(code)}:\\`;
    try {
      fs.accessSync(root);
      drives.push({ name: root, path: root });
    } catch {
      // ổ không tồn tại
    }
  }
  return drives;
}

export function createStorageController({ services }) {
  const { storage } = services;

  return {
    info(req, res) {
      res.json(storage.info());
    },

    inspect(req, res) {
      res.json(storage.inspect(req.valid.body.path));
    },

    async change(req, res) {
      res.json(await storage.change(req.valid.body));
    },

    /** Duyệt thư mục cho hộp thoại chọn folder ở frontend (trình duyệt không trả về đường dẫn tuyệt đối). */
    browse(req, res) {
      const { path: requested, show_hidden: showHidden } = req.valid.query;
      if (!requested) {
        const roots = process.platform === 'win32' ? listWindowsDrives() : [{ name: '/', path: '/' }];
        return res.json({ path: null, parent: null, home: os.homedir(), dirs: roots });
      }

      const dir = path.resolve(requested);
      let entries;
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch (error) {
        throw new ValidationError(`Không đọc được thư mục: ${error.code ?? error.message}`, [
          { path: ['path'], message: dir },
        ]);
      }
      const dirs = entries
        .filter((entry) => entry.isDirectory() && (showHidden || !entry.name.startsWith('.')))
        .map((entry) => ({ name: entry.name, path: path.join(dir, entry.name) }))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
        .slice(0, 2000);
      const parent = path.dirname(dir);
      return res.json({
        path: dir,
        parent: parent === dir ? null : parent,
        home: os.homedir(),
        is_obsidian_vault: fs.existsSync(path.join(dir, '.obsidian')),
        dirs,
      });
    },
  };
}
