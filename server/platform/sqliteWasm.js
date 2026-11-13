/**
 * Bọc một DB của SQLite WASM (`sqlite3.oo1.DB`, hoặc `OpfsSAHPoolDb`) thành handle có cùng bề mặt
 * với better-sqlite3, để dùng lại nguyên vẹn hai thứ đã viết cho Windows:
 *
 *  - `server/db/async.js` (createAsyncDb): cần prepare/exec/pragma/inTransaction/open/close và
 *    statement có reader/pluck/all/get/run.
 *  - `server/db/migrator.js` cùng toàn bộ `server/db/migrations/**`: cần pragma, exec, transaction
 *    dạng ĐỒNG BỘ, prepare, unsafeMode.
 *
 * Nhờ vậy migration chạy đồng bộ ngay lúc mở DB y như trên Node, và app chỉ thấy interface async.
 * File này không biết gì về OPFS hay VFS: phần đó ở server/platform/browserConnection.js. Nhờ tách
 * như vậy, handle này test được dưới Node với VFS memory (xem server/tests/phase3-wasm-db.test.js).
 *
 * Khác biệt so với better-sqlite3 đã biết và chấp nhận:
 *  - `unsafeMode()` là no-op: WASM không có lớp chặn sửa sqlite_master như better-sqlite3, nên
 *    migration 011 (sửa sqlite_master qua writable_schema) chạy được mà không cần bật gì.
 *  - `backup(path)` không có: trình duyệt không có đường dẫn đĩa. Muốn lấy file DB thì dùng
 *    `exportBytes` (sqlite3_js_db_export) qua interface Db.
 *  - `lastInsertRowid` trả về Number (better-sqlite3 trả Number khi còn trong khoảng an toàn).
 */

/** Tham số dạng object: SQL của app dùng tiền tố `@`, còn better-sqlite3 nhận key trần. */
function withPrefix(params) {
  const bound = {};
  for (const [key, value] of Object.entries(params)) {
    bound[/^[@:$]/.test(key) ? key : `@${key}`] = normalize(value);
  }
  return bound;
}

/**
 * SQLite WASM chỉ nhận number/string/null/Uint8Array/BigInt. Giá trị boolean và undefined thì
 * better-sqlite3 cũng không nhận, nên ở đây chỉ chuyển Buffer thành Uint8Array (cùng bộ đệm,
 * không copy) và để nguyên phần còn lại cho SQLite tự báo lỗi nếu sai kiểu.
 */
function normalize(value) {
  if (value instanceof Uint8Array) return value;
  if (value?.buffer instanceof ArrayBuffer) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  return value;
}

function bindParams(statement, params) {
  if (params === undefined || params === null) return;
  if (Array.isArray(params)) {
    if (params.length) statement.bind(params.map(normalize));
    return;
  }
  if (typeof params === 'object') {
    const bound = withPrefix(params);
    if (Object.keys(bound).length) statement.bind(bound);
    return;
  }
  statement.bind([normalize(params)]);
}

