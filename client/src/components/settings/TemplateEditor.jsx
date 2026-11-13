import { useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, GripVertical, Lock, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSaveTemplate, useTemplates } from '../../hooks/queries.js';
import { api, ApiError, categoryPath } from '../../lib/api.js';
import { CATEGORIES, CATEGORY_LABELS } from '../../lib/labels.js';
import { cn } from '../../lib/utils.js';
import { Button } from '../ui/Button.jsx';
import { Dialog } from '../ui/Dialog.jsx';
import { ErrorNote } from '../ui/ErrorNote.jsx';
import { Input, Select, Textarea } from '../ui/Input.jsx';
import { Segmented } from '../ui/Segmented.jsx';
import { Spinner } from '../ui/Spinner.jsx';
import { useToast } from '../ui/Toast.jsx';

const CUSTOM = 'custom:';
const NEW_CUSTOM = '__custom__';
const DERIVED = new Set(['read_years', 'latest_start_date', 'latest_finish_date', 'reads', 'read_count', 'reread_count', 'last_read_date', 'progress_percent']);

const slugify = (text) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'truong_rieng';

const clone = (value) => JSON.parse(JSON.stringify(value));
let rowSeq = 0;
// _id chỉ dùng trong giao diện để giữ focus khi sửa một dòng; bỏ đi trước khi gửi lên server.
const withIds = (properties) => clone(properties).map((prop) => ({ ...prop, _id: `row-${(rowSeq += 1)}` }));
const toTemplate = (draft) => ({ properties: draft.properties.map(({ _id, ...prop }) => prop), body_template: draft.body_template });

