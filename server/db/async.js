/**
 * Lõi DB async dùng chung cho Windows (better-sqlite3) và PWA (SQLite WASM).
 *
 * Interface `Db` chỉ gồm: all / get / run / exec / transaction (cộng pragma, backup, close là
 * phần phụ thuộc nền tảng). Mọi phương thức trả về Promise, nên tầng model/service viết một lần
 * là chạy được cả hai nền tảng.
 *
 * Không có `prepare()` trong interface: câu SQL được truyền vào từng lần gọi và lớp này tự giữ
 * cache prepared statement theo chuỗi SQL. Lý do: trên PWA, SQLite WASM đặt trong Web Worker
 * (bắt buộc với OPFS) chỉ cho phép prepare bất đồng bộ, nên model không thể prepare sẵn lúc khởi tạo.
 *
 * Mutex: better-sqlite3 chạy đồng bộ, nhưng khi tầng trên là async thì giữa hai lần `await` có thể
 * chen vào một request khác. Nếu request đó ghi trong lúc một transaction đang mở, câu ghi sẽ rơi
 * vào transaction của người khác (cùng một connection). Vì vậy mọi thao tác DB đều đi qua một
 * Mutex: tuần tự hoá toàn bộ truy cập DB. Thao tác phát sinh từ bên trong transaction được nhận
 * biết qua `scope` và chạy thẳng, không xin mutex (nếu xin sẽ tự khoá chính mình).
 *
 * `scope` là phần phụ thuộc nền tảng, phải truyền vào: bản Node dùng AsyncLocalStorage
 * (./scope.node.js), bản trình duyệt dùng biến đơn kèm điều kiện xử lý tuần tự (./scope.browser.js).
 * File này không import module Node nào nên bundle được cho trình duyệt.
 */

class Mutex {
  #queue = [];
  #locked = false;

  async acquire() {
    if (!this.#locked) {
      this.#locked = true;
      return;
    }
    await new Promise((resolve) => this.#queue.push(resolve));
  }

  release() {
    const next = this.#queue.shift();
    if (next) next();
    else this.#locked = false;
  }
}

/** Chuẩn hoá tham số: object -> tham số đặt tên (@name), array -> tham số thứ tự (?). */
function applyParams(statement, method, params) {
  if (params === undefined || params === null) return statement[method]();
  if (Array.isArray(params)) return statement[method](...params);
  return statement[method](params);
}

export function createAsyncDb(raw, { scope, exportBytes } = {}) {
  if (typeof scope?.getStore !== 'function' || typeof scope?.run !== 'function') {
    throw new Error('createAsyncDb cần scope của nền tảng (createNodeScope hoặc createSerialScope)');
  }
  const cache = new Map();
  const mutex = new Mutex();
  // Store tồn tại <=> đoạn code đang chạy nằm trong một transaction do lớp này mở.

  function statementFor(sql) {
    let statement = cache.get(sql);
    if (!statement) {
      statement = raw.prepare(sql);
      cache.set(sql, statement);
    }
    return statement;
  }

  /** Chạy một thao tác: trong transaction thì chạy thẳng, ngoài transaction thì xin mutex. */
  async function guarded(work) {
    if (scope.getStore()) return work();
    await mutex.acquire();
    try {
      return work();
    } finally {
      mutex.release();
    }
  }

  function execute(sql, params, { pluck = false } = {}, method) {
    const statement = statementFor(sql);
    if (statement.reader) statement.pluck(pluck);
    return applyParams(statement, method, params);
  }

  const db = {
    /** Danh sách bản ghi. { pluck: true } trả về mảng giá trị cột đầu tiên. */
    all(sql, params, options) {
      return guarded(() => execute(sql, params, options, 'all'));
    },

    /** Một bản ghi hoặc null. { pluck: true } trả về giá trị cột đầu tiên (undefined nếu không có dòng). */
    async get(sql, params, options) {
      const row = await guarded(() => execute(sql, params, options, 'get'));
      return row === undefined ? (options?.pluck ? undefined : null) : row;
    },

    /** Câu ghi; trả về { changes, lastInsertRowid }. */
    async run(sql, params) {
      const info = await guarded(() => applyParams(statementFor(sql), 'run', params));
      return { changes: info.changes, lastInsertRowid: info.lastInsertRowid };
    },

    /** Chạy nhiều câu lệnh trong một chuỗi SQL (DDL, script migration). */
    exec(sql) {
      return guarded(() => raw.exec(sql));
    },

    /**
     * Bọc `fn` thành một hàm async chạy trong transaction.
     * Lồng nhau được: lớp trong dùng SAVEPOINT nên lỗi ở lớp trong không nhất thiết huỷ lớp ngoài.
     */
    transaction(fn) {
      return async (...args) => {
        const current = scope.getStore();
        if (current) {
          const name = `sp_${(current.depth += 1)}`;
          raw.exec(`SAVEPOINT ${name}`);
          try {
            const result = await scope.run(current, () => fn(...args));
            raw.exec(`RELEASE ${name}`);
            return result;
          } catch (error) {
            raw.exec(`ROLLBACK TO ${name}`);
            raw.exec(`RELEASE ${name}`);
            throw error;
          }
        }

        await mutex.acquire();
        try {
          raw.exec('BEGIN');
          try {
            const result = await scope.run({ depth: 0 }, () => fn(...args));
            raw.exec('COMMIT');
            return result;
          } catch (error) {
            if (raw.inTransaction) raw.exec('ROLLBACK');
            throw error;
          }
        } finally {
          mutex.release();
        }
      };
    },

    // --- Phần phụ thuộc nền tảng: PWA sẽ có bản riêng ---

    /** PRAGMA (user_version, journal_mode...). Chữ ký giống better-sqlite3. */
    pragma(statement, options) {
      return guarded(() => raw.pragma(statement, options));
    },

    /** Sao lưu DB ra file (chỉ có trên Node). */
    backup(destination) {
      return raw.backup(destination);
    },

    /**
     * Xuất toàn bộ DB ra mảng byte để người dùng lưu lại (route POST /data/export).
     * Cách lấy byte phụ thuộc nền tảng nên do bên gọi truyền vào: trên Node là VACUUM INTO một file
     * tạm rồi đọc lên, trên WASM là sqlite3_js_db_export. Chạy trong mutex để không trùng với câu ghi.
     */
    exportBytes() {
      if (typeof exportBytes !== 'function') throw new Error('Nền tảng này không hỗ trợ xuất file DB');
      return guarded(() => exportBytes(raw));
    },

    close() {
      cache.clear();
      if (raw.open) raw.close();
    },

    get open() {
      return Boolean(raw.open);
    },

    /** Handle better-sqlite3 gốc: chỉ dùng cho migration lúc mở DB. Tầng model/service không được dùng. */
    raw,
  };

  return db;
}
