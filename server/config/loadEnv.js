import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Module này phải được import đầu tiên trong entrypoint để .env có hiệu lực trước khi env.js đọc process.env.
const envFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '.env');

if (fs.existsSync(envFile) && typeof process.loadEnvFile === 'function') {
  process.loadEnvFile(envFile);
}
