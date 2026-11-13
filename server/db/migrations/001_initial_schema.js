export default {
  version: 1,
  name: 'initial_schema',
  up: `
    CREATE TABLE items (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      title            TEXT    NOT NULL CHECK (length(trim(title)) > 0),
      creator_author   TEXT,
      media_type       TEXT    NOT NULL DEFAULT 'Book'
                       CHECK (media_type IN ('Book','Ebook','Audiobook','Fanfic','Webnovel','Light Novel',
                                             'Manga','Manhwa','Manhua','Comic','Webtoon','Other')),
      main_category    TEXT    NOT NULL
                       CHECK (main_category IN ('Fiction','Nonfiction','Fanfiction','Visual/Comics')),
      format           TEXT,
      unit_type        TEXT    NOT NULL DEFAULT 'pages'
                       CHECK (unit_type IN ('pages','chapters','volumes','words','minutes','percent')),
      total_units      INTEGER CHECK (total_units IS NULL OR total_units >= 0),
      current_unit     INTEGER NOT NULL DEFAULT 0 CHECK (current_unit >= 0),
      word_count       INTEGER CHECK (word_count IS NULL OR word_count >= 0),
      volume_count     INTEGER CHECK (volume_count IS NULL OR volume_count >= 0),
      status           TEXT    NOT NULL DEFAULT 'TBR'
                       CHECK (status IN ('Reading','Finished','TBR','DNF')),
      release_year     INTEGER CHECK (release_year IS NULL OR release_year BETWEEN -3000 AND 3000),
      language         TEXT,
      rating           REAL    CHECK (rating IS NULL OR (rating >= 0 AND rating <= 5)),
      is_favorite      INTEGER NOT NULL DEFAULT 0 CHECK (is_favorite IN (0, 1)),
      cover_image      TEXT,
      tags             TEXT    NOT NULL DEFAULT '[]' CHECK (json_valid(tags) AND json_type(tags) = 'array'),
      moodboard_urls   TEXT    NOT NULL DEFAULT '[]' CHECK (json_valid(moodboard_urls) AND json_type(moodboard_urls) = 'array'),
      playlist_url     TEXT,
      file_links       TEXT    NOT NULL DEFAULT '[]' CHECK (json_valid(file_links) AND json_type(file_links) = 'array'),
      pairings         TEXT    NOT NULL DEFAULT '[]' CHECK (json_valid(pairings) AND json_type(pairings) = 'array'),
      fandoms          TEXT    NOT NULL DEFAULT '[]' CHECK (json_valid(fandoms) AND json_type(fandoms) = 'array'),
      tropes           TEXT    NOT NULL DEFAULT '[]' CHECK (json_valid(tropes) AND json_type(tropes) = 'array'),
      topics           TEXT    NOT NULL DEFAULT '[]' CHECK (json_valid(topics) AND json_type(topics) = 'array'),
      obsidian_path    TEXT    UNIQUE,
      created_at       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE INDEX idx_items_status        ON items(status);
    CREATE INDEX idx_items_main_category ON items(main_category);
    CREATE INDEX idx_items_release_year  ON items(release_year);
    CREATE INDEX idx_items_title_nocase  ON items(title COLLATE NOCASE);

    CREATE TABLE library_cards (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id         INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      read_number     INTEGER NOT NULL CHECK (read_number >= 1),
      start_date      TEXT    CHECK (start_date IS NULL OR date(start_date) = start_date),
      finish_date     TEXT    CHECK (finish_date IS NULL OR date(finish_date) = finish_date),
      rating          REAL    CHECK (rating IS NULL OR (rating >= 0 AND rating <= 5)),
      review_summary  TEXT,
      created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      UNIQUE (item_id, read_number),
      CHECK (start_date IS NULL OR finish_date IS NULL OR finish_date >= start_date)
    );

    CREATE INDEX idx_library_cards_item        ON library_cards(item_id);
    CREATE INDEX idx_library_cards_finish_date ON library_cards(finish_date);

    CREATE TABLE reading_notes (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id           INTEGER NOT NULL UNIQUE REFERENCES items(id) ON DELETE CASCADE,
      content_markdown  TEXT    NOT NULL DEFAULT '',
      moodboard_images  TEXT    NOT NULL DEFAULT '[]' CHECK (json_valid(moodboard_images) AND json_type(moodboard_images) = 'array'),
      character_images  TEXT    NOT NULL DEFAULT '[]' CHECK (json_valid(character_images) AND json_type(character_images) = 'array'),
      attached_files    TEXT    NOT NULL DEFAULT '[]' CHECK (json_valid(attached_files) AND json_type(attached_files) = 'array'),
      playlist_links    TEXT    NOT NULL DEFAULT '[]' CHECK (json_valid(playlist_links) AND json_type(playlist_links) = 'array'),
      updated_at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE TABLE reading_logs (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id        INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      date           TEXT    NOT NULL CHECK (date(date) = date),
      units_read     INTEGER NOT NULL DEFAULT 0 CHECK (units_read >= 0),
      minutes_spent  INTEGER NOT NULL DEFAULT 0 CHECK (minutes_spent >= 0),
      created_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE INDEX idx_reading_logs_date ON reading_logs(date);
    CREATE INDEX idx_reading_logs_item ON reading_logs(item_id, date);

    CREATE TABLE obsidian_sync_config (
      id              INTEGER PRIMARY KEY CHECK (id = 1),
      vault_path      TEXT,
      sync_enabled    INTEGER NOT NULL DEFAULT 0 CHECK (sync_enabled IN (0, 1)),
      last_sync_time  TEXT
    );

    INSERT INTO obsidian_sync_config (id, vault_path, sync_enabled, last_sync_time) VALUES (1, NULL, 0, NULL);
  `,
};
