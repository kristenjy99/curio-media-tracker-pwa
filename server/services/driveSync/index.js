import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { AppError, ValidationError } from '../../utils/errors.js';
import { createApplier } from './apply.js';
import { mergeDeletions, planMerge } from './merge.js';
import { exportUnits, fileRefs, readLocalDeletions } from './units.js';

/**
 * Đồng bộ Google Drive — phần dữ liệu, chạy chung cho bản Windows (qua Express) và bản PWA (qua
 * worker). Mọi việc với Google (đăng nhập, gọi Drive API) nằm ở trình duyệt
 * (client/src/lib/driveSync.js); access token không bao giờ đi xuống đây.
 *
 * Một lần đồng bộ, nhìn từ phía này:
 *   apply(remote)  -> sao lưu, gộp, áp vào DB; trả về snapshot mới + danh sách file cần tải về/đẩy lên
 *   writeFile/readFile -> client chuyển byte ảnh giữa Drive và FileStore
 *   commit(base)   -> sau khi snapshot đã nằm trên Drive, lưu `base` cho lần gộp sau
 * Hỏng ở bất kỳ bước nào trước commit thì lần bấm sau làm lại từ đầu, không mất gì: base cũ vẫn
 * đúng với Drive, còn DB cục bộ đã là kết quả gộp.
 */

export const SNAPSHOT_FORMAT = 1;
const pad = (value) => String(value).padStart(2, '0');
/** Thời điểm theo giờ địa phương, dạng 20261113-231500 (không import db/backup.js vì file đó kéo better-sqlite3). */
function backupStamp(now = new Date()) {
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}
const STATE_KEY = 'drive_sync_state';
const KEEP_JSON_BACKUPS = 5;
const KEEP_DISK_BACKUPS = 10;
const DISK_BACKUP_PREFIX = 'truoc-khi-dong-bo-';

export const applySchema = z
  .object({
    remote: z.record(z.string(), z.any()).nullable().default(null),
    mode: z.enum(['merge', 'push']).default('merge'),
    device: z.string().max(100).optional(),
  })
  .strict();

export const commitSchema = z.object({ base: z.record(z.string(), z.string()) }).strict();
export const fileQuerySchema = z.object({ key: z.string().min(1).max(500) }).strict();
export const restoreSchema = z.object({ id: z.string().regex(/^[\w-]+$/).max(100) }).strict();