function PropertyRow({ prop, index, total, catalog, formats, error, onChange, onMove, onRemove, dragHandlers }) {
  const isCustom = prop.field.startsWith(CUSTOM);
  const def = isCustom ? null : catalog.fields.find((field) => field.field === prop.field);
  const allowedFormats = isCustom ? catalog.custom_formats : def?.formats ?? [];
  const canLink = !['reads', 'checkbox', 'date'].includes(prop.format);
  const appFields = catalog.fields.filter((field) => !DERIVED.has(field.field));
  const derivedFields = catalog.fields.filter((field) => DERIVED.has(field.field));

  const changeField = (value) => {
    if (value === NEW_CUSTOM) {
      onChange({ ...prop, field: `${CUSTOM}${slugify(prop.key)}`, format: 'text', link: prop.link && true });
      return;
    }
    const nextDef = catalog.fields.find((field) => field.field === value);
    const format = nextDef.formats.includes(prop.format) ? prop.format : nextDef.formats[0];
    onChange({ ...prop, field: value, format, link: ['reads', 'checkbox', 'date'].includes(format) ? false : prop.link });
  };

  return (
    <li
      className={cn('rounded-xl border bg-surface p-3', error ? 'border-danger' : 'border-line')}
      draggable
      {...dragHandlers}
    >
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex items-center gap-0.5 self-center text-ink-muted">
          <span className="cursor-grab p-1" aria-hidden title="Kéo để đổi thứ tự">
            <GripVertical size={16} />
          </span>
          <Button variant="ghost" size="icon-sm" onClick={() => onMove(-1)} disabled={index === 0} aria-label={`Đưa ${prop.key || 'property'} lên`}>
            <ArrowUp size={15} />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => onMove(1)} disabled={index === total - 1} aria-label={`Đưa ${prop.key || 'property'} xuống`}>
            <ArrowDown size={15} />
          </Button>
        </div>
        <label className="flex min-w-40 flex-1 flex-col gap-1 text-xs text-ink-muted">
          Tên trong Obsidian
          <Input value={prop.key} onChange={(event) => onChange({ ...prop, key: event.target.value })} className="h-9" aria-invalid={error?.key ? true : undefined} />
        </label>
        <label className="flex min-w-52 flex-1 flex-col gap-1 text-xs text-ink-muted">
          Lấy dữ liệu từ
          <Select value={isCustom ? NEW_CUSTOM : prop.field} onChange={(event) => changeField(event.target.value)} className="h-9" aria-invalid={error?.field ? true : undefined}>
            <optgroup label="Thông tin sách">
              {appFields.map((field) => (
                <option key={field.field} value={field.field}>
                  {field.label}
                </option>
              ))}
            </optgroup>
            <optgroup label="Tính từ các lượt đọc (chỉ ghi ra)">
              {derivedFields.map((field) => (
                <option key={field.field} value={field.field}>
                  {field.label}
                </option>
              ))}
            </optgroup>
            <optgroup label="Khác">
              <option value={NEW_CUSTOM}>Trường riêng (tự đặt)</option>
            </optgroup>
          </Select>
        </label>
        {isCustom && (
          <label className="flex w-40 flex-col gap-1 text-xs text-ink-muted">
            Mã trường riêng
            <Input
              value={prop.field.slice(CUSTOM.length)}
              onChange={(event) => onChange({ ...prop, field: `${CUSTOM}${event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_')}` })}
              className="h-9 font-mono"
              aria-invalid={error?.field ? true : undefined}
            />
          </label>
        )}
        <label className="flex w-36 flex-col gap-1 text-xs text-ink-muted">
          Định dạng
          <Select
            value={prop.format}
            onChange={(event) => onChange({ ...prop, format: event.target.value, link: ['reads', 'checkbox', 'date'].includes(event.target.value) ? false : prop.link })}
            className="h-9"
            aria-invalid={error?.format ? true : undefined}
          >
            {allowedFormats.map((format) => (
              <option key={format} value={format}>
                {formats.find((entry) => entry.id === format)?.label ?? format}
              </option>
            ))}
          </Select>
        </label>
        <div className="flex items-center gap-3 pb-2 text-sm">
          <label className={cn('flex items-center gap-1.5', !canLink && 'opacity-40')}>
            <input type="checkbox" checked={prop.link} disabled={!canLink} onChange={(event) => onChange({ ...prop, link: event.target.checked })} className="accent-[var(--moss)]" />
            [[link]]
          </label>
          <label className={cn('flex items-center gap-1.5', prop.format === 'reads' && 'opacity-40')}>
            <input type="checkbox" checked={prop.list} disabled={prop.format === 'reads'} onChange={(event) => onChange({ ...prop, list: event.target.checked })} className="accent-[var(--moss)]" />
            Danh sách
          </label>
        </div>
        <Button variant="ghost" size="icon-sm" className="mb-0.5 text-danger" onClick={onRemove} aria-label={`Xoá property ${prop.key}`}>
          <Trash2 size={15} />
        </Button>
      </div>
      {error && <p className="mt-2 text-xs text-danger">{Object.values(error).join('; ')}</p>}
    </li>
  );
}

