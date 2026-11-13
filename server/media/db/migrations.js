// v1: khung trống. v2: bảng media_items cho trang danh sách (trường chi tiết theo category thêm ở bước sau).
export const mediaMigrations = [
  {
    version: 1,
    name: 'init',
    up: 'CREATE TABLE media_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);',
  },
  {
    version: 2,
    name: 'media_items',
    up: `
      CREATE TABLE media_items (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        sync_uid       TEXT    NOT NULL UNIQUE,
        title          TEXT    NOT NULL,
        category       TEXT    NOT NULL
                       CHECK (category IN ('tv_series','movie','animation','youtube','short_drama')),
        status         TEXT    NOT NULL DEFAULT 'TBW'
                       CHECK (status IN ('TBW','Watching','Finished','DNF')),
        rating         REAL    CHECK (rating IS NULL OR (rating >= 0 AND rating <= 5)),
        cover_image    TEXT,
        progress_current INTEGER NOT NULL DEFAULT 0 CHECK (progress_current >= 0),
        progress_total   INTEGER CHECK (progress_total IS NULL OR progress_total >= 0),
        created_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        updated_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );
      CREATE INDEX idx_media_items_category ON media_items(category);
      CREATE INDEX idx_media_items_status   ON media_items(status);
    `,
  },
  {
    version: 3,
    name: 'media_series',
    up: `
      ALTER TABLE media_items ADD COLUMN series_name TEXT;
      ALTER TABLE media_items ADD COLUMN season_current INTEGER CHECK (season_current IS NULL OR season_current >= 0);
      ALTER TABLE media_items ADD COLUMN season_total INTEGER CHECK (season_total IS NULL OR season_total >= 0);
      CREATE INDEX idx_media_items_series ON media_items(series_name);
    `,
  },
  {
    version: 4,
    name: 'media_genres',
    // Danh sách thể loại lưu dạng mảng JSON (dùng json_each để lọc và thống kê).
    up: "ALTER TABLE media_items ADD COLUMN genres TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(genres));",
  },
  {
    version: 5,
    name: 'media_countries_favorite',
    up: `
      ALTER TABLE media_items ADD COLUMN countries TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(countries));
      ALTER TABLE media_items ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0 CHECK (is_favorite IN (0, 1));
      CREATE INDEX idx_media_items_favorite ON media_items(is_favorite);
    `,
  },
  {
    version: 6,
    name: 'media_watch_years',
    // Năm bắt đầu/xong là số năm đơn giản (như finish_year bên sách), dùng cho thống kê theo năm.
    up: `
      ALTER TABLE media_items ADD COLUMN start_year  INTEGER CHECK (start_year  IS NULL OR (start_year  BETWEEN 1900 AND 3000));
      ALTER TABLE media_items ADD COLUMN finish_year INTEGER CHECK (finish_year IS NULL OR (finish_year BETWEEN 1900 AND 3000));
      CREATE INDEX idx_media_items_finish_year ON media_items(finish_year);
    `,
  },
  {
    version: 7,
    name: 'media_detail_review_sync',
    // Trang chi tiết media: trường thông tin thêm, thẻ lượt xem (tháng/năm hoặc chỉ năm, điểm riêng cho từng
    // season hoặc lượt xem lại), note & review, và trạng thái sync sang Obsidian.
    up: `
      ALTER TABLE media_items ADD COLUMN youtube_channel TEXT;
      ALTER TABLE media_items ADD COLUMN cast_members TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(cast_members));
      ALTER TABLE media_items ADD COLUMN studios TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(studios));
      ALTER TABLE media_items ADD COLUMN platforms TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(platforms));
      ALTER TABLE media_items ADD COLUMN episodes_per_season TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(episodes_per_season));
      ALTER TABLE media_items ADD COLUMN language TEXT;
      ALTER TABLE media_items ADD COLUMN trailer_url TEXT;
      ALTER TABLE media_items ADD COLUMN warnings TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(warnings));
      ALTER TABLE media_items ADD COLUMN topics TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(topics));
      ALTER TABLE media_items ADD COLUMN obsidian_path TEXT;
      ALTER TABLE media_items ADD COLUMN obsidian_media_dir TEXT;
      ALTER TABLE media_items ADD COLUMN sync_db_hash TEXT;
      ALTER TABLE media_items ADD COLUMN sync_file_hash TEXT;

      CREATE TABLE media_watch_cards (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        media_id     INTEGER NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
        season       INTEGER CHECK (season IS NULL OR season >= 0),
        start_year   INTEGER CHECK (start_year  IS NULL OR (start_year  BETWEEN 1900 AND 3000)),
        start_month  INTEGER CHECK (start_month IS NULL OR (start_month BETWEEN 1 AND 12)),
        finish_year  INTEGER CHECK (finish_year IS NULL OR (finish_year BETWEEN 1900 AND 3000)),
        finish_month INTEGER CHECK (finish_month IS NULL OR (finish_month BETWEEN 1 AND 12)),
        rating       REAL    CHECK (rating IS NULL OR (rating >= 0 AND rating <= 5)),
        note         TEXT,
        created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        updated_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        CHECK (start_month IS NULL OR start_year IS NOT NULL),
        CHECK (finish_month IS NULL OR finish_year IS NOT NULL)
      );
      CREATE INDEX idx_media_watch_cards_media ON media_watch_cards(media_id);

      CREATE TABLE media_notes (
        media_id         INTEGER PRIMARY KEY REFERENCES media_items(id) ON DELETE CASCADE,
        content_markdown TEXT NOT NULL DEFAULT '',
        moodboard_images TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(moodboard_images)),
        character_images TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(character_images)),
        attached_files   TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(attached_files)),
        playlist_links   TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(playlist_links)),
        updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );

      CREATE TABLE media_sync_tombstones (
        id                 INTEGER PRIMARY KEY AUTOINCREMENT,
        sync_uid           TEXT NOT NULL,
        obsidian_path      TEXT,
        obsidian_media_dir TEXT,
        deleted_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );
      CREATE TRIGGER trg_media_items_tombstone AFTER DELETE ON media_items
      WHEN OLD.obsidian_path IS NOT NULL OR OLD.obsidian_media_dir IS NOT NULL
      BEGIN
        INSERT INTO media_sync_tombstones (sync_uid, obsidian_path, obsidian_media_dir) VALUES (OLD.sync_uid, OLD.obsidian_path, OLD.obsidian_media_dir);
      END;

      -- Media đã có năm xem thì có sẵn lượt xem #1 mang đúng các năm đó (điểm chung của media giữ nguyên).
      INSERT INTO media_watch_cards (media_id, start_year, finish_year)
      SELECT id, start_year, finish_year FROM media_items WHERE start_year IS NOT NULL OR finish_year IS NOT NULL;
    `,
  },
  {
    version: 8,
    name: 'sync_identity',
    /**
     * Phần media của bước chuẩn bị đồng bộ Google Drive; cùng cách làm với migration 015 của DB sách,
     * xem phần giải thích ở server/db/migrations/015_sync_identity.js.
     * media_items đã có sync_uid và updated_at từ trước; ở đây thêm cho lượt xem và note,
     * cộng bảng ghi dấu đã xoá riêng cho Drive (media_sync_tombstones là của sync Obsidian).
     */
    up(db) {
      const UUID = `lower(
        substr(hex(randomblob(4)), 1) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' ||
        substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6))
      )`;
      const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";

      db.exec(`
        CREATE TABLE media_sync_deletions (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          table_name TEXT NOT NULL,
          sync_uid   TEXT NOT NULL,
          deleted_at TEXT NOT NULL DEFAULT (${NOW})
        );
        CREATE INDEX idx_media_sync_deletions_table ON media_sync_deletions(table_name, sync_uid);
      `);

      for (const table of ['media_watch_cards', 'media_notes']) {
        db.exec(`
          ALTER TABLE ${table} ADD COLUMN sync_uid TEXT;
          UPDATE ${table} SET sync_uid = ${UUID} WHERE sync_uid IS NULL;
          CREATE UNIQUE INDEX idx_${table}_sync_uid ON ${table}(sync_uid);
          CREATE TRIGGER trg_${table}_sync_uid AFTER INSERT ON ${table}
          WHEN NEW.sync_uid IS NULL
          BEGIN
            UPDATE ${table} SET sync_uid = ${UUID} WHERE rowid = NEW.rowid;
          END;
        `);
      }

      for (const table of ['media_items', 'media_watch_cards', 'media_notes']) {
        db.exec(`
          CREATE TRIGGER trg_${table}_deleted AFTER DELETE ON ${table}
          WHEN OLD.sync_uid IS NOT NULL
          BEGIN
            INSERT INTO media_sync_deletions (table_name, sync_uid) VALUES ('${table}', OLD.sync_uid);
          END;
        `);
      }
    },
  },
];
