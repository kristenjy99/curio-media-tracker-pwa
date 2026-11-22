import nodeCrypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { AppError, ValidationError } from '../utils/errors.js';

// Bảng dữ liệu bị xoá khi làm sạch, bảng con trước. Cài đặt, template và cấu hình Obsidian được giữ lại.
const BOOK_TABLES = [
  'series_positions',
  'challenge_slots',
  'challenges',
  'brackets',
  'monthly_favorites',
  'goals',
  'quotes',
  'reading_logs',
  'reading_notes',
  'library_cards',
  'items',
  // Xoá tombstone sau cùng: trigger xoá items tạo tombstone, nếu giữ lại thì lần sync sau sẽ chuyển file trong vault vào .trash.
  'sync_tombstones',
];
const MEDIA_TABLES = ['media_watch_cards', 'media_notes', 'media_items', 'media_sync_tombstones'];
const KEY = 'security';

export const passwordSchema = z
  .object({
    current_password: z.string().max(200).optional(),
    new_password: z.string().min(4, 'Mật khẩu cần ít nhất 4 ký tự').max(200),
  })
  .strict();

export const wipeSchema = z.object({ password: z.string().min(1, 'Cần nhập mật khẩu').max(200) }).strict();

export const exportSchema = z
  .object({
    password: z.string().min(1, 'Cần nhập mật khẩu').max(200),
    db: z.enum(['books', 'media']).default('books'),
  })
  .strict();

/**
 * Băm mật khẩu bằng PBKDF2-SHA256 thay vì scrypt.
 *
 * Lý do đổi: scrypt không có trong WebCrypto nên bản PWA không băm được, còn PBKDF2 thì cả Node và
 * trình duyệt đều có và cho ra cùng một giá trị với cùng tham số — cần thiết vì Phiên 5 sẽ đồng bộ
 * bảng app_settings giữa hai thiết bị, mật khẩu đặt ở máy nào cũng phải kiểm được ở máy kia.
 *
 * Bản ghi cũ (scrypt, không có trường `algo`) vẫn kiểm được trên Windows. Trên điện thoại thì không,
 * và người dùng được báo rõ là phải đặt lại mật khẩu thay vì nhận một lỗi khó hiểu.
 */
const PBKDF2 = { algo: 'pbkdf2-sha256', iterations: 210_000, keylen: 64, digest: 'sha256' };

function derive(password, saltHex, { iterations, keylen, digest }) {
  return new Promise((resolve, reject) => {
    nodeCrypto.pbkdf2(password, Buffer.from(saltHex, 'hex'), iterations, keylen, digest, (error, key) => {
      if (error) reject(error);
      else resolve(Buffer.from(key).toString('hex'));
    });
  });
}

function sameHash(expectedHex, actualHex) {
  const expected = Buffer.from(expectedHex, 'hex');
  const actual = Buffer.from(actualHex, 'hex');
  return expected.length === actual.length && nodeCrypto.timingSafeEqual(expected, actual);
}

const pad = (value) => String(value).padStart(2, '0');

