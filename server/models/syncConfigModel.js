import { buildSetClause, fromDbRow, toDbParams } from '../utils/sql.js';

const WRITABLE_COLUMNS = ['vault_path', 'sync_enabled', 'last_sync_time', 'vault_subfolder', 'sync_direction', 'category_folders', 'folder_names', 'media_subfolder'];
const BOOLEAN_FIELDS = ['sync_enabled', 'category_folders'];

export const DEFAULT_FOLDER_NAMES = { Fiction: 'Fiction', Fanfiction: 'Fanfiction', Nonfiction: 'Nonfiction', 'Visual/Comics': 'Comics' };

const SQL_GET =
  'SELECT vault_path, vault_subfolder, sync_direction, sync_enabled, category_folders, folder_names, media_subfolder, last_sync_time FROM obsidian_sync_config WHERE id = 1';
const SQL_ENSURE = 'INSERT OR IGNORE INTO obsidian_sync_config (id) VALUES (1)';

function parseObject(value) {
  try {
    const parsed = JSON.parse(value ?? '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function createSyncConfigModel(db) {
  return {
    async get() {
      await db.run(SQL_ENSURE);
      const row = fromDbRow(await db.get(SQL_GET), { booleanFields: BOOLEAN_FIELDS });
      return { ...row, folder_names: { ...DEFAULT_FOLDER_NAMES, ...parseObject(row.folder_names) } };
    },

    async update(patch) {
      await db.run(SQL_ENSURE);
      const params = toDbParams(patch, { booleanFields: BOOLEAN_FIELDS });
      if (patch.folder_names !== undefined) params.folder_names = JSON.stringify(patch.folder_names ?? {});
      const { columns, clause } = buildSetClause(params, WRITABLE_COLUMNS);
      if (columns.length > 0) {
        const picked = Object.fromEntries(columns.map((c) => [c, params[c]]));
        await db.run(`UPDATE obsidian_sync_config SET ${clause} WHERE id = 1`, picked);
      }
      return this.get();
    },
  };
}
