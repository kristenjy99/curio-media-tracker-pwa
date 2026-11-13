import { ConflictError, NotFoundError, ValidationError } from '../utils/errors.js';
import { joinStorePath } from '../storage/fileStore.js';

/** SVG: văn bản UTF-8 có thẻ <svg> ở đầu (cho phép khai báo XML, DOCTYPE, comment trước đó). */
function isSvg(buffer) {
  const head = buffer.subarray(0, 4096).toString('utf8').replace(/^\uFEFF/, '');
  return /^\s*(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(head);
}
import { detectImageType, MEDIA_PREFIX } from './imageService.js';

export const DEFAULT_SETTINGS = {
  // app_icon: ảnh PNG 256×256 người dùng tải lên (logo, favicon); app_icon_ico: bản .ico cho lối tắt Desktop.
  general: { app_name: 'Media Tracker', ui_language: 'vi', app_icon: null, app_icon_ico: null },
  languages: ['Tiếng Việt', 'English', '日本語', '한국어', '中文'],
  // Trạng thái lạ trong note Obsidian -> trạng thái của app, do người dùng chọn khi import (key đã chuẩn hoá).
  status_aliases: {},
  // Đồ trang trí đặt ngẫu nhiên giữa các gáy sách trên kệ (PNG/SVG người dùng tải lên).
  ornaments: { enabled: true, per_shelf: 2, items: [] },
  // Theme tự tạo: [{ id: 'custom-...', name, light: {7 màu}, dark: {7 màu} }]; appearance.preset = id để dùng.
  themes: [],
  // [{ fandom, pairings: [] }] do người dùng tự soạn; gợi ý pairing trong form = kho + pairing đã có ở sách cùng fandom.
  fandom_library: [],
  appearance: {
    preset: 'moss',
    accent: null,
    display_font: 'fraunces',
    body_font: 'be-vietnam-pro',
    font_size: 15,
    background_image: null,
    background_opacity: 0.25,
  },
};

/**
 * Cài đặt chung lưu dạng key/value JSON trong bảng app_settings; key nào chưa lưu thì dùng mặc định.
 *
 * Ảnh nền, biểu tượng app và đồ trang trí đi qua FileStore (thư mục `app/` trong store) nên bản PWA
 * dùng được mà không sửa gì; trước Phiên 3 phần này ghi thẳng bằng node:fs.
 *
 * `desktop` là phần chỉ có trên Windows (file .ico và lối tắt Desktop). Bản PWA truyền null: khi đó
 * biểu tượng app chỉ lưu bản PNG, không tạo .ico và không có lối tắt — xem server/platform/browserContext.js.
 */
export function createSettingsService({ db, fileStore, desktop = null }) {
  const SQL_GET = 'SELECT value FROM app_settings WHERE key = ?';
  const SQL_PUT = 'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value';

  const read = async (key) => {
    const raw = await db.get(SQL_GET, [key], { pluck: true });
    if (!raw) return structuredClone(DEFAULT_SETTINGS[key]);
    const value = JSON.parse(raw);
    return key === 'appearance' || key === 'general' ? { ...DEFAULT_SETTINGS[key], ...value } : value;
  };
  const write = (key, value) => db.run(SQL_PUT, [key, JSON.stringify(value)]);

  /** Store của app; ném lỗi khi chưa có nơi lưu (test không truyền store). */
  function store() {
    if (!fileStore) throw new ConflictError('Server chưa có thư mục lưu trữ để lưu ảnh');
    return fileStore;
  }

  /** URL /media/app/... -> đường dẫn trong store, hoặc null nếu không phải file của app. */
  function toStorePath(url) {
    if (typeof url !== 'string' || !url.startsWith(`${MEDIA_PREFIX}app/`)) return null;
    const parts = url.slice(MEDIA_PREFIX.length).split('/').map(decodeURIComponent);
    if (parts.some((part) => part === '..' || part === '')) return null;
    return joinStorePath(...parts);
  }

  async function removeLocal(url) {
    const relative = toStorePath(url);
    if (relative && fileStore) await fileStore.remove(relative);
  }

  /** Đường dẫn đĩa của file .ico, để truyền cho lối tắt Desktop. Trên trình duyệt luôn null. */
  async function iconLocalPath(url) {
    const relative = toStorePath(url);
    if (!relative || !fileStore) return null;
    return fileStore.resolve(relative);
  }

  return {
    statusAliases: () => read('status_aliases'),

    /** Ghi thêm các cặp ghép trạng thái (giữ các cặp đã có). */
    async rememberStatusAliases(map) {
      if (Object.keys(map).length) await write('status_aliases', { ...(await read('status_aliases')), ...map });
    },

    async get() {
      return {
        general: await read('general'),
        languages: await read('languages'),
        appearance: await read('appearance'),
        status_aliases: await read('status_aliases'),
        ornaments: await read('ornaments'),
        themes: await read('themes'),
        fandom_library: await read('fandom_library'),
      };
    },

    update(patch) {
      return db.transaction(async () => {
        if (patch.languages) await write('languages', patch.languages);
        if (patch.status_aliases) await write('status_aliases', patch.status_aliases);
        if (patch.general) await write('general', { ...(await read('general')), ...patch.general });
        if (patch.ornaments) {
          const current = (await read('ornaments'));
          const next = { ...current, ...patch.ornaments };
          if (patch.ornaments.items) {
            // Giữ src do server cấp; danh sách gửi lên quyết định thứ tự và thông tin hiển thị, không thêm hay xoá file.
            const byId = new Map(current.items.map((entry) => [entry.id, entry]));
            const sent = patch.ornaments.items.filter((entry) => byId.has(entry.id)).map((entry) => ({ ...byId.get(entry.id), ...entry }));
            const missing = current.items.filter((entry) => !sent.some((other) => other.id === entry.id));
            next.items = [...sent, ...missing];
          }
          await write('ornaments', next);
        }
        if (patch.themes) await write('themes', patch.themes);
        if (patch.fandom_library) {
          // Bỏ pairing trùng (không phân biệt hoa thường) trong từng fandom.
          await write(
            'fandom_library',
            patch.fandom_library.map((entry) => ({
              fandom: entry.fandom,
              pairings: entry.pairings.filter((value, index, list) => list.findIndex((other) => other.toLowerCase() === value.toLowerCase()) === index),
            })),
          );
        }
        if (patch.appearance) {
          // background_image chỉ đổi qua API tải ảnh nền, không cho ghi tay đường dẫn.
          const { background_image: ignored, ...rest } = patch.appearance;
          await write('appearance', { ...(await read('appearance')), ...rest });
        }
        // Theme đang dùng không còn (bị xoá hoặc id lạ) thì quay về bảng màu mặc định.
        const appearance = (await read('appearance'));
        if (appearance.preset.startsWith('custom-') && !(await read('themes')).some((theme) => theme.id === appearance.preset)) {
          if (patch.appearance?.preset === appearance.preset) throw new ValidationError('Theme không tồn tại', [{ path: ['appearance', 'preset'], message: 'Theme không tồn tại' }]);
          await write('appearance', { ...appearance, preset: DEFAULT_SETTINGS.appearance.preset });
        }
        return this.get();
      })();
    },

    async resetAppearance() {
      const current = (await read('appearance'));
      await removeLocal(current.background_image);
      await write('appearance', DEFAULT_SETTINGS.appearance);
      return this.get();
    },

    async uploadBackground(buffer) {
      const ext = detectImageType(buffer);
      if (!ext) throw new ValidationError('File không phải ảnh JPG, PNG, WebP, GIF hoặc AVIF', [{ path: ['file'], message: 'Sai định dạng' }]);
      const fileName = `background-${Date.now()}.${ext}`;
      await store().write(joinStorePath('app', fileName), buffer);
      const appearance = (await read('appearance'));
      await removeLocal(appearance.background_image);
      await write('appearance', { ...appearance, background_image: `${MEDIA_PREFIX}app/${fileName}` });
      return this.get();
    },

    /**
     * Đổi biểu tượng app bằng ảnh PNG. Trên Windows lưu kèm bản .ico và gán cho lối tắt Desktop;
     * trên PWA (desktop = null) chỉ lưu bản PNG, app_icon_ico để null.
     */
    async uploadAppIcon(buffer) {
      if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new ValidationError('File rỗng', [{ path: ['file'], message: 'Rỗng' }]);
      if (detectImageType(buffer) !== 'png') throw new ValidationError('Biểu tượng phải là ảnh PNG', [{ path: ['file'], message: 'Sai định dạng' }]);
      if (buffer.length > 2 * 1024 * 1024) throw new ValidationError('Ảnh biểu tượng tối đa 2MB', [{ path: ['file'], message: `${buffer.length} byte` }]);
      // Tên file đổi mỗi lần để Windows và trình duyệt không dùng lại ảnh cũ trong bộ nhớ đệm.
      const stamp = Date.now().toString(36);
      const pngName = `app-icon-${stamp}.png`;
      const icoName = `app-icon-${stamp}.ico`;
      await store().write(joinStorePath('app', pngName), buffer);
      let icoUrl = null;
      if (desktop) {
        const ico = desktop.pngToIco(buffer);
        await store().write(joinStorePath('app', icoName), ico);
        await desktop.saveIconCopy(ico);
        icoUrl = `${MEDIA_PREFIX}app/${icoName}`;
      }
      const general = (await read('general'));
      await removeLocal(general.app_icon);
      await removeLocal(general.app_icon_ico);
      await write('general', { ...general, app_icon: `${MEDIA_PREFIX}app/${pngName}`, app_icon_ico: icoUrl });
      const shortcut = desktop ? await desktop.updateShortcut(await iconLocalPath(icoUrl)) : null;
      return { ...(await this.get()), shortcut };
    },

    async removeAppIcon() {
      const general = (await read('general'));
      await removeLocal(general.app_icon);
      await removeLocal(general.app_icon_ico);
      await desktop?.saveIconCopy(null);
      await write('general', { ...general, app_icon: null, app_icon_ico: null });
      const shortcut = desktop ? await desktop.updateShortcut(null) : null;
      return { ...(await this.get()), shortcut };
    },

    /** Tạo (nếu chưa có) hoặc cập nhật lối tắt Desktop với biểu tượng hiện tại. Chỉ có trên Windows. */
    async desktopShortcut() {
      if (!desktop) throw new ConflictError('Lối tắt Desktop chỉ có trên bản Windows');
      const ico = (await read('general')).app_icon_ico;
      return { shortcut: await desktop.updateShortcut(await iconLocalPath(ico), { create: true }) };
    },

    /** Thêm một đồ trang trí từ file PNG/SVG (hoặc ảnh thường khác). */
    async uploadOrnament(buffer, name) {
      if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new ValidationError('File rỗng', [{ path: ['file'], message: 'Rỗng' }]);
      if (buffer.length > 3 * 1024 * 1024) throw new ValidationError('File trang trí tối đa 3MB', [{ path: ['file'], message: `${buffer.length} byte` }]);
      const ext = detectImageType(buffer) ?? (isSvg(buffer) ? 'svg' : null);
      if (!ext) throw new ValidationError('File không phải ảnh PNG hoặc SVG', [{ path: ['file'], message: 'Sai định dạng' }]);
      const ornaments = (await read('ornaments'));
      if (ornaments.items.length >= 200) throw new ValidationError('Tối đa 200 đồ trang trí', [{ path: ['file'], message: 'Quá nhiều' }]);
      const id = `o-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      await store().write(joinStorePath('app', 'ornaments', `${id}.${ext}`), buffer);
      const label = String(name ?? '').replace(/\.[a-z0-9]+$/i, '').trim().slice(0, 80) || 'Đồ trang trí';
      await write('ornaments', { ...ornaments, items: [...ornaments.items, { id, name: label, src: `${MEDIA_PREFIX}app/ornaments/${id}.${ext}`, enabled: true, size: 'md' }] });
      return this.get();
    },

    async removeOrnament(id) {
      const ornaments = (await read('ornaments'));
      const target = ornaments.items.find((entry) => entry.id === id);
      if (!target) throw new NotFoundError('Đồ trang trí', id);
      await removeLocal(target.src);
      await write('ornaments', { ...ornaments, items: ornaments.items.filter((entry) => entry.id !== id) });
      return this.get();
    },

    async removeBackground() {
      const appearance = (await read('appearance'));
      await removeLocal(appearance.background_image);
      await write('appearance', { ...appearance, background_image: null });
      return this.get();
    },
  };
}
