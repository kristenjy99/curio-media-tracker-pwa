const ALLOWED_JOURNAL_MODES = new Set(['DELETE', 'WAL', 'TRUNCATE', 'PERSIST']);

function parsePort(value, fallback) {
  const port = Number.parseInt(value ?? '', 10);
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : fallback;
}

function parseJournalMode(value) {
  const mode = (value ?? 'DELETE').trim().toUpperCase();
  return ALLOWED_JOURNAL_MODES.has(mode) ? mode : 'DELETE';
}

export const env = Object.freeze({
  port: parsePort(process.env.PORT, 4317),
  host: process.env.HOST?.trim() || '127.0.0.1',
  storageOverride: process.env.READING_TRACKER_STORAGE?.trim() || null,
  journalMode: parseJournalMode(process.env.SQLITE_JOURNAL_MODE),
  clientOrigins: (process.env.CLIENT_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  isTest: process.env.NODE_ENV === 'test',
});
