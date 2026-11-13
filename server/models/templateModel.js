import { nowIso } from '../utils/sql.js';

const SQL_GET = 'SELECT * FROM obsidian_templates WHERE category = ?';
const SQL_UPSERT = `
    INSERT INTO obsidian_templates (category, properties, body_template, updated_at)
    VALUES (@category, @properties, @body_template, @updated_at)
    ON CONFLICT (category) DO UPDATE SET
      properties = excluded.properties,
      body_template = excluded.body_template,
      updated_at = excluded.updated_at
  `;
const SQL_DELETE = 'DELETE FROM obsidian_templates WHERE category = ?';

const hydrate = (row) => (row ? { ...row, properties: JSON.parse(row.properties) } : null);

export function createTemplateModel(db) {
  return {
    async find(category) {
      return hydrate(await db.get(SQL_GET, [category]));
    },
    async save(category, { properties, body_template }) {
      await db.run(SQL_UPSERT, {
        category,
        properties: JSON.stringify(properties),
        body_template,
        updated_at: nowIso(),
      });
      return this.find(category);
    },
    async delete(category) {
      await db.run(SQL_DELETE, [category]);
    },
  };
}
