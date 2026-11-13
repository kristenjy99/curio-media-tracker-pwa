import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Obsidian ghi danh sách vault đã từng mở vào obsidian.json trong thư mục cấu hình của nó.
 * Đọc file này để người dùng chọn vault bằng một cú bấm thay vì tự tìm đường dẫn.
 */
export function obsidianConfigCandidates() {
  if (process.env.READING_TRACKER_OBSIDIAN_CONFIG) return [process.env.READING_TRACKER_OBSIDIAN_CONFIG];
  const home = os.homedir();
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    return [path.join(appData, 'obsidian', 'obsidian.json')];
  }
  if (process.platform === 'darwin') return [path.join(home, 'Library', 'Application Support', 'obsidian', 'obsidian.json')];
  return [
    path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), 'obsidian', 'obsidian.json'),
    path.join(home, '.var', 'app', 'md.obsidian.Obsidian', 'config', 'obsidian', 'obsidian.json'),
    path.join(home, 'snap', 'obsidian', 'current', '.config', 'obsidian', 'obsidian.json'),
  ];
}

export function discoverVaults(candidates = obsidianConfigCandidates()) {
  const vaults = new Map();
  const checked = [];
  for (const file of candidates) {
    checked.push(file);
    let data;
    try {
      data = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      continue;
    }
    for (const entry of Object.values(data?.vaults ?? {})) {
      if (!entry?.path || vaults.has(entry.path)) continue;
      const exists = fs.existsSync(entry.path);
      vaults.set(entry.path, {
        path: entry.path,
        name: path.basename(entry.path),
        exists,
        is_vault: exists && fs.existsSync(path.join(entry.path, '.obsidian')),
        open: Boolean(entry.open),
        last_opened: typeof entry.ts === 'number' ? new Date(entry.ts).toISOString() : null,
      });
    }
  }
  return {
    vaults: [...vaults.values()].sort((a, b) => Number(b.open) - Number(a.open) || String(b.last_opened).localeCompare(String(a.last_opened))),
    checked,
  };
}
