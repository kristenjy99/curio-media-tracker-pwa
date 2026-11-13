import '../config/loadEnv.js';
import { ensureStorageLayout, getStoragePaths } from '../config/storage.js';
import { closeDatabase, openDatabase } from '../db/connection.js';
import { createModels } from '../models/index.js';
import { createServices } from '../services/index.js';

const SAMPLE_ITEMS = [
  {
    item: {
      title: 'The Left Hand of Darkness',
      creator_author: 'Ursula K. Le Guin',
      media_type: 'Book',
      main_category: 'Fiction',
      format: 'Paperback',
      unit_type: 'pages',
      total_units: 304,
      release_year: 1969,
      language: 'en',
      rating: 4.5,
      is_favorite: true,
      tags: ['sci-fi', 'classic'],
    },
    cards: [
      { start_date: '2024-02-01', finish_date: '2024-02-20', rating: 4.5, review_summary: 'Lần đầu đọc.' },
      { start_date: '2026-10-05', finish_date: '2026-10-25', rating: 5, review_summary: 'Re-read, hiểu sâu hơn.' },
    ],
    logs: [
      { date: '2026-10-20', units_read: 40, minutes_spent: 50 },
      { date: '2026-10-21', units_read: 35, minutes_spent: 45 },
    ],
  },
  {
    item: {
      title: 'Atomic Habits',
      creator_author: 'James Clear',
      media_type: 'Ebook',
      main_category: 'Nonfiction',
      unit_type: 'pages',
      total_units: 320,
      current_unit: 120,
      release_year: 2018,
      language: 'en',
      tags: ['self-improvement'],
      topics: ['habits', 'productivity'],
    },
    cards: [{ start_date: '2026-10-28' }],
    logs: [
      { date: '2026-11-01', units_read: 30, minutes_spent: 40 },
      { date: '2026-11-02', units_read: 25, minutes_spent: 30 },
    ],
  },
  {
    item: {
      title: 'Sample Long Fic',
      creator_author: 'anon_writer',
      media_type: 'Fanfic',
      main_category: 'Fanfiction',
      format: 'AO3',
      unit_type: 'chapters',
      total_units: 42,
      word_count: 125000,
      language: 'en',
      tags: ['slow-burn'],
      fandoms: ['Sample Fandom'],
      pairings: ['A/B'],
      tropes: ['enemies to lovers', 'slow burn'],
    },
    cards: [{ start_date: '2026-09-01', finish_date: '2026-09-14', rating: 4 }],
    logs: [],
  },
  {
    item: {
      title: 'Sample Short Fic',
      creator_author: 'anon_writer',
      media_type: 'Fanfic',
      main_category: 'Fanfiction',
      unit_type: 'chapters',
      total_units: 5,
      word_count: 12000,
      fandoms: ['Sample Fandom'],
    },
    cards: [{ start_date: '2026-09-20', finish_date: '2026-09-20' }],
    logs: [],
  },
  {
    item: {
      title: 'One Piece',
      creator_author: 'Eiichiro Oda',
      media_type: 'Manga',
      main_category: 'Visual/Comics',
      unit_type: 'volumes',
      total_units: 110,
      current_unit: 72,
      volume_count: 110,
      release_year: 1997,
      language: 'ja',
      tags: ['shonen'],
    },
    cards: [{ start_date: '2026-06-01' }],
    logs: [{ date: '2026-11-03', units_read: 2, minutes_spent: 60 }],
  },
  {
    item: {
      title: 'Sample Short Manhwa',
      media_type: 'Manhwa',
      main_category: 'Visual/Comics',
      unit_type: 'volumes',
      total_units: 8,
      volume_count: 8,
      status: 'TBR',
    },
    cards: [],
    logs: [],
  },
];

const paths = ensureStorageLayout(getStoragePaths());
const { db } = openDatabase(paths.dbFile);
const models = createModels(db);
const services = createServices({ db, models });

const existing = (await models.items.list({ limit: 1 })).total;
if (existing > 0 && !process.argv.includes('--force')) {
  console.log(`DB đã có ${existing} item. Chạy "npm run db:seed -- --force" nếu vẫn muốn thêm dữ liệu mẫu.`);
  closeDatabase(db);
  process.exit(0);
}

await db.transaction(async () => {
  for (const sample of SAMPLE_ITEMS) {
    const item = await services.items.create(sample.item);
    for (const card of sample.cards) await services.libraryCards.create(item.id, card);
    for (const log of sample.logs) await services.readingLogs.create({ item_id: item.id, ...log, advance_progress: false });
  }
})();

console.log(`Đã seed ${SAMPLE_ITEMS.length} item vào ${paths.dbFile}`);
closeDatabase(db);
