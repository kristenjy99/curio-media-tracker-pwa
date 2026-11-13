import fs from 'node:fs';
import path from 'node:path';
import { FILES_URL_PREFIX } from '../../media/mediaItemService.js';
import { hashText, renderMarkdown, splitMarkdown } from './markdown.js';
import { appendGallery, ATTACHMENTS_DIR, bodyToVault, createMediaMapper, renderGallery } from './mediaLinks.js';
import { starsText } from './templates/codec.js';
import {
  copyFileAtomic,
  listFiles,
  moveEntryToTrash,
  moveFile,
  moveToTrash,
  readText,
  sanitizeFileName,
  scanMarkdownFiles,
  toAbsolute,
  uniqueRelPath,
  writeConflictCopy,
  writeTextAtomic,
} from './vaultFs.js';

export const MEDIA_FOLDER_NAMES = { tv_series: 'TV Series', movie: 'Movies', animation: 'Animation', youtube: 'YouTube', short_drama: 'Short Dramas' };
const STATUS_TEXT = { TBW: 'TBW', Watching: 'Watching', Finished: 'Finished', DNF: 'DNF' };
const UID_KEY = 'rt_id';

const relative = (root, absPath) => path.relative(root, absPath).split(path.sep).join('/');
const links = (list) => (list ?? []).map((value) => `[[${String(value).replace(/[[\]|]/g, ' ').trim()}]]`);
const pad = (value) => String(value).padStart(2, '0');
const monthText = (year, month) => (year ? (month ? `${year}-${pad(month)}` : String(year)) : '');

function watchLine(card) {
  const parts = [`#${card.watch_number}`];
  if (card.season !== null) parts.push(`S${card.season}${card.season_watch_number > 1 ? ` (lần ${card.season_watch_number})` : ''}`);
  const start = monthText(card.start_year, card.start_month);
  const finish = monthText(card.finish_year, card.finish_month);
  parts.push(start && finish ? `${start} → ${finish}` : start ? `${start} → đang xem` : finish);
  const stars = starsText(card.rating);
  if (stars) parts.push(stars);
  if (card.note) parts.push(card.note.replace(/\s*\n\s*/g, ' '));
  return parts.join(' · ');
}

/**
 * File .md của một media, dùng một template chung cho mọi category. rt_id đứng đầu làm định danh.
 * Kênh YouTube có ở mọi category; Topics chỉ có ở YouTube. Phần thân là note & review cùng mục gallery.
 */
