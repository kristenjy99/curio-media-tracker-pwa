export default {
  version: 9,
  name: 'goals_readings_fun',
  up: `
    -- TBR: sở hữu / wishlist, ngày phát hành (sách sắp ra), và dấu "đã từng nằm trong TBR".
    ALTER TABLE items ADD COLUMN ownership TEXT CHECK (ownership IS NULL OR ownership IN ('owned','wishlist'));
    ALTER TABLE items ADD COLUMN release_date TEXT CHECK (release_date IS NULL OR date(release_date) = release_date);
    ALTER TABLE items ADD COLUMN from_tbr INTEGER NOT NULL DEFAULT 0 CHECK (from_tbr IN (0, 1));

    -- Nguồn "reading" duy nhất là library_cards (một dòng một lượt đọc). Mỗi sách đã/đang đọc/bỏ dở
    -- mà chưa có lượt nào được sinh một lượt #1 chưa có ngày. Sách TBR chưa đọc nên không có lượt.
    INSERT INTO library_cards (item_id, read_number)
      SELECT id, 1 FROM items i
      WHERE i.status IN ('Reading', 'Finished', 'DNF')
        AND NOT EXISTS (SELECT 1 FROM library_cards lc WHERE lc.item_id = i.id);

    CREATE TABLE goals (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      year        INTEGER NOT NULL CHECK (year BETWEEN 1900 AND 3000),
      metric      TEXT    NOT NULL CHECK (metric IN ('books','pages','hours')),
      target      REAL    NOT NULL CHECK (target > 0),
      updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      UNIQUE (year, metric)
    );

    CREATE TABLE challenges (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT    NOT NULL CHECK (length(trim(name)) > 0),
      type        TEXT    NOT NULL CHECK (type IN ('prompt','bingo','az')),
      year        INTEGER,
      az_mode     TEXT    CHECK (az_mode IS NULL OR az_mode IN ('title','author')),
      created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE TABLE challenge_slots (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      challenge_id  INTEGER NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
      position      INTEGER NOT NULL,
      label         TEXT    NOT NULL DEFAULT '',
      item_id       INTEGER REFERENCES items(id) ON DELETE SET NULL,
      UNIQUE (challenge_id, position)
    );
    -- Một sách chỉ nằm một lần trong cùng challenge, nhưng được nằm ở nhiều challenge khác nhau.
    CREATE UNIQUE INDEX idx_challenge_slots_item ON challenge_slots(challenge_id, item_id) WHERE item_id IS NOT NULL;

    CREATE TABLE monthly_favorites (
      year      INTEGER NOT NULL,
      month     INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
      item_id   INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      position  INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (year, month, item_id)
    );

    -- entries: mảng item_id theo thứ tự xếp cặp; picks: { "vòng-trận": item_id thắng }.
    CREATE TABLE brackets (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT    NOT NULL CHECK (length(trim(name)) > 0),
      year        INTEGER NOT NULL,
      size        INTEGER NOT NULL CHECK (size IN (4, 8, 16)),
      entries     TEXT    NOT NULL CHECK (json_valid(entries) AND json_type(entries) = 'array'),
      picks       TEXT    NOT NULL DEFAULT '{}' CHECK (json_valid(picks) AND json_type(picks) = 'object'),
      created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
  `,
};