export function TemplateEditor() {
  const templates = useTemplates();
  const save = useSaveTemplate();
  const client = useQueryClient();
  const toast = useToast();
  const [category, setCategory] = useState('Fiction');
  const [draft, setDraft] = useState(null);
  const [preview, setPreview] = useState('');
  const [previewError, setPreviewError] = useState(null);
  const [rowErrors, setRowErrors] = useState({});
  const [confirmReset, setConfirmReset] = useState(false);
  const [pendingCategory, setPendingCategory] = useState(null);
  const dragIndex = useRef(null);

  const stored = templates.data?.templates?.[category];
  const catalog = templates.data?.catalog;
  useEffect(() => {
    if (stored) setDraft({ properties: withIds(stored.properties), body_template: stored.body_template });
    setRowErrors({});
  }, [stored]);

  const dirty = useMemo(
    () => Boolean(draft && stored && JSON.stringify(toTemplate(draft)) !== JSON.stringify({ properties: stored.properties, body_template: stored.body_template })),
    [draft, stored],
  );

  // Xem trước file .md theo bản nháp (chưa lưu), cập nhật sau mỗi lần dừng gõ.
  useEffect(() => {
    if (!draft) return undefined;
    const timer = setTimeout(async () => {
      try {
        const markdown = await api.post(`/templates/${categoryPath(category)}/preview`, { template: toTemplate(draft) });
        setPreview(markdown);
        setPreviewError(null);
        setRowErrors({});
      } catch (error) {
        setPreviewError(error);
        if (error instanceof ApiError) {
          const byRow = {};
          for (const detail of error.details) {
            if (detail.path?.[0] === 'properties' && typeof detail.path[1] === 'number') {
              byRow[detail.path[1]] = { ...(byRow[detail.path[1]] ?? {}), [detail.path[2] ?? 'row']: detail.message };
            }
          }
          setRowErrors(byRow);
        }
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [draft, category]);

  if (!draft || !catalog) return <Spinner />;

  const updateProp = (index, next) => setDraft((current) => ({ ...current, properties: current.properties.map((prop, i) => (i === index ? next : prop)) }));
  const moveProp = (from, to) =>
    setDraft((current) => {
      if (to < 0 || to >= current.properties.length) return current;
      const properties = [...current.properties];
      const [moved] = properties.splice(from, 1);
      properties.splice(to, 0, moved);
      return { ...current, properties };
    });
  const removeProp = (index) => setDraft((current) => ({ ...current, properties: current.properties.filter((_, i) => i !== index) }));
  const addProp = () =>
    setDraft((current) => {
      const base = 'Property mới';
      let key = base;
      for (let n = 2; current.properties.some((prop) => prop.key.toLowerCase() === key.toLowerCase()); n += 1) key = `${base} ${n}`;
      const used = new Set(current.properties.map((prop) => prop.field));
      let field = `${CUSTOM}${slugify(key)}`;
      for (let n = 2; used.has(field); n += 1) field = `${CUSTOM}${slugify(key)}_${n}`;
      return { ...current, properties: [...current.properties, { key, field, format: 'text', link: false, list: false, _id: `row-${(rowSeq += 1)}` }] };
    });

  async function saveDraft() {
    try {
      await save.mutateAsync({ category, template: toTemplate(draft) });
      toast(`Đã lưu template ${CATEGORY_LABELS[category]}. Lần sync tới sẽ ghi lại các file thuộc thể loại này.`);
    } catch (error) {
      setPreviewError(error);
    }
  }

  async function resetTemplate() {
    try {
      await api.post(`/templates/${categoryPath(category)}/reset`);
      await client.invalidateQueries({ queryKey: ['templates'] });
      toast(`Đã khôi phục template ${CATEGORY_LABELS[category]} mặc định`);
    } catch (error) {
      setPreviewError(error);
    } finally {
      setConfirmReset(false);
    }
  }

  const switchCategory = (next) => {
    if (next === category) return;
    if (dirty) setPendingCategory(next);
    else setCategory(next);
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented label="Template của thể loại" value={category} onChange={switchCategory} options={CATEGORIES.map((value) => ({ value, label: CATEGORY_LABELS[value] }))} />
        <span className="text-sm text-ink-muted">{stored.is_default ? 'Đang dùng template mặc định' : 'Đã chỉnh sửa'}</span>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button onClick={() => setConfirmReset(true)} disabled={stored.is_default}>
            <RotateCcw size={15} /> Khôi phục mặc định
          </Button>
          <Button onClick={() => setDraft({ properties: withIds(stored.properties), body_template: stored.body_template })} disabled={!dirty}>
            Bỏ thay đổi
          </Button>
          <Button variant="primary" onClick={saveDraft} disabled={!dirty || save.isPending || Boolean(Object.keys(rowErrors).length)}>
            {save.isPending && <Spinner />} Lưu template
          </Button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <div>
            <h3 className="font-display text-xl">Property trong frontmatter</h3>
            <p className="mt-1 text-sm text-ink-muted">Thứ tự ở đây là thứ tự trong file. Xoá một property chỉ bỏ nó khỏi file, dữ liệu trong app vẫn giữ nguyên.</p>
          </div>
          <ul className="flex flex-col gap-2">
            <li className="flex items-center gap-3 rounded-xl border border-dashed border-line px-4 py-3 text-sm text-ink-muted">
              <Lock size={15} aria-hidden />
              <span>
                <span className="font-mono text-ink">rt_id</span> luôn đứng đầu file. App dùng nó để nhận ra file kể cả khi bạn đổi tên, nên không sửa hay xoá được.
              </span>
            </li>
            {draft.properties.map((prop, index) => (
              <PropertyRow
                key={prop._id}
                prop={prop}
                index={index}
                total={draft.properties.length}
                catalog={catalog}
                formats={catalog.formats}
                error={rowErrors[index]}
                onChange={(next) => updateProp(index, next)}
                onMove={(direction) => moveProp(index, index + direction)}
                onRemove={() => removeProp(index)}
                dragHandlers={{
                  onDragStart: () => {
                    dragIndex.current = index;
                  },
                  onDragOver: (event) => event.preventDefault(),
                  onDrop: () => {
                    if (dragIndex.current !== null) moveProp(dragIndex.current, index);
                    dragIndex.current = null;
                  },
                }}
              />
            ))}
          </ul>
          <Button onClick={addProp} className="self-start">
            <Plus size={16} /> Thêm property
          </Button>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="body-template" className="font-display text-xl">
              Phần thân mẫu
            </label>
            <p className="text-sm text-ink-muted">Dùng cho sách chưa có ghi chú. Khi bạn viết note trong app, note đó sẽ thay cho phần này.</p>
            <Textarea id="body-template" value={draft.body_template} onChange={(event) => setDraft({ ...draft, body_template: event.target.value })} className="min-h-64 font-mono text-[13px]" />
          </div>
        </div>
        <div className="flex flex-col gap-2 xl:sticky xl:top-4 xl:self-start">
          <h3 className="font-display text-xl">Xem trước file .md</h3>
          <p className="text-sm text-ink-muted">Dựng từ một cuốn sách mẫu có hai lượt đọc.</p>
          {previewError && <ErrorNote error={previewError} />}
          <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap break-words rounded-xl border border-line bg-surface-2 p-4 font-mono text-[12.5px] leading-relaxed text-ink">{preview}</pre>
        </div>
      </div>

      <Dialog
        open={Boolean(pendingCategory)}
        onOpenChange={(open) => !open && setPendingCategory(null)}
        size="sm"
        title="Bỏ thay đổi chưa lưu?"
        description={`Template ${CATEGORY_LABELS[category]} có thay đổi chưa lưu. Chuyển sang ${CATEGORY_LABELS[pendingCategory] ?? ''} sẽ bỏ các thay đổi đó.`}
        footer={
          <>
            <Button onClick={() => setPendingCategory(null)}>Ở lại để lưu</Button>
            <Button
              variant="danger"
              onClick={() => {
                setCategory(pendingCategory);
                setPendingCategory(null);
              }}
            >
              Bỏ thay đổi và chuyển
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-muted">Bấm Lưu template trước nếu muốn giữ lại.</p>
      </Dialog>

      <Dialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        size="sm"
        title="Khôi phục template mặc định?"
        description={`Template ${CATEGORY_LABELS[category]} trở về như ban đầu (dựng từ note mẫu). Các property bạn đã thêm sẽ biến khỏi file ở lần sync tới; dữ liệu trong app vẫn còn.`}
        footer={
          <>
            <Button onClick={() => setConfirmReset(false)}>Giữ template hiện tại</Button>
            <Button variant="danger" onClick={resetTemplate}>
              Khôi phục mặc định
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-muted">Có thể chỉnh lại bất cứ lúc nào.</p>
      </Dialog>
    </div>
  );
}
