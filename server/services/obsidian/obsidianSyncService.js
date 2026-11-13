import fs from 'node:fs';
import path from 'node:path';
import { ConflictError, ValidationError } from '../../utils/errors.js';
import { nowIso } from '../../utils/sql.js';
import { hashText, insertProperty, renderMarkdown, splitMarkdown } from './markdown.js';
import { ATTACHMENTS_DIR, createMediaMapper } from './mediaLinks.js';
import { createMediaSync } from './mediaSync.js';
import { SYSTEM_KEY } from './templates/catalog.js';
import { detectCategory, mergeCards, parseWithTemplate, renderWithTemplate } from './templates/codec.js';
import {
  copyFileAtomic,
  listFiles,
  moveEntryToTrash,
  moveFile,
  moveToTrash,
  pruneEmptyDirs,
  readText,
  sanitizeFileName,
  scanMarkdownFiles,
  toAbsolute,
  uniqueRelPath,
  writeConflictCopy,
  writeTextAtomic,
} from './vaultFs.js';

const relative = (root, absPath) => path.relative(root, absPath).split(path.sep).join('/');

/**
 * Sync app <-> file .md trong thư mục sync của vault, chạy thủ công. Mỗi sách là một file,
 * dựng theo template của thể loại (Fiction/Fanfiction/Nonfiction/Visual-Comics).
 *
 * Chế độ "app_to_obsidian" (mặc định): app là nguồn duy nhất.
 *   - Sách mới / đã sửa trong app -> ghi file.
 *   - File bị sửa trong Obsidian từ lần sync trước -> vẫn ghi đè từ app, nhưng lưu bản Obsidian
 *     thành "<tên>.conflict-YYYYMMDD-HHmmss.md" để không mất nội dung.
 *   - File trong thư mục mà app không quản lý -> bỏ qua, chỉ báo trong kết quả.
 * Chế độ "two_way": nhận thay đổi từ cả hai phía; cả hai cùng sửa thì bên sửa sau cùng thắng,
 *   bản thua lưu thành file .conflict.
 * Cả hai chế độ: xoá sách trong app -> file vào ".trash"; file bị xoá trong vault -> tạo lại;
 * đổi tên/di chuyển file -> app theo dõi bằng rt_id; app không tự đổi tên file đã có.
 */