export function createWasmHandle(db, sqlite3) {
  let closed = false;
  let depth = 0;

  /** Statement giữ lâu dài (lớp async.js cache theo chuỗi SQL), reset trước mỗi lần dùng. */
  function createStatement(sql) {
    const statement = db.prepare(sql);
    let plucking = false;

    function begin(params) {
      statement.reset(true);
      bindParams(statement, params);
    }

    /**
     * Dọn statement sau mỗi lần dùng. SQLite WASM báo lỗi ràng buộc (CHECK, FOREIGN KEY...) ở
     * `reset()` chứ không phải ở `step()`, nên không dùng `finally`: nếu đang có lỗi khác lan ra
     * thì lỗi của reset bị bỏ qua để giữ nguyên nguyên nhân gốc.
     */
    function finish(failed) {
      try {
        statement.reset(true);
      } catch (error) {
        if (!failed) throw error;
      }
    }

    const api = {
      /** true <=> câu lệnh trả về cột (SELECT, PRAGMA đọc...), giống thuộc tính cùng tên của better-sqlite3. */
      get reader() {
        return statement.columnCount > 0;
      },

      pluck(value = true) {
        plucking = value !== false;
        return api;
      },

      all(...args) {
        begin(args.length > 1 ? args : args[0]);
        const rows = [];
        try {
          while (statement.step()) rows.push(plucking ? statement.get(0) : statement.get({}));
        } catch (error) {
          finish(true);
          throw error;
        }
        finish(false);
        return rows;
      },

      get(...args) {
        begin(args.length > 1 ? args : args[0]);
        let row;
        try {
          row = statement.step() ? (plucking ? statement.get(0) : statement.get({})) : undefined;
        } catch (error) {
          finish(true);
          throw error;
        }
        finish(false);
        return row;
      },

      run(...args) {
        begin(args.length > 1 ? args : args[0]);
        try {
          // step() chạy câu lệnh; câu ghi không trả dòng nào nên vòng lặp kết thúc ngay.
          while (statement.step());
        } catch (error) {
          finish(true);
          throw error;
        }
        finish(false);
        return { changes: db.changes(), lastInsertRowid: Number(sqlite3.capi.sqlite3_last_insert_rowid(db)) };
      },

      finalize() {
        statement.finalize();
      },
    };
    return api;
  }

  const handle = {
    prepare(sql) {
      return createStatement(sql);
    },

    exec(sql) {
      db.exec(sql);
      return handle;
    },

    /**
     * PRAGMA với chữ ký của better-sqlite3: `{ simple: true }` trả về giá trị đầu tiên,
     * còn lại trả về mảng dòng (câu PRAGMA đặt giá trị thì trả mảng rỗng).
     */
    pragma(statement, { simple = false } = {}) {
      const sql = `PRAGMA ${statement}`;
      if (simple) return db.selectValue(sql);
      const rows = [];
      db.exec({ sql, rowMode: 'object', callback: (row) => rows.push({ ...row }) });
      return rows;
    },

    /**
     * Transaction ĐỒNG BỘ cho migrator: trả về một hàm, gọi hàm đó thì chạy fn trong transaction.
     * Lồng nhau dùng SAVEPOINT. Lớp async.js tự quản transaction của riêng nó và không dùng hàm này.
     */
    transaction(fn) {
      return (...args) => {
        if (depth > 0) {
          const name = `sp_sync_${depth}`;
          depth += 1;
          db.exec(`SAVEPOINT ${name}`);
          try {
            const result = fn(...args);
            db.exec(`RELEASE ${name}`);
            return result;
          } catch (error) {
            db.exec(`ROLLBACK TO ${name}`);
            db.exec(`RELEASE ${name}`);
            throw error;
          } finally {
            depth -= 1;
          }
        }
        depth = 1;
        db.exec('BEGIN');
        try {
          const result = fn(...args);
          db.exec('COMMIT');
          return result;
        } catch (error) {
          if (handle.inTransaction) db.exec('ROLLBACK');
          throw error;
        } finally {
          depth = 0;
        }
      };
    },

    get inTransaction() {
      return !sqlite3.capi.sqlite3_get_autocommit(db);
    },

    get open() {
      return !closed && Boolean(db.pointer);
    },

    /** better-sqlite3 dùng cờ này để cho phép sửa sqlite_master; WASM không chặn nên không cần làm gì. */
    unsafeMode() {
      return handle;
    },

    close() {
      if (closed) return;
      closed = true;
      db.close();
    },

    /** Dùng cho interface Db (exportBytes): toàn bộ file DB dưới dạng byte. */
    exportBytes() {
      return sqlite3.capi.sqlite3_js_db_export(db);
    },

    /** DB gốc của sqlite-wasm, chỉ dùng khi thật cần (test). */
    wasm: db,
  };

  return handle;
}
