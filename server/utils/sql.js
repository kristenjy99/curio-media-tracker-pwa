export const nowIso = () => new Date().toISOString();

export function parseJsonArray(value) {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined || value === '') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Escape ký tự đặc biệt của LIKE; câu SQL phải dùng ESCAPE '\\'. */
export function escapeLike(term) {
  return term.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * Chuyển object JS sang object tham số cho prepared statement:
 * mảng/object -> JSON string, boolean -> 0/1, undefined bị loại bỏ.
 */
export function toDbParams(data, { jsonFields = [], booleanFields = [] } = {}) {
  const params = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    if (jsonFields.includes(key)) params[key] = JSON.stringify(value ?? []);
    else if (booleanFields.includes(key)) params[key] = value ? 1 : 0;
    else params[key] = value;
  }
  return params;
}

export function fromDbRow(row, { jsonFields = [], booleanFields = [] } = {}) {
  if (!row) return null;
  const result = { ...row };
  for (const key of jsonFields) if (key in result) result[key] = parseJsonArray(result[key]);
  for (const key of booleanFields) if (key in result) result[key] = result[key] === 1;
  return result;
}

/** Sinh mệnh đề "col = @col, ..." chỉ từ các cột nằm trong whitelist. */
export function buildSetClause(params, allowedColumns) {
  const columns = Object.keys(params).filter((key) => allowedColumns.includes(key));
  return {
    columns,
    clause: columns.map((column) => `${column} = @${column}`).join(', '),
  };
}
