const SQL_LIST = 'SELECT * FROM sync_tombstones ORDER BY id';
const SQL_DELETE = 'DELETE FROM sync_tombstones WHERE id = ?';
const SQL_CLEAR = 'DELETE FROM sync_tombstones';

export function createSyncTombstoneModel(db) {
  return {
    list() {
      return db.all(SQL_LIST);
    },
    async delete(id) {
      await db.run(SQL_DELETE, [id]);
    },
    async clear() {
      await db.run(SQL_CLEAR);
    },
  };
}
