import { NotFoundError, ValidationError } from '../../../utils/errors.js';
import { MAIN_CATEGORIES } from '../../../validators/common.js';
import { renderMarkdown } from '../markdown.js';
import { createMediaMapper } from '../mediaLinks.js';
import { sanitizeFileName } from '../vaultFs.js';
import { CUSTOM_FORMATS, CUSTOM_PREFIX, FIELD_CATALOG, FORMATS, SYSTEM_KEY, describeField } from './catalog.js';
import { renderWithTemplate } from './codec.js';
import { DEFAULT_TEMPLATES } from './defaults.js';

const KEY_PATTERN = /^[^\n:#][^\n:]{0,63}$/u;
const CUSTOM_SLUG = /^[a-z0-9_]{1,40}$/;

const clone = (value) => JSON.parse(JSON.stringify(value));

/** Kiểm tra template trước khi lưu; trả về danh sách lỗi theo từng property để frontend hiện đúng dòng. */
export function validateTemplate(category, template) {
  const issues = [];
  const keys = new Map();
  const fields = new Map();
  template.properties.forEach((prop, index) => {
    const at = (field, message) => issues.push({ path: ['properties', index, field], message });
    const key = prop.key.trim();
    if (!KEY_PATTERN.test(key)) at('key', 'Tên property không được trống, không chứa ":", "#" ở đầu hoặc xuống dòng, tối đa 64 ký tự');
    if (key.toLowerCase() === SYSTEM_KEY) at('key', `"${SYSTEM_KEY}" là property hệ thống, app tự thêm`);
    if (keys.has(key.toLowerCase())) at('key', `Trùng tên với property thứ ${keys.get(key.toLowerCase()) + 1}`);
    keys.set(key.toLowerCase(), index);

    if (prop.field.startsWith(CUSTOM_PREFIX)) {
      if (!CUSTOM_SLUG.test(prop.field.slice(CUSTOM_PREFIX.length))) at('field', 'Tên trường riêng chỉ gồm a-z, 0-9, _');
      if (!CUSTOM_FORMATS.includes(prop.format)) at('format', `Trường riêng chỉ dùng: ${CUSTOM_FORMATS.join(', ')}`);
    } else {
      const def = describeField(prop.field, prop.format);
      if (!def) at('field', `Trường "${prop.field}" không tồn tại`);
      else if (!def.formats.includes(prop.format)) at('format', `"${def.label}" chỉ dùng được: ${def.formats.join(', ')}`);
    }
    if (fields.has(prop.field)) at('field', `Trường này đã được dùng ở property "${template.properties[fields.get(prop.field)].key}"`);
    fields.set(prop.field, index);
    if (['reads', 'checkbox', 'date'].includes(prop.format) && prop.link) at('link', 'Định dạng này không bọc [[...]] được');
  });

  if (!fields.has('main_category')) {
    issues.push({ path: ['properties'], message: 'Template phải có một property nối với "Thể loại chính" để app nhận diện file' });
  }
  if (!MAIN_CATEGORIES.includes(category)) issues.push({ path: ['category'], message: 'Thể loại không tồn tại' });
  return issues;
}

export function createTemplateService({ models }) {
  const { templates, items, libraryCards, readingNotes } = models;

  async function get(category) {
    if (!MAIN_CATEGORIES.includes(category)) throw new NotFoundError('Template', category);
    const stored = await templates.find(category);
    if (stored) return { category, properties: stored.properties, body_template: stored.body_template, is_default: false, updated_at: stored.updated_at };
    return { category, ...clone(DEFAULT_TEMPLATES[category]), is_default: true, updated_at: null };
  }

  function normalize(template) {
    return {
      properties: template.properties.map((prop) => ({
        key: prop.key.trim(),
        field: prop.field,
        format: prop.format,
        link: Boolean(prop.link),
        list: Boolean(prop.list),
      })),
      body_template: template.body_template ?? '',
    };
  }

  function sampleItem(category) {
    return {
      item: {
        sync_uid: '00000000-0000-4000-8000-000000000000',
        title: 'Sách mẫu',
        creator_author: 'Tác giả A, Tác giả B',
        main_category: category,
        media_type: 'Book',
        status: 'Finished',
        rating: 4.5,
        is_favorite: true,
        format: 'Ebook',
        language: 'Tiếng Việt',
        release_year: 2020,
        total_units: 320,
        word_count: 95000,
        volume_count: 12,
        review_date: '2025-09-15',
        tags: ['Fantasy', 'Romance'],
        fandoms: ['Fandom X'],
        pairings: ['A x B'],
        custom_fields: {},
        obsidian_extra: {},
      },
      cards: [
        { read_number: 1, start_date: '2024-02-01', finish_date: '2024-02-20', rating: 4 },
        { read_number: 2, start_date: '2025-09-08', finish_date: '2025-09-14', rating: 5 },
      ],
      note: null,
    };
  }

  return {
    catalog() {
      return {
        formats: FORMATS,
        fields: FIELD_CATALOG.map(({ field, label, formats, readOnly = false }) => ({ field, label, formats, read_only: readOnly })),
        custom_formats: CUSTOM_FORMATS,
        system_key: SYSTEM_KEY,
      };
    },

    get,

    /** Map category -> template đang dùng (đã lưu hoặc mặc định). */
    async all() {
      const entries = [];
      for (const category of MAIN_CATEGORIES) entries.push([category, await get(category)]);
      return Object.fromEntries(entries);
    },

    async save(category, input) {
      const template = normalize(input);
      const issues = validateTemplate(category, template);
      if (issues.length) throw new ValidationError('Template không hợp lệ', issues);
      await templates.save(category, template);
      return get(category);
    },

    async reset(category) {
      if (!MAIN_CATEGORIES.includes(category)) throw new NotFoundError('Template', category);
      await templates.delete(category);
      return get(category);
    },

    /** Xem trước file .md theo template (có thể là template chưa lưu) với một sách thật hoặc sách mẫu. */
    async preview(category, { template: draft, item_id: itemId } = {}) {
      const template = draft ? normalize(draft) : await get(category);
      if (draft) {
        const issues = validateTemplate(category, template);
        if (issues.length) throw new ValidationError('Template không hợp lệ', issues);
      }
      let source = sampleItem(category);
      if (itemId) {
        const item = await items.findByIdInternal(itemId);
        if (!item) throw new NotFoundError('Item', itemId);
        source = { item, cards: await libraryCards.listByItem(itemId), note: await readingNotes.findByItem(itemId) };
      }
      // Ảnh tải lên hiện đúng đường dẫn sẽ được ghi vào vault khi sync.
      const subfolder = (await models.syncConfig.get()).vault_subfolder ?? '';
      const media = createMediaMapper({
        vaultPrefix: subfolder.replace(/\\/g, '/').replace(/^\/+|\/+$/g, ''),
        mediaDir: source.item.obsidian_media_dir ?? sanitizeFileName(source.item.title),
      });
      const { data, body } = renderWithTemplate({ ...source, template, media });
      return renderMarkdown(data, body);
    },
  };
}