export function renderMediaNote({ item, cards, note, mapper }) {
  const latest = cards.length ? cards[cards.length - 1] : null;
  const cover = item.cover_image ? mapper.link(item.cover_image) ?? (/^https?:\/\//i.test(item.cover_image) ? item.cover_image : null) : null;
  const years = [...new Set(cards.map((card) => card.finish_year ?? card.start_year).filter(Boolean))].sort((a, b) => a - b);
  const data = {
    [UID_KEY]: item.sync_uid,
    Category: MEDIA_FOLDER_NAMES[item.category],
    Status: STATUS_TEXT[item.status],
    Rating: starsText(item.rating) ? `[[${starsText(item.rating)}]]` : '',
    'Favorite?': Boolean(item.is_favorite),
    Series: item.series_name ? `[[${item.series_name}]]` : '',
    Season: item.season_current !== null || item.season_total !== null ? `${item.season_current ?? '?'}/${item.season_total ?? '?'}` : '',
    Episodes: item.progress_total ? `${item.progress_current}/${item.progress_total}` : item.progress_current ? String(item.progress_current) : '',
    'Episodes per season': item.episodes_per_season.map((count, index) => `S${index + 1}: ${count ?? '?'}`),
    Genres: links(item.genres),
    Cast: links(item.cast_members),
    Studio: links(item.studios),
    Platform: links(item.platforms),
    Countries: links(item.countries),
    Language: item.language ? `[[${item.language}]]` : '',
    Channel: item.youtube_channel ? `[[${item.youtube_channel}]]` : '',
    ...(item.category === 'youtube' ? { Topics: links(item.topics) } : {}),
    Trailer: item.trailer_url ?? '',
    Warnings: links(item.warnings),
    Cover: cover ? (cover.startsWith('http') ? cover : `[[${cover}]]`) : '',
    'Date started': latest ? monthText(latest.start_year, latest.start_month) : '',
    'Date finished': latest ? monthText(latest.finish_year, latest.finish_month) : '',
    Year: years,
    Watches: cards.map(watchLine),
  };
  const body = appendGallery(bodyToVault(note?.content_markdown ?? '', mapper), renderGallery(note, mapper));
  const text = renderMarkdown(data, body);
  return { text, hash: hashText(text) };
}

function loadFile(entry) {
  const raw = readText(entry.absPath);
  const file = { ...entry, raw, hash: hashText(raw), uid: null };
  try {
    const { data } = splitMarkdown(raw);
    const found = Object.entries(data).find(([key]) => key.toLowerCase() === UID_KEY);
    if (found && found[1] !== null && found[1] !== '') file.uid = String(found[1]).trim();
  } catch (error) {
    file.error = error.message;
  }
  return file;
}

/**
 * Sync media -> Obsidian, luôn một chiều: app là nguồn dữ liệu. Mỗi media một file trong
 * <vault>/<media_subfolder>/<thư mục category>/; ảnh/file chép vào <media_subfolder>/_attachments/<tên note>/.
 * File bị sửa trong Obsidian vẫn bị ghi đè, bản sửa giữ lại thành file .conflict. File không có rt_id của app thì bỏ qua.
 */
export function createMediaSync(context) {
  const mediaDb = () => context.mediaDb;
  const detail = () => context.mediaServices?.detail;
  const mediaItems = () => context.mediaServices?.items;

  const setState = (id, state) => {
    const keys = Object.keys(state);
    return mediaDb().run(`UPDATE media_items SET ${keys.map((key) => `${key} = ?`).join(', ')} WHERE id = ?`, [...keys.map((key) => state[key]), id]);
  };

  async function render(item, { vaultPrefix, mediaDir }) {
    const mapper = createMediaMapper({ vaultPrefix, mediaDir, urlPrefix: FILES_URL_PREFIX, toLocalPath: (url) => detail().toLocal(url) });
    const cards = await detail().cardsOf(item.id);
    const note = await detail().getNote(item.id);
    const rendered = renderMediaNote({ item, cards, note, mapper });
    return { ...rendered, mapper };
  }

  function planMediaFiles(item, rendered, mediaDir, attachmentsRoot) {
    const dirAbs = path.join(attachmentsRoot, mediaDir);
    const present = new Map(listFiles(dirAbs).map((entry) => [entry.name.toLowerCase(), entry]));
    const copy = [];
    const missing = [];
    const expected = new Set();
    for (const file of rendered.mapper.files()) {
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
      scope: 'media',
      type: 'sync_media',
      item,
      title: item.title,
      path: `${ATTACHMENTS_DIR}/${mediaDir}`,
      copy,
      remove,
      ...(missing.length ? { reason: `Không tìm thấy trong thư mục lưu trữ: ${missing.join(', ')}` } : {}),
    };
  }

  /** Thư mục note media tính từ gốc vault; null nếu không sync media (chưa có vault, tắt, hoặc chưa mở DB media). */
  function rootOf(config) {
    if (!config.vault_path || !config.media_subfolder || !mediaDb()?.open || !detail()) return null;
    return toAbsolute(config.vault_path, config.media_subfolder);
  }

  async function plan(config) {
    const root = rootOf(config);
    if (!root) return null;
    const vaultPrefix = config.media_subfolder.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    const files = fs.existsSync(root) ? scanMarkdownFiles(root, { skipTopDirs: [ATTACHMENTS_DIR] }).map(loadFile) : [];
    const byUid = new Map();
    for (const file of files) if (file.uid && !byUid.has(file.uid)) byUid.set(file.uid, file);
    const taken = new Set(files.map((file) => file.relPath.toLowerCase()));
    const claimed = new Set();
    const actions = [];
    const attachmentsRoot = path.join(root, ATTACHMENTS_DIR);
    const allItems = (await mediaItems().list()).items;
    const takenDirs = new Set(allItems.map((item) => item.obsidian_media_dir?.toLowerCase()).filter(Boolean));
    if (fs.existsSync(attachmentsRoot)) for (const entry of fs.readdirSync(attachmentsRoot, { withFileTypes: true })) if (entry.isDirectory()) takenDirs.add(entry.name.toLowerCase());
    const candidateDir = (base) => {
      for (let counter = 1; ; counter += 1) {
        const name = counter === 1 ? base : `${base} (${counter})`;
        if (!takenDirs.has(name.toLowerCase())) {
          takenDirs.add(name.toLowerCase());
          return name;
        }
      }
    };
    const folderFor = (category) => (config.category_folders ? MEDIA_FOLDER_NAMES[category] : '');
    const managedFolders = new Set(Object.values(MEDIA_FOLDER_NAMES).map((name) => name.toLowerCase()));

    // Media đã xoá trong app: file và thư mục ảnh vào .trash.
    for (const tombstone of await mediaDb().all('SELECT * FROM media_sync_tombstones')) {
      const file = byUid.get(tombstone.sync_uid);
      if (file) {
        claimed.add(file.relPath.toLowerCase());
        actions.push({ scope: 'media', type: 'trash_file', file, tombstone, path: file.relPath });
      }
      if (tombstone.obsidian_media_dir) {
        const dirAbs = path.join(attachmentsRoot, tombstone.obsidian_media_dir);
        if (fs.existsSync(dirAbs)) actions.push({ scope: 'media', type: 'trash_media', dirAbs, path: `${ATTACHMENTS_DIR}/${tombstone.obsidian_media_dir}` });
      }
      actions.push({ scope: 'media', type: 'drop_tombstone', tombstone, path: tombstone.obsidian_path ?? tombstone.sync_uid });
    }

    const mediaActions = [];
    for (const item of allItems) {
      const file = byUid.get(item.sync_uid);
      const folder = folderFor(item.category);
      let relPath;
      let from = null;
      if (file) {
        claimed.add(file.relPath.toLowerCase());
        relPath = file.relPath;
        // Đổi category thì chuyển file sang thư mục mới, nếu file đang nằm trong một thư mục category do app quản lý (hoặc ở gốc).
        const parent = path.posix.dirname(file.relPath);
        const inManaged = parent === '.' || managedFolders.has(parent.toLowerCase());
        if (inManaged && (parent === '.' ? '' : parent).toLowerCase() !== folder.toLowerCase()) {
          from = file.relPath;
          relPath = uniqueRelPath(path.posix.basename(file.relPath, '.md'), taken, folder);
        }
      } else {
        relPath = uniqueRelPath(sanitizeFileName(item.title), taken, folder);
      }
      const mediaDir = item.obsidian_media_dir ?? candidateDir(path.posix.basename(relPath, '.md'));
      const rendered = await render(item, { vaultPrefix, mediaDir });
      const hasMedia = rendered.mapper.files().length > 0;
      const base = { scope: 'media', item, title: item.title, rendered, path: relPath, mediaDir: hasMedia ? mediaDir : item.obsidian_media_dir ?? null };
      if (!file) actions.push({ ...base, type: 'create_file' });
      else if (from) actions.push({ ...base, type: 'move_file', file, from, backup: Boolean(item.sync_file_hash && file.hash !== item.sync_file_hash && file.hash !== rendered.hash) });
      else if (file.hash === rendered.hash) actions.push({ ...base, type: 'unchanged', file });
      else if (item.sync_file_hash && file.hash !== item.sync_file_hash) actions.push({ ...base, type: 'overwrite_external_edit', file });
      else actions.push({ ...base, type: 'write_file', file });
      if (hasMedia) {
        const media = planMediaFiles(item, rendered, mediaDir, attachmentsRoot);
        if (media) mediaActions.push({ ...media, mediaDir });
      }
    }
    for (const file of files) {
      if (!claimed.has(file.relPath.toLowerCase())) actions.push({ scope: 'media', type: 'ignored', path: file.relPath, reason: 'File không do app tạo; media chỉ sync một chiều từ app' });
    }
    return { root, actions: [...actions, ...mediaActions] };
  }

  const write = async (action, root) => {
    writeTextAtomic(toAbsolute(root, action.path), action.rendered.text);
    await setState(action.item.id, { obsidian_path: action.path, sync_db_hash: action.rendered.hash, sync_file_hash: action.rendered.hash });
  };

  const executors = {
    async unchanged(action) {
      if (action.item.obsidian_path !== action.path || action.item.sync_file_hash !== action.file.hash) {
        await setState(action.item.id, { obsidian_path: action.path, sync_db_hash: action.rendered.hash, sync_file_hash: action.file.hash });
      }
    },
    create_file: write,
    write_file: write,
    async overwrite_external_edit(action, root) {
      action.conflict_path = relative(root, writeConflictCopy(toAbsolute(root, action.path), action.file.raw));
      await write(action, root);
    },
    async move_file(action, root) {
      const target = toAbsolute(root, action.path);
      if (action.backup) action.conflict_path = relative(root, writeConflictCopy(target, action.file.raw));
      moveFile(action.file.absPath, target);
      await write(action, root);
    },
    sync_media(action, root) {
      for (const entry of action.copy) copyFileAtomic(entry.from, entry.to);
      for (const entry of action.remove) moveEntryToTrash(root, entry.absPath);
    },
    trash_file(action, root) {
      action.trash_path = relative(root, moveToTrash(root, action.file.absPath));
    },
    trash_media(action, root) {
      action.trash_path = relative(root, moveEntryToTrash(root, action.dirAbs));
    },
    async drop_tombstone(action) {
      await mediaDb().run('DELETE FROM media_sync_tombstones WHERE id = ?', [action.tombstone.id]);
    },
    ignored() {},
  };

  return {
    rootOf,
    plan,
    pendingDeletions: async () =>
      mediaDb()?.open ? await mediaDb().get('SELECT COUNT(*) FROM media_sync_tombstones', undefined, { pluck: true }) : 0,
    async execute(planned) {
      fs.mkdirSync(planned.root, { recursive: true });
      for (const action of planned.actions) {
        try {
          if (action.item && action.mediaDir && action.item.obsidian_media_dir !== action.mediaDir) {
            await setState(action.item.id, { obsidian_media_dir: action.mediaDir });
            action.item.obsidian_media_dir = action.mediaDir;
          }
          await executors[action.type](action, planned.root);
        } catch (error) {
          action.error = error.message;
        }
      }
    },
  };
}