export function createDriveSyncService(context) {
  const db = () => context.db;
  const mediaDb = () => context.mediaDb ?? null;

  async function readState() {
    const raw = await db().get('SELECT value FROM app_settings WHERE key = ?', [STATE_KEY], { pluck: true });
    const state = raw ? JSON.parse(raw) : {};
    return { base: {}, last_sync_at: null, backups: [], ...state };
  }

  async function writeState(state) {
    await db().run(
      'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
      [STATE_KEY, JSON.stringify(state)],
    );
  }

  async function schemaVersions() {
    const books = await db().get('PRAGMA user_version', [], { pluck: true });
    const media = mediaDb() ? await mediaDb().get('PRAGMA user_version', [], { pluck: true }) : 0;
    return { books, media };
  }

  function storeFor(key) {
    const [side, ...rest] = String(key).split('/');
    const relative = rest.join('/');
    if (!relative || rest.includes('..') || rest.includes('') || !/^(items|app)$/.test(rest[0])) {
      throw new ValidationError('Khoá file không hợp lệ', [{ path: ['key'], message: key }]);
    }
    const store = side === 'books' ? context.fileStore : side === 'media' ? context.mediaFileStore : undefined;
    if (store === undefined) throw new ValidationError('Khoá file không hợp lệ', [{ path: ['key'], message: key }]);
    if (!store) throw new AppError('Máy này chưa có thư mục lưu trữ ảnh', { status: 409, code: 'NO_STORAGE' });
    return { store, relative };
  }

  const toSnapshotUnits = (units) =>
    Object.fromEntries(
      [...units.values()].map((unit) => [
        unit.key,
        { kind: unit.kind, title: unit.title ?? null, hash: unit.hash, updated_at: unit.updated_at, children: unit.children, data: unit.data },
      ]),
    );

  /**
   * Bản chụp trước khi áp: JSON toàn bộ dữ liệu cục bộ kèm base cũ (cả hai bản), cộng bản sao
   * SQLite bằng VACUUM INTO ở <storage>/backups/truoc-khi-dong-bo-<thời điểm>/ (chỉ bản Windows).
   */
  async function backup(units, state, reason) {
    const id = `${backupStamp()}-${Math.random().toString(36).slice(2, 6)}`;
    const store = context.syncBackupStore;
    let diskDir = null;
    const paths = context.storagePaths;
    if (paths?.root && paths.dbFile) {
      const root = path.join(paths.root, 'backups');
      diskDir = path.join(root, `${DISK_BACKUP_PREFIX}${id}`);
      fs.mkdirSync(diskDir, { recursive: true });
      await db().backup(path.join(diskDir, path.basename(paths.dbFile)));
      if (mediaDb() && paths.mediaDbFile) await mediaDb().backup(path.join(diskDir, path.basename(paths.mediaDbFile)));
      // Giữ 10 bản sao lưu đồng bộ gần nhất; thư mục sao lưu khác (trước migrate, trước xoá) không đụng tới.
      const old = fs
        .readdirSync(root)
        .filter((name) => name.startsWith(DISK_BACKUP_PREFIX))
        .sort()
        .slice(0, -KEEP_DISK_BACKUPS);
      for (const name of old) fs.rmSync(path.join(root, name), { recursive: true, force: true });
    }
    if (!store) return { id: null, disk_dir: diskDir };

    const payload = JSON.stringify({ format_version: SNAPSHOT_FORMAT, created_at: new Date().toISOString(), reason, base: state.base, units: toSnapshotUnits(units) });
    await store.write(`${id}.json`, Buffer.from(payload, 'utf8'));
    const entry = { id, created_at: new Date().toISOString(), reason, units: units.size, size_bytes: payload.length };
    const backups = [entry, ...state.backups];
    for (const stale of backups.slice(KEEP_JSON_BACKUPS)) await store.remove(`${stale.id}.json`);
    state.backups = backups.slice(0, KEEP_JSON_BACKUPS);
    await writeState(state);
    return { id, disk_dir: diskDir };
  }

  async function fileLists(units, remoteFiles) {
    const download = [];
    const upload = [];
    const refs = new Set();
    for (const unit of units.values()) for (const key of fileRefs(unit.data)) refs.add(key);
    for (const key of [...refs].sort()) {
      let exists = false;
      try {
        const { store, relative } = storeFor(key);
        exists = await store.exists(relative);
      } catch {
        continue; // Khoá lạ hoặc máy không có store: bỏ qua, không làm hỏng cả lượt đồng bộ.
      }
      if (!exists && remoteFiles[key]?.id) download.push({ key, id: remoteFiles[key].id });
      else if (exists && !remoteFiles[key]) upload.push({ key });
    }
    return { download, upload };
  }

  function checkRemote(remote, versions) {
    if (!remote) return;
    if (remote.format_version !== SNAPSHOT_FORMAT) {
      throw new AppError(`Dữ liệu trên Drive có định dạng ${remote.format_version ?? 'lạ'}, bản app này chỉ đọc được định dạng ${SNAPSHOT_FORMAT}`, { status: 409, code: 'SYNC_FORMAT' });
    }
    const schema = remote.schema ?? {};
    if ((schema.books ?? 0) > versions.books || (schema.media ?? 0) > versions.media) {
      throw new AppError('Dữ liệu trên Drive do bản app mới hơn ghi. Cập nhật app trên máy này rồi đồng bộ lại.', { status: 409, code: 'SYNC_SCHEMA_NEWER' });
    }
  }

  return {
    async status() {
      const state = await readState();
      return { last_sync_at: state.last_sync_at, last_device: state.last_device ?? null, synced_units: Object.keys(state.base).length, backups: state.backups };
    },

    async apply({ remote = null, mode = 'merge', device }) {
      const versions = await schemaVersions();
      checkRemote(remote, versions);
      const handles = { db: db(), mediaDb: mediaDb() };
      const state = await readState();
      const local = await exportUnits(handles);
      const localDeletions = await readLocalDeletions(handles);
      const plan = planMerge({ local, remote, base: state.base, localDeletions, mode });

      let backupInfo = null;
      if (plan.pulls.length || plan.deletes.length) {
        backupInfo = await backup(local, state, 'Trước khi đồng bộ Drive');
        const pulls = plan.pulls.map((key) => ({ key, ...remote.units[key] }));
        await createApplier(handles).apply({ pulls, deletes: plan.deletes });
      }

      const final = await exportUnits(handles);
      const deletions = mergeDeletions({ remote, localDeletions, finalKeys: new Set(final.keys()), extra: plan.pushDeletions });
      const remoteFiles = remote?.files ?? {};
      const files = await fileLists(final, remoteFiles);
      const snapshot = {
        format_version: SNAPSHOT_FORMAT,
        app: 'media-tracker',
        schema: versions,
        written_at: new Date().toISOString(),
        device: device ?? context.platform ?? 'windows',
        units: toSnapshotUnits(final),
        deletions,
        files: { ...remoteFiles },
      };
      return { snapshot, files, stats: plan.stats, conflicts: plan.conflicts, backup: backupInfo };
    },

    async commit({ base }) {
      const state = await readState();
      state.base = base;
      state.last_sync_at = new Date().toISOString();
      state.last_device = context.platform ?? 'windows';
      await writeState(state);
      return this.status();
    },

    async readFile(key) {
      const { store, relative } = storeFor(key);
      const bytes = await store.read(relative);
      if (!bytes) throw new AppError('Không tìm thấy file', { status: 404, code: 'NOT_FOUND' });
      return bytes;
    },

    async writeFile(key, bytes) {
      const { store, relative } = storeFor(key);
      await store.write(relative, bytes);
      return { key, size_bytes: bytes.length };
    },

    /**
     * Đặt dữ liệu máy này về bản chụp trước một lần đồng bộ. Chỉ đổi dữ liệu cục bộ; muốn Drive cũng
     * theo bản này thì bấm "Ghi đè Drive bằng dữ liệu máy này" sau đó. Trước khi khôi phục, trạng thái
     * hiện tại cũng được chụp lại, nên khôi phục cũng hoàn tác được.
     */
    async restore({ id }) {
      const store = context.syncBackupStore;
      const state = await readState();
      if (!store || !state.backups.some((entry) => entry.id === id)) throw new AppError('Không có bản chụp này', { status: 404, code: 'NOT_FOUND' });
      const raw = await store.read(`${id}.json`);
      if (!raw) throw new AppError('File bản chụp đã mất', { status: 404, code: 'NOT_FOUND' });
      const saved = JSON.parse(Buffer.from(raw).toString('utf8'));

      const handles = { db: db(), mediaDb: mediaDb() };
      const local = await exportUnits(handles);
      await backup(local, state, `Trước khi khôi phục ${id}`);
      const pulls = Object.entries(saved.units).filter(([key, unit]) => local.get(key)?.hash !== unit.hash).map(([key, unit]) => ({ key, ...unit }));
      const deletes = [...local.keys()].filter((key) => !saved.units[key]);
      await createApplier(handles).apply({ pulls, deletes });

      const next = await readState();
      next.base = saved.base ?? {};
      await writeState(next);
      return { restored: id, pulled: pulls.length, deleted: deletes.length, ...(await this.status()) };
    },
  };
}