/** Thời điểm theo giờ địa phương, dạng 20261111-224500. */
function stampNow(now = new Date()) {
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

/** Mật khẩu xoá dữ liệu (scrypt + salt trong app_settings) và thao tác làm sạch toàn bộ dữ liệu. */
export function createDataService(context) {
  const db = () => context.db;
  const readSecurity = async () => {
    const raw = await db().get('SELECT value FROM app_settings WHERE key = ?', [KEY], { pluck: true });
    return raw ? JSON.parse(raw) : null;
  };
  const verify = async (password) => {
    const security = await readSecurity();
    if (!security) return false;
    if (security.algo === PBKDF2.algo) {
      const actual = await derive(password, security.salt, {
        iterations: security.iterations ?? PBKDF2.iterations,
        keylen: PBKDF2.keylen,
        digest: PBKDF2.digest,
      });
      return sameHash(security.hash, actual);
    }
    // Bản ghi cũ: scrypt. Chỉ kiểm được trên Node.
    if (typeof nodeCrypto.scryptSync !== 'function') {
      throw new AppError('Mật khẩu này được đặt trên bản Windows; hãy đặt lại mật khẩu trên thiết bị này', {
        status: 409,
        code: 'CONFLICT',
      });
    }
    return sameHash(security.hash, nodeCrypto.scryptSync(password, Buffer.from(security.salt, 'hex'), 64).toString('hex'));
  };
  const wrongPassword = (field) => new ValidationError('Mật khẩu không đúng', [{ path: [field], message: 'Mật khẩu không đúng' }]);

  const counts = async () => ({
    books: await db().get('SELECT COUNT(*) FROM items', undefined, { pluck: true }),
    media: context.mediaDb?.open ? await context.mediaDb.get('SELECT COUNT(*) FROM media_items', undefined, { pluck: true }) : 0,
  });

  return {
    async status() {
      return { has_password: Boolean(await readSecurity()), ...(await counts()) };
    },

    /** Đặt mật khẩu lần đầu, hoặc đổi mật khẩu (cần mật khẩu hiện tại). */
    async setPassword({ current_password: current, new_password: next }) {
      if ((await readSecurity()) && !(await verify(current ?? ''))) throw wrongPassword('current_password');
      const salt = Buffer.from(nodeCrypto.randomBytes(16)).toString('hex');
      const hash = await derive(next, salt, PBKDF2);
      await db().run('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', [
        KEY,
        JSON.stringify({ algo: PBKDF2.algo, iterations: PBKDF2.iterations, salt, hash, updated_at: new Date().toISOString() }),
      ]);
      return this.status();
    },

    /**
     * Xuất một file DB để người dùng tự lưu lại. Cần mật khẩu xoá dữ liệu vì file này chứa toàn bộ
     * dữ liệu, kể cả ghi chú riêng tư; nơi lưu do người dùng chọn ở phía client (hộp thoại lưu file
     * của trình duyệt), server chỉ trả byte và tên file gợi ý.
     *
     * Trên Windows byte lấy bằng VACUUM INTO một file tạm; trên PWA bằng sqlite3_js_db_export.
     * Cả hai đều cho một file SQLite hoàn chỉnh, mở được bằng bản app bên kia.
     */
    async exportDb({ password, db: which = 'books' }) {
      if (!(await readSecurity())) throw new AppError('Chưa đặt mật khẩu xoá dữ liệu', { status: 409, code: 'CONFLICT' });
      if (!(await verify(password))) throw wrongPassword('password');
      const source = which === 'media' ? context.mediaDb : db();
      if (!source?.open) throw new AppError('DB này chưa mở', { status: 409, code: 'CONFLICT' });
      if (typeof source.exportBytes !== 'function') throw new AppError('Nền tảng này không hỗ trợ xuất file DB', { status: 409, code: 'CONFLICT' });
      const bytes = await source.exportBytes();
      const name = which === 'media' ? 'media-tracker' : 'reading-tracker';
      return { bytes, filename: `${name}-${stampNow()}.sqlite`, size_bytes: bytes.byteLength ?? bytes.length };
    },

    /**
     * Xoá toàn bộ sách, media và dữ liệu liên quan. Trên Windows, trước khi xoá thì chép DB và
     * chuyển thư mục ảnh/file vào <storage>/backups/truoc-khi-xoa-<thời điểm>/ để còn đường khôi phục;
     * người dùng tự xoá thư mục này khi chắc chắn.
     *
     * Trên PWA không có thư mục đĩa nên không có bước sao lưu đó (backup_dir trả null); đường lùi ở
     * đó là tự xuất file DB bằng POST /data/export trước khi xoá.
     */
    async wipe({ password }) {
      if (!(await readSecurity())) throw new AppError('Chưa đặt mật khẩu xoá dữ liệu', { status: 409, code: 'CONFLICT' });
      if (!(await verify(password))) throw wrongPassword('password');
      const before = await counts();
      const paths = context.storagePaths;
      let backupDir = null;
      if (paths?.root) {
        backupDir = path.join(paths.root, 'backups', `truoc-khi-xoa-${stampNow()}`);
        fs.mkdirSync(backupDir, { recursive: true });
        await db().backup(path.join(backupDir, path.basename(paths.dbFile)));
        if (context.mediaDb?.open && paths.mediaDbFile) await context.mediaDb.backup(path.join(backupDir, path.basename(paths.mediaDbFile)));
        // Ảnh nền app (uploads/app) là cài đặt nên giữ lại; ảnh/file của sách và media được chuyển sang bản sao lưu.
        const moves = [
          [path.join(paths.uploadsDir, 'items'), path.join(backupDir, 'uploads-items')],
          [paths.mediaUploadsDir, path.join(backupDir, 'media-uploads')],
        ];
        for (const [from, to] of moves) {
          if (fs.existsSync(from)) {
            fs.cpSync(from, to, { recursive: true });
            fs.rmSync(from, { recursive: true, force: true });
          }
        }
        if (paths.mediaUploadsDir) fs.mkdirSync(paths.mediaUploadsDir, { recursive: true });
      }
      await db().transaction(async () => {
        for (const table of BOOK_TABLES) await db().run(`DELETE FROM ${table}`);
      })();
      if (context.mediaDb?.open) {
        await context.mediaDb.transaction(async () => {
          for (const table of MEDIA_TABLES) await context.mediaDb.run(`DELETE FROM ${table}`);
        })();
      }
      return { deleted: before, backup_dir: backupDir, ...(await this.status()) };
    },
  };
}
