import '../config/loadEnv.js';
import { ensureStorageLayout, getStoragePaths } from '../config/storage.js';
import { closeDatabase, openDatabase } from '../db/connection.js';

const paths = ensureStorageLayout(getStoragePaths());
const { db, migration } = openDatabase(paths.dbFile);

console.log(`Database: ${paths.dbFile}`);
console.log(`Schema: v${migration.from} -> v${migration.to}`);
console.log(migration.applied.length ? `Applied: ${migration.applied.join(', ')}` : 'Không có migration mới.');

closeDatabase(db);