export function createObsidianSyncService(context) {
  const { db, models, services } = context;
  const { items, libraryCards, readingNotes, syncConfig, syncTombstones } = models;
  const mediaSync = createMediaSync(context);
  const templateService = () => services.templates;
  let running = false;

  function resolveTarget(config, { requireEnabled = true } = {}) {
    if (!config.vault_path) {
      throw new ValidationError('Chưa cấu hình vault_path', [{ path: ['vault_path'], message: 'Trống' }]);
    }
    if (requireEnabled && !config.sync_enabled) {
      throw new ValidationError('Sync đang tắt. Bật sync_enabled trước khi chạy.', [
        { path: ['sync_enabled'], message: 'false' },
      ]);
    }
    if (!fs.existsSync(config.vault_path) || !fs.statSync(config.vault_path).isDirectory()) {
      throw new ValidationError('vault_path không tồn tại hoặc không phải thư mục', [
        { path: ['vault_path'], message: config.vault_path },
      ]);
    }
    return config.vault_subfolder ? toAbsolute(config.vault_path, config.vault_subfolder) : config.vault_path;
  }

  /** Thư mục sync tính từ gốc vault, dạng "Reading Tracker" (dùng trong link [[...]]). */
  const vaultPrefixOf = (config) => (config.vault_subfolder ?? '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');

  /**
   * Dựng file .md của sách. mediaDir là thư mục ảnh của sách trong _attachments; ảnh/file /media nào được
   * nhắc tới trong file sẽ nằm trong media.files() để chép sang vault.
   */
  async function renderItem(item, templates, { vaultPrefix, mediaDir = item.obsidian_media_dir ?? null }) {
    const cards = await libraryCards.listByItem(item.id);
    const note = await readingNotes.findByItem(item.id);
    const media = createMediaMapper({ vaultPrefix, mediaDir, toLocalPath: (url) => services.images?.toLocalPath(url) ?? null });
    const { data, body } = renderWithTemplate({ item, cards, note, template: templates[item.main_category], media });
    const text = renderMarkdown(data, body);
    return { text, hash: hashText(text), media, mediaDir: media.files().length ? mediaDir : item.obsidian_media_dir ?? null };
  }

  function loadFile(entry) {
    const raw = readText(entry.absPath);
    const file = { ...entry, raw, hash: hashText(raw) };
    try {
      file.split = splitMarkdown(raw);
      const uidEntry = Object.entries(file.split.data).find(([key]) => key.toLowerCase() === SYSTEM_KEY);
      file.uid = uidEntry && uidEntry[1] !== null && uidEntry[1] !== '' ? String(uidEntry[1]).trim() : null;
    } catch (error) {
      file.error = error.message;
    }
    return file;
  }

  async function mapFile(file, templates, media) {
    const category = detectCategory(file.split.data, templates);
    if (!category) throw new Error('Thiếu property Category (Fiction, Nonfiction, Fanfiction hoặc Visual/Comics)');
    const fallbackTitle = path.basename(file.relPath, path.extname(file.relPath));
    const statusAliases = (await services.settings?.statusAliases()) ?? {};
    const parsed = parseWithTemplate({ data: file.split.data, body: file.split.body, template: templates[category], fallbackTitle, media, statusAliases });
    if (parsed.unknownStatus) throw new Error(`Trạng thái "${parsed.unknownStatus}" chưa được ghép; import note này một lần để chọn trạng thái tương ứng`);
    parsed.item.main_category = category;
    return parsed;
  }

  async function buildPlan(config) {
    const twoWay = config.sync_direction === 'two_way';
    const templates = await templateService().all();
    const root = resolveTarget(config);
    const vaultPrefix = vaultPrefixOf(config);

    // Thư mục note media nằm ngay trong thư mục sync sách (ví dụ sync sách vào gốc vault) thì không quét như sách.
    const mediaRoot = mediaSync.rootOf(config);
    const mediaRel = mediaRoot ? path.relative(root, mediaRoot) : '';
    const skipMedia = mediaRel && !mediaRel.startsWith('..') && !path.isAbsolute(mediaRel) ? [mediaRel.split(path.sep)[0]] : [];
    const files = scanMarkdownFiles(root, { skipTopDirs: [ATTACHMENTS_DIR, ...skipMedia] }).map(loadFile);
    const filesByPath = new Map(files.map((file) => [file.relPath.toLowerCase(), file]));
    const filesByUid = new Map();
    for (const file of files) {
      if (!file.uid) continue;
      if (filesByUid.has(file.uid)) file.duplicateUid = true;
      else filesByUid.set(file.uid, file);
    }
    const takenPaths = new Set(files.map((file) => file.relPath.toLowerCase()));
    const folderFor = (category) => (config.category_folders ? config.folder_names[category] : '');
    const claimed = new Set();
    const actions = [];
    const allItems = await items.listAllInternal();
    // Việc chép ảnh của sách đã có file được thực hiện sau toàn bộ thao tác với file .md.
    const pendingMedia = [];

    // Thư mục ảnh: tên lấy theo tên file note, không trùng với thư mục đã có trên đĩa hay đã gán cho sách khác.
    const attachmentsRoot = path.join(root, ATTACHMENTS_DIR);
    const takenDirs = new Set(allItems.map((item) => item.obsidian_media_dir?.toLowerCase()).filter(Boolean));
    if (fs.existsSync(attachmentsRoot)) {
      for (const entry of fs.readdirSync(attachmentsRoot, { withFileTypes: true })) if (entry.isDirectory()) takenDirs.add(entry.name.toLowerCase());
    }
    const candidateDir = (baseName) => {
      for (let counter = 1; ; counter += 1) {
        const name = counter === 1 ? baseName : `${baseName} (${counter})`;
        if (!takenDirs.has(name.toLowerCase())) return name;
      }
    };

    for (const tombstone of await syncTombstones.list()) {
      if (tombstone.obsidian_media_dir) {
        const dirAbs = path.join(attachmentsRoot, tombstone.obsidian_media_dir);
        if (fs.existsSync(dirAbs)) actions.push({ type: 'trash_media', dirAbs, path: `${ATTACHMENTS_DIR}/${tombstone.obsidian_media_dir}` });
      }
      if (!tombstone.obsidian_path) {
        actions.push({ type: 'drop_tombstone', tombstone, path: `${ATTACHMENTS_DIR}/${tombstone.obsidian_media_dir}` });
        continue;
      }
      const file = filesByPath.get(tombstone.obsidian_path.toLowerCase());
      if (file && (file.error || !file.uid || file.uid === tombstone.sync_uid)) {
        claimed.add(file.relPath);
        actions.push({ type: 'trash_file', tombstone, file, path: file.relPath });
      } else {
        actions.push({ type: 'drop_tombstone', tombstone, path: tombstone.obsidian_path });
      }
    }

    for (const item of allItems) {
      let file = item.obsidian_path ? filesByPath.get(item.obsidian_path.toLowerCase()) : undefined;
      if (file && file.uid && file.uid !== item.sync_uid) file = undefined;
      if (file && claimed.has(file.relPath)) file = undefined;
      if (!file) {
        const byUid = filesByUid.get(item.sync_uid);
        if (byUid && !claimed.has(byUid.relPath)) file = byUid;
      }
      const newPath = file ? null : uniqueRelPath(sanitizeFileName(item.title), takenPaths, folderFor(item.main_category));
      const noteBase = path.basename(file ? file.relPath : newPath, '.md');

      const rendered = await renderItem(item, templates, { vaultPrefix, mediaDir: item.obsidian_media_dir ?? candidateDir(noteBase) });
      if (rendered.mediaDir) takenDirs.add(rendered.mediaDir.toLowerCase());
      const mediaAction = planMedia(item, rendered, attachmentsRoot);

      const base = { item, rendered, title: item.title, mediaDir: rendered.mediaDir };
      if (!file) {
        actions.push({ ...base, type: item.obsidian_path ? 'recreate_file' : 'create_file', path: newPath });
        if (mediaAction) actions.push(mediaAction);
        continue;
      }
      claimed.add(file.relPath);
      if (mediaAction) pendingMedia.push(mediaAction);

      const moved = item.obsidian_path !== file.relPath;
      const appChanged = item.sync_db_hash !== rendered.hash;
      const fileChanged = item.sync_file_hash !== file.hash;
      const fileEditedOutside = item.sync_file_hash !== null && fileChanged;

      // Một chiều: app quyết định vị trí file. Sách nằm sai thư mục thể loại (hoặc vừa đổi thể loại)
      // thì chuyển sang đúng thư mục, giữ nguyên tên file để link [[...]] trong Obsidian vẫn chạy.
      if (!twoWay) {
        const folder = folderFor(item.main_category);
        const currentFolder = file.relPath.includes('/') ? file.relPath.slice(0, file.relPath.lastIndexOf('/')) : '';
        if (currentFolder.toLowerCase() !== folder.toLowerCase()) {
          const baseName = path.basename(file.relPath, '.md');
          takenPaths.delete(file.relPath.toLowerCase());
          const target = uniqueRelPath(baseName, takenPaths, folder);
          actions.push({
            ...base,
            type: 'move_file',
            file,
            from: file.relPath,
            path: target,
            rewrite: rendered.hash !== file.hash,
            backup: fileEditedOutside && rendered.hash !== file.hash,
          });
          continue;
        }
      }

      if (rendered.hash === file.hash || (!appChanged && !fileChanged)) {
        actions.push({ ...base, type: moved ? 'track_move' : 'unchanged', file, path: file.relPath, from: item.obsidian_path });
        continue;
      }

      if (!twoWay) {
        // App là nguồn duy nhất: ghi đè, nhưng giữ lại bản người dùng đã sửa trong Obsidian.
        actions.push({ ...base, type: fileEditedOutside ? 'overwrite_external_edit' : 'write_file', file, path: file.relPath });
        continue;
      }

      if (file.error) {
        actions.push({ ...base, type: 'skip', path: file.relPath, reason: file.error });
        continue;
      }
      let mapped = null;
      let mapError = null;
      try {
        mapped = await mapFile(file, templates, rendered.media);
      } catch (error) {
        mapError = error.message;
      }

      if (appChanged && !fileChanged) {
        actions.push({ ...base, type: 'write_file', file, path: file.relPath });
      } else if (!appChanged && fileChanged) {
        actions.push(
          mapError
            ? { ...base, type: 'skip', path: file.relPath, reason: mapError }
            : { ...base, type: 'import_file', file, mapped, path: file.relPath },
        );
      } else {
        const winner = file.mtimeMs > Date.parse(item.updated_at) && !mapError ? 'file' : 'app';
        actions.push({
          ...base,
          type: 'conflict',
          winner,
          file,
          mapped,
          path: file.relPath,
          ...(mapError ? { reason: `File không hợp lệ nên app thắng: ${mapError}` } : {}),
        });
      }
    }

    for (const file of files) {
      if (claimed.has(file.relPath)) continue;
      if (!twoWay) {
        actions.push({ type: 'ignored', path: file.relPath, reason: 'File không do app tạo; chế độ một chiều không nhập file từ Obsidian' });
        continue;
      }
      if (file.error) {
        actions.push({ type: 'skip', path: file.relPath, reason: file.error });
        continue;
      }
      try {
        const mapped = await mapFile(file, templates);
        const uidTaken = file.uid && (file.duplicateUid || (await items.findBySyncUid(file.uid)));
        actions.push({
          type: 'import_new',
          file,
          mapped,
          path: file.relPath,
          title: mapped.item.title,
          reuseUid: file.uid && !uidTaken ? file.uid : null,
        });
      } catch (error) {
        actions.push({ type: 'skip', path: file.relPath, reason: error.message });
      }
    }

    actions.push(...pendingMedia);
    return { root, templates, actions, direction: config.sync_direction, vaultPrefix };
  }

  /**
   * So thư mục ảnh của sách trong vault với danh sách file mà file .md đang nhắc tới:
   * file thiếu hoặc khác kích thước thì chép, file thừa (ảnh đã bỏ trong app) thì chuyển vào .trash.
   */
  function planMedia(item, rendered, attachmentsRoot) {
    const dir = rendered.mediaDir;
    if (!dir) return null;
    const dirAbs = path.join(attachmentsRoot, dir);
    const present = new Map(listFiles(dirAbs).map((entry) => [entry.name.toLowerCase(), entry]));
    const copy = [];
    const missing = [];
    const expected = new Set();
    for (const file of rendered.media.files()) {
      expected.add(file.name.toLowerCase());
      if (!file.localPath || !fs.existsSync(file.localPath)) {
        missing.push(file.name);
        continue;
      }
      const existing = present.get(file.name.toLowerCase());
      if (!existing || existing.size !== fs.statSync(file.localPath).size) copy.push({ from: file.localPath, to: path.join(dirAbs, file.name), name: file.name });
    }
    const remove = [...present.values()].filter((entry) => !expected.has(entry.name.toLowerCase()));
    if (!copy.length && !remove.length && !missing.length) return null;
    return {
      type: 'sync_media',
      item,
      title: item.title,
      mediaDir: dir,
      path: `${ATTACHMENTS_DIR}/${dir}`,
      copy,
      remove,
      ...(missing.length ? { reason: `Không tìm thấy trong thư mục lưu trữ: ${missing.join(', ')}` } : {}),
    };
  }

  // ---------- Thực thi ----------

  async function saveState(itemId, relPath, templates, fileHash, ctx) {
    const rendered = await renderItem(await items.findByIdInternal(itemId), templates, { vaultPrefix: ctx.vaultPrefix });
    await items.setSyncState(itemId, { obsidian_path: relPath, sync_db_hash: rendered.hash, sync_file_hash: fileHash ?? rendered.hash });
  }

  async function writeFromApp({ item, rendered, path: relPath }, ctx) {
    writeTextAtomic(toAbsolute(ctx.root, relPath), rendered.text);
    await items.setSyncState(item.id, { obsidian_path: relPath, sync_db_hash: rendered.hash, sync_file_hash: rendered.hash });
  }

  async function applyImport(itemId, mapped) {
    const existing = await items.findByIdInternal(itemId);
    const cards = mergeCards(await libraryCards.listByItem(itemId), mapped);
    await items.update(itemId, {
      ...mapped.item,
      custom_fields: { ...(existing?.custom_fields ?? {}), ...mapped.customFields },
      obsidian_extra: mapped.extra,
    });
    await libraryCards.replaceAllForItem(itemId, cards);
    await readingNotes.upsert(itemId, mapped.note);
  }

  const executors = {
    async unchanged({ item, path: relPath, file }, ctx) {
      if (item.sync_file_hash !== file.hash || item.sync_db_hash === null) await saveState(item.id, relPath, ctx.templates, file.hash, ctx);
    },
    async track_move({ item, path: relPath, file }, ctx) {
      await saveState(item.id, relPath, ctx.templates, file.hash, ctx);
    },
    create_file: writeFromApp,
    recreate_file: writeFromApp,
    write_file: writeFromApp,
    async move_file(action, ctx) {
      const target = toAbsolute(ctx.root, action.path);
      if (action.backup) action.conflict_path = relative(ctx.root, writeConflictCopy(target, action.file.raw));
      moveFile(action.file.absPath, target);
      if (action.rewrite) writeTextAtomic(target, action.rendered.text);
      await items.setSyncState(action.item.id, { obsidian_path: action.path, sync_db_hash: action.rendered.hash, sync_file_hash: action.rendered.hash });
    },
    async overwrite_external_edit(action, ctx) {
      action.conflict_path = relative(ctx.root, writeConflictCopy(toAbsolute(ctx.root, action.path), action.file.raw));
      await writeFromApp(action, ctx);
    },
    import_file({ item, mapped, file, path: relPath }, ctx) {
      return db.transaction(async () => {
        await applyImport(item.id, mapped);
        await saveState(item.id, relPath, ctx.templates, file.hash, ctx);
      })();
    },
    async conflict(action, ctx) {
      const absPath = toAbsolute(ctx.root, action.path);
      if (action.winner === 'file') {
        action.conflict_path = relative(ctx.root, writeConflictCopy(absPath, action.rendered.text));
        await executors.import_file(action, ctx);
      } else {
        action.conflict_path = relative(ctx.root, writeConflictCopy(absPath, action.file.raw));
        await writeFromApp(action, ctx);
      }
    },
    import_new(action, ctx) {
      const { file, mapped, reuseUid, path: relPath } = action;
      return db.transaction(async () => {
        const created = await items.create({
          ...mapped.item,
          custom_fields: mapped.customFields,
          obsidian_extra: mapped.extra,
          ...(reuseUid ? { sync_uid: reuseUid } : {}),
        });
        await libraryCards.replaceAllForItem(created.id, mergeCards([], mapped));
        await readingNotes.upsert(created.id, mapped.note);
        action.item_id = created.id;

        let fileHash = file.hash;
        if (!reuseUid) {
          const updated = file.uid
            ? file.raw.replace(new RegExp(`^(${SYSTEM_KEY})[ \\t]*:.*$`, 'mi'), `$1: ${created.sync_uid}`)
            : insertProperty(file.raw, SYSTEM_KEY, created.sync_uid);
          writeTextAtomic(file.absPath, updated);
          fileHash = hashText(updated);
        }
        await saveState(created.id, relPath, ctx.templates, fileHash, ctx);
      })();
    },
    sync_media(action) {
      for (const entry of action.copy) copyFileAtomic(entry.from, entry.to);
      for (const entry of action.remove) moveEntryToTrash(action.rootForTrash, entry.absPath);
      action.copied = action.copy.length;
      action.removed = action.remove.length;
    },
    trash_media(action, ctx) {
      action.trash_path = relative(ctx.root, moveEntryToTrash(ctx.root, action.dirAbs));
    },
    async trash_file(action, ctx) {
      action.trash_path = relative(ctx.root, moveToTrash(ctx.root, action.file.absPath));
      await syncTombstones.delete(action.tombstone.id);
    },
    async drop_tombstone(action) {
      await syncTombstones.delete(action.tombstone.id);
    },
    skip() {},
    ignored() {},
  };

  function summarize(action) {
    const itemId = action.item?.id ?? action.item_id;
    return {
      action: action.type,
      path: action.path,
      ...(itemId ? { item_id: itemId } : {}),
      ...(action.title ? { title: action.title } : {}),
      ...(action.from ? { from: action.from } : {}),
      ...(action.winner ? { winner: action.winner } : {}),
      ...(action.conflict_path ? { conflict_path: action.conflict_path } : {}),
      ...(action.trash_path ? { trash_path: action.trash_path } : {}),
      ...(action.type === 'sync_media' ? { copy: action.copy.length, remove: action.remove.length } : {}),
      ...(action.scope ? { scope: action.scope } : {}),
      ...(action.reason ? { reason: action.reason } : {}),
      ...(action.error ? { error: action.error } : {}),
    };
  }

  return {
    async getStatus() {
      const config = await syncConfig.get();
      let folder = null;
      let folderError = null;
      try {
        folder = resolveTarget(config, { requireEnabled: false });
      } catch (error) {
        folderError = error.message;
      }
      return {
        running,
        sync_enabled: config.sync_enabled,
        sync_direction: config.sync_direction,
        last_sync_time: config.last_sync_time,
        sync_folder: folder,
        sync_folder_error: folderError,
        pending_deletions: (await syncTombstones.list()).length + (await mediaSync.pendingDeletions()),
        media_folder: mediaSync.rootOf(config),
      };
    },

    async run({ dryRun = false } = {}) {
      if (running) throw new ConflictError('Đang có một lượt sync chạy, thử lại sau');
      running = true;
      const startedAt = nowIso();
      try {
        const config = await syncConfig.get();
        const plan = await buildPlan(config);
        // Media: một chiều, chạy sau sách; lỗi của phần media không chặn phần sách.
        let mediaPlan = null;
        try {
          mediaPlan = await mediaSync.plan(config);
        } catch (error) {
          plan.actions.push({ scope: 'media', type: 'skip', path: config.media_subfolder, reason: `Không sync được media: ${error.message}` });
        }
        if (mediaPlan) plan.actions.push(...mediaPlan.actions);
        if (!dryRun && mediaPlan) {
          const mediaActions = new Set(mediaPlan.actions);
          plan.actions = plan.actions.filter((action) => !mediaActions.has(action));
          plan.mediaActions = mediaPlan.actions;
        }
        if (!dryRun) {
          fs.mkdirSync(plan.root, { recursive: true });
          const ctx = { root: plan.root, templates: plan.templates, vaultPrefix: plan.vaultPrefix };
          for (const action of plan.actions) {
            try {
              if (action.type === 'sync_media') action.rootForTrash = plan.root;
              // Thư mục ảnh được ghi nhớ trước khi ghi file để lần sync sau dựng ra đúng cùng đường dẫn.
              if (action.item && action.mediaDir && action.type !== 'skip' && (await items.findByIdInternal(action.item.id))?.obsidian_media_dir !== action.mediaDir) {
                await items.setMediaDir(action.item.id, action.mediaDir);
              }
              await executors[action.type](action, ctx);
            } catch (error) {
              action.error = error.message;
            }
          }
          pruneEmptyDirs(plan.root);
          if (mediaPlan) {
            await mediaSync.execute(mediaPlan);
            pruneEmptyDirs(mediaPlan.root);
            plan.actions.push(...plan.mediaActions);
          }
          await syncConfig.update({ last_sync_time: nowIso() });
        }
        const counts = {};
        for (const action of plan.actions) {
          const key = action.error ? 'failed' : action.type;
          counts[key] = (counts[key] ?? 0) + 1;
        }
        return {
          dry_run: dryRun,
          direction: plan.direction,
          sync_folder: plan.root,
          media_folder: mediaPlan?.root ?? null,
          started_at: startedAt,
          finished_at: nowIso(),
          counts,
          actions: plan.actions.filter((action) => action.type !== 'unchanged').map(summarize),
        };
      } finally {
        running = false;
      }
    },
  };
}
