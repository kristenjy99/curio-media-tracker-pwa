import { AlertTriangle, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchTitleMatches, pairingOptions, useFacets, useFandomPairings, useInvalidateLibrary, useItem, usePairings, useSettings, useTags, useTemplates } from '../../hooks/queries.js';
import { api, ApiError } from '../../lib/api.js';
import { isLocalImage, uploadImage } from '../../lib/images.js';
import {
  CATEGORIES,
  CATEGORY_LABELS,
  DEFAULT_MEDIA,
  DEFAULT_UNIT,
  MEDIA_LABELS,
  MEDIA_TYPES_BY_CATEGORY,
  STATUSES,
  STATUS_LABELS,
  UNIT_LABELS,
} from '../../lib/labels.js';
import { formatDate } from '../../lib/utils.js';
import { Button } from '../ui/Button.jsx';
import { ChipsInput } from '../ui/ChipsInput.jsx';
import { ComboInput } from '../ui/ComboInput.jsx';
import { Dialog } from '../ui/Dialog.jsx';
import { ErrorNote } from '../ui/ErrorNote.jsx';
import { Field } from '../ui/Field.jsx';
import { ImagePicker } from './ImagePicker.jsx';
import { Input, Select } from '../ui/Input.jsx';
import { Segmented } from '../ui/Segmented.jsx';
import { Spinner } from '../ui/Spinner.jsx';
import { StarInput } from '../ui/StarRating.jsx';
import { ChiliInput, isSmut } from '../ui/ChiliRating.jsx';
import { Switch } from '../ui/Switch.jsx';
import { useToast } from '../ui/Toast.jsx';

const LIST_FIELDS = ['tags', 'fandoms', 'pairings', 'tropes', 'topics', 'warnings'];

const TONE_MARKS = /[\u0300\u0301\u0303\u0309\u0323]/g;

/** Cùng quy tắc với titleKey ở server (itemService.js): bỏ hoa thường, dấu câu, ký hiệu, khoảng trắng thừa, vị trí dấu thanh (hoà = hòa). */
function titleKey(value) {
  return String(value ?? '')
    .normalize('NFD')
    .toLocaleLowerCase('vi')
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((word) => word.replace(TONE_MARKS, '') + (word.match(TONE_MARKS) ?? []).sort().join(''))
    .join(' ')
    .normalize('NFC');
}

/** Tác giả · thể loại · trạng thái; mỗi phần là một node chữ riêng để bộ dịch giao diện dịch được thể loại và trạng thái. */
function BookMeta({ book }) {
  return (
    <>
      {book.creator_author ? <span translate="no">{book.creator_author}</span> : <span>Chưa có tác giả</span>}
      <span> · </span>
      <span>{CATEGORY_LABELS[book.main_category] ?? book.main_category}</span>
      <span> · </span>
      <span>{STATUS_LABELS[book.status] ?? book.status}</span>
    </>
  );
}

/** Hỏi lại khi tên sách trùng với sách đã có: "Không" thì dừng, "Có, nhập tiếp" thì nhập bình thường. */
function DuplicateTitleDialog({ matches, isEdit, onContinue, onStop, onDismiss }) {
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onDismiss()}
      size="sm"
      title="Tên sách bị trùng"
      description={`Thư viện đã có ${matches.length} sách cùng tên:`}
      footer={
        <>
          <Button onClick={onStop}>{isEdit ? 'Không, giữ tên cũ' : 'Không, huỷ thêm sách'}</Button>
          <Button variant="primary" onClick={onContinue} autoFocus>
            Có, nhập tiếp
          </Button>
        </>
      }
    >
      <ul className="flex flex-col gap-2">
        {matches.map((book) => (
          <li key={book.id} className="rounded-lg border border-danger/40 bg-danger/5 px-3 py-2 text-sm">
            <p className="font-medium" translate="no">{book.title}</p>
            <p className="text-xs text-ink-muted">
              <BookMeta book={book} />
            </p>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-sm">Bạn có muốn nhập tiếp không?</p>
    </Dialog>
  );
}
function uniqueCaseless(values) {
  const seen = new Set();
  return values.filter((value) => {
    const key = value.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const WARNING_SUGGESTIONS = ['Major character death', 'Violence', 'Sexual content', 'Non-con / dub-con', 'Self-harm', 'Abuse', 'Cliffhanger', 'Unhappy ending'];
const NUMBER_FIELDS = ['total_units', 'current_unit', 'word_count', 'volume_count', 'release_year'];

function emptyForm(category = 'Fiction') {
  return {
    title: '',
    creator_author: '',
    main_category: category,
    media_type: DEFAULT_MEDIA[category],
    status: 'TBR',
    rating: null,
    spice_rating: null,
    is_favorite: false,
    cover_image: '',
    spine_image: '',
    review_date: '',
    format: '',
    language: '',
    release_year: '',
    unit_type: DEFAULT_UNIT[category],
    total_units: '',
    current_unit: '',
    word_count: '',
    volume_count: '',
    tags: [],
    fandoms: [],
    pairings: [],
    tropes: [],
    topics: [],
    warnings: [],
    custom_fields: {},
    first_start: '',
    first_finish: '',
  };
}

function fromItem(item) {
  const form = emptyForm(item.main_category);
  for (const key of Object.keys(form)) {
    if (key in item && item[key] !== null && item[key] !== undefined) form[key] = NUMBER_FIELDS.includes(key) ? String(item[key]) : item[key];
  }
  form.custom_fields = { ...(item.custom_fields ?? {}) };
  return form;
}

function toPayload(form, images) {
  const payload = {
    title: form.title.trim(),
    creator_author: form.creator_author.trim() || null,
    main_category: form.main_category,
    media_type: form.media_type,
    status: form.status,
    rating: form.rating,
    // Bỏ tag smut thì không gửi độ spicy (giữ nguyên giá trị cũ trong DB, thêm lại tag là hiện lại).
    ...(isSmut(form.tags) ? { spice_rating: form.spice_rating } : {}),
    is_favorite: form.is_favorite,
    format: form.format.trim() || null,
    language: form.language.trim() || null,
    review_date: form.review_date || null,
    unit_type: form.unit_type,
    custom_fields: form.custom_fields,
  };
  for (const key of NUMBER_FIELDS) payload[key] = form[key] === '' ? null : Number(form[key]);
  payload.current_unit = payload.current_unit ?? 0;
  for (const key of LIST_FIELDS) payload[key] = form[key];
  // Ảnh tải từ máy đi qua API ảnh riêng; chỉ gửi cover_image khi đó là link ngoài (hoặc vừa xoá link).
  if (!images.cover.file && !isLocalImage(form.cover_image)) payload.cover_image = form.cover_image.trim() || null;
  return payload;
}

/** Trường riêng lấy từ template Obsidian của thể loại đang chọn (property có field "custom:..."). */
function useCustomFieldDefs(category) {
  const templates = useTemplates();
  return useMemo(() => {
    const props = templates.data?.templates?.[category]?.properties ?? [];
    return props
      // Series có ô nhập riêng cho mọi thể loại sách, không lặp lại trong phần trường riêng.
      .filter((prop) => prop.field.startsWith('custom:') && prop.field !== 'custom:series')
      .map((prop) => ({ slug: prop.field.slice(7), label: prop.key, format: prop.format, list: prop.list }));
  }, [templates.data, category]);
}

function CustomFieldInput({ def, value, onChange, error, suggestions = [] }) {
  return (
    <Field label={def.label} error={error}>
      {(props) => {
        if (def.format === 'checkbox') return <Switch {...props} checked={Boolean(value)} onCheckedChange={onChange} />;
        if (def.format === 'date') return <Input {...props} type="date" value={value ?? ''} onChange={(event) => onChange(event.target.value || null)} />;
        if (def.format === 'number')
          return <Input {...props} type="number" value={value ?? ''} onChange={(event) => onChange(event.target.value === '' ? null : Number(event.target.value))} />;
        if (def.list) {
          const list = Array.isArray(value) ? value : value ? [String(value)] : [];
          return <ChipsInput {...props} value={list} onChange={onChange} suggestions={suggestions} placeholder="Gõ rồi nhấn Enter" />;
        }
        // Trường chữ (ví dụ FIN?, Series): chọn từ các giá trị đã nhập ở sách khác hoặc gõ giá trị mới.
        return (
          <ComboInput
            {...props}
            value={Array.isArray(value) ? value.join(', ') : value ?? ''}
            onChange={(next) => onChange(next || null)}
            suggestions={suggestions}
            placeholder={suggestions.length ? 'Chọn hoặc gõ mới' : undefined}
          />
        );
      }}
    </Field>
  );
}

function DeleteConfirm({ item, onCancel, onConfirm, busy }) {
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onCancel()}
      size="sm"
      title="Xoá cuốn này?"
      description={`"${item.title}" cùng lượt đọc, ghi chú và log đọc sẽ bị xoá khỏi app. Nếu đã sync sang Obsidian, lần sync sau file sẽ được chuyển vào thư mục .trash của vault.`}
      footer={
        <>
          <Button onClick={onCancel}>Giữ lại</Button>
          <Button variant="danger" onClick={onConfirm} disabled={busy}>
            {busy ? <Spinner /> : <Trash2 size={16} />} Xoá sách
          </Button>
        </>
      }
    >
      <p className="text-sm text-ink-muted">Không hoàn tác được trong app.</p>
    </Dialog>
  );
}

export function BookFormDialog({ mode, id, category, onClose, onDeleted }) {
  const isEdit = mode === 'edit';
  const existing = useItem(isEdit ? id : null);
  const facets = useFacets();
  const invalidate = useInvalidateLibrary();
  const toast = useToast();
  const [form, setForm] = useState(() => emptyForm(category ?? 'Fiction'));
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [images, setImages] = useState({ cover: { file: null, removed: false }, spine: { file: null, removed: false } });
  const pickImage = (kind) => (file) => setImages((current) => ({ ...current, [kind]: { file, removed: false } }));
  const clearImage = (kind) => () => {
    setImages((current) => ({ ...current, [kind]: { file: null, removed: true } }));
    setForm((current) => ({ ...current, [kind === 'cover' ? 'cover_image' : 'spine_image']: '' }));
  };
  const customDefs = useCustomFieldDefs(form.main_category);
  const allPairings = usePairings([]);
  const fandomPairings = useFandomPairings();
  const categoryTags = useTags(form.main_category);
  const settings = useSettings();
  const languages = settings.data?.languages ?? [];

  // Cảnh báo trùng tên: kiểm tra sau khi ngừng gõ, hỏi lại khi rời ô tên sang ô khác hoặc khi bấm lưu.
  // Sửa sách mà không đổi tên thì không kiểm. Tên đã bấm "Có, nhập tiếp" thì không hỏi lại.
  const formRef = useRef(null);
  const titleCache = useRef(new Map());
  const ackKey = useRef(null);
  const [duplicates, setDuplicates] = useState({ key: '', matches: [] });
  const [dupPrompt, setDupPrompt] = useState(null);
  const currentKey = titleKey(form.title);
  const unchangedTitle = isEdit && existing.data && currentKey === titleKey(existing.data.title);

  async function checkTitle(title) {
    const key = titleKey(title);
    if (!key || (isEdit && existing.data && key === titleKey(existing.data.title))) return { key, matches: [] };
    if (!titleCache.current.has(key)) titleCache.current.set(key, await fetchTitleMatches(title.trim(), isEdit ? id : undefined));
    return { key, matches: titleCache.current.get(key) };
  }

  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      checkTitle(form.title)
        .then((result) => active && setDuplicates(result))
        .catch((error) => active && setDuplicates({ key: titleKey(form.title), matches: [], error }));
    }, 400);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [form.title, existing.data]); // eslint-disable-line react-hooks/exhaustive-deps

  async function onTitleBlur(event) {
    // Chỉ hỏi khi chuyển sang ô khác trong form; bấm Huỷ/đóng hộp thoại thì không hỏi.
    if (!formRef.current?.contains(event.relatedTarget)) return;
    try {
      const result = await checkTitle(event.target.value);
      if (result.matches.length && ackKey.current !== result.key) setDupPrompt({ ...result, fromSubmit: false });
    } catch {
      // Lỗi đã hiện dưới ô tên (effect kiểm tra ở trên); lúc lưu sẽ kiểm lại.
    }
  }

  function continueDuplicate() {
    ackKey.current = dupPrompt.key;
    const resubmit = dupPrompt.fromSubmit;
    setDupPrompt(null);
    if (resubmit) setTimeout(() => formRef.current?.requestSubmit(), 0);
  }

  function stopDuplicate() {
    setDupPrompt(null);
    if (isEdit) setForm((current) => ({ ...current, title: existing.data?.title ?? current.title }));
    else onClose();
  }

  useEffect(() => {
    if (existing.data) setForm(fromItem(existing.data));
  }, [existing.data]);

  const set = (key) => (value) => setForm((current) => ({ ...current, [key]: value }));
  const setInput = (key) => (event) => set(key)(event.target.value);
  const setCustom = (slug) => (value) => setForm((current) => ({ ...current, custom_fields: { ...current.custom_fields, [slug]: value } }));

  const changeCategory = (next) =>
    setForm((current) => ({
      ...current,
      main_category: next,
      media_type: MEDIA_TYPES_BY_CATEGORY[next].includes(current.media_type) ? current.media_type : DEFAULT_MEDIA[next],
      unit_type: current.total_units === '' ? DEFAULT_UNIT[next] : current.unit_type,
    }));

  async function submit(event) {
    event.preventDefault();
    setErrors({});
    setFormError(null);
    if (!form.title.trim()) {
      setErrors({ title: 'Cần tên sách' });
      return;
    }
    if (form.first_start && form.first_finish && form.first_finish < form.first_start) {
      setErrors({ first_finish: 'Ngày đọc xong phải sau ngày bắt đầu' });
      return;
    }
    setSaving(true);
    try {
      let duplicate;
      try {
        duplicate = await checkTitle(form.title);
      } catch (error) {
        // Không kiểm được thì không lưu im lặng: báo lỗi, bấm lưu lần nữa mới lưu.
        const key = titleKey(form.title);
        if (ackKey.current !== key) {
          ackKey.current = key;
          setDuplicates({ key, matches: [], error });
          setFormError(new Error(`Không kiểm tra được tên sách có bị trùng hay không (${error.message}). Bấm lưu lần nữa nếu vẫn muốn lưu.`));
          return;
        }
        duplicate = { key, matches: [] };
      }
      if (duplicate.matches.length && ackKey.current !== duplicate.key) {
        setDupPrompt({ ...duplicate, fromSubmit: true });
        return;
      }
      const payload = toPayload(form, images);
      let itemId = id;
      if (isEdit) {
        const original = existing.data;
        for (const kind of ['cover', 'spine']) {
          const field = kind === 'cover' ? 'cover_image' : 'spine_image';
          if (images[kind].removed && !images[kind].file && isLocalImage(original[field])) await api.delete(`/items/${id}/images/${kind}`);
        }
        await api.patch(`/items/${id}`, payload);
        toast(`Đã lưu "${payload.title}"`);
      } else {
        const created = await api.post('/items', payload);
        itemId = created.id;
        if (form.first_start || form.first_finish) {
          await api.post(`/items/${created.id}/library-cards`, {
            start_date: form.first_start || null,
            finish_date: form.first_finish || null,
          });
          // Thêm lượt đọc tự đổi trạng thái (Đang đọc/Đã đọc); giữ lựa chọn của người dùng nếu khác.
          const after = await api.get(`/items/${created.id}`);
          if (after.status !== payload.status && form.status !== 'TBR') await api.patch(`/items/${created.id}`, { status: payload.status });
        }
        toast(`Đã thêm "${payload.title}" vào kệ`);
      }
      for (const kind of ['cover', 'spine']) {
        if (images[kind].file) await uploadImage(itemId, kind, images[kind].file);
      }
      invalidate();
      onClose();
    } catch (error) {
      if (error instanceof ApiError && error.details.length) setErrors(error.fieldErrors());
      setFormError(error);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setSaving(true);
    try {
      await api.delete(`/items/${id}`);
      toast(`Đã xoá "${form.title}"`);
      invalidate();
      onClose();
      onDeleted?.();
    } catch (error) {
      setFormError(error);
      setConfirmDelete(false);
    } finally {
      setSaving(false);
    }
  }

  const cat = form.main_category;
  // Gợi ý genre của thể loại đang chọn trước, sau đó tới genre của các thể loại khác.
  const tagSuggestions = [...(categoryTags.data?.data ?? []), ...(facets.data?.tags ?? [])].map((entry) => entry.tag);
  const formatSuggestions = (facets.data?.formats ?? []).filter((row) => row.category === cat).map((row) => row.value);
  // Fandom: kho fandom & cặp đôi (Cài đặt → Template) cộng fandom đã nhập. Pairing: đã chọn fandom thì chỉ còn pairing của các fandom đó.
  const pairingChoice = pairingOptions({
    fandoms: form.fandoms,
    library: settings.data?.fandom_library ?? [],
    bookMap: fandomPairings.data?.data ?? {},
    allPairings: (allPairings.data?.data ?? []).map((row) => row.value),
    allFandoms: (facets.data?.fandoms ?? []).map((row) => row.value),
  });
  const fandomSuggestions = pairingChoice.fandoms;
  const pairingSuggestions = pairingChoice.pairings;
  const customSuggestions = facets.data?.custom_values ?? {};
  const tropeSuggestions = (facets.data?.tropes ?? []).map((row) => row.value);
  // Giá trị đã nhập trước, sau đó mới tới các gợi ý có sẵn.
  const warningSuggestions = uniqueCaseless([...(facets.data?.warnings ?? []).map((row) => row.value), ...WARNING_SUGGESTIONS]);
  const seriesSuggestions = (customSuggestions.series ?? []).map((name) => name.replace(/^\[\[|\]\]$/g, '').trim()).filter(Boolean);
  const rawSeries = form.custom_fields.series;
  const seriesList = Array.isArray(rawSeries) ? rawSeries : rawSeries ? [rawSeries] : [];
  // Một series ghi dạng chuỗi, nhiều series ghi dạng danh sách (giữ tương thích với dữ liệu cũ).
  const setSeries = (list) => setCustom('series')(list.length === 0 ? null : list.length === 1 ? list[0] : list);
  const loading = isEdit && existing.isLoading;

  return (
    <>
      <Dialog
        open
        onOpenChange={(open) => !open && onClose()}
        size="lg"
        title={isEdit ? 'Sửa thông tin sách' : 'Thêm sách'}
        description={isEdit ? undefined : 'Chỉ cần tên sách và thể loại, các trường khác thêm sau cũng được.'}
        footer={
          <>
            {isEdit && (
              <Button variant="ghost" className="mr-auto text-danger" onClick={() => setConfirmDelete(true)} disabled={saving}>
                <Trash2 size={16} /> Xoá sách
              </Button>
            )}
            <Button onClick={onClose}>Huỷ</Button>
            <Button variant="primary" type="submit" form="book-form" disabled={saving || loading}>
              {saving && <Spinner />} {isEdit ? 'Lưu thay đổi' : 'Thêm vào kệ'}
            </Button>
          </>
        }
      >
        {loading ? (
          <div className="flex items-center gap-2 py-10 text-ink-muted">
            <Spinner /> Đang mở sách
          </div>
        ) : (
          <form id="book-form" ref={formRef} onSubmit={submit} className="grid gap-x-8 gap-y-5 lg:grid-cols-2" noValidate>
            {formError && !Object.keys(errors).length && <ErrorNote error={formError} className="lg:col-span-2" />}

            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Field label="Tên sách" required error={errors.title}>
                  {(props) => (
                    <Input
                      {...props}
                      value={form.title}
                      onChange={setInput('title')}
                      onBlur={onTitleBlur}
                      autoFocus
                      aria-invalid={props['aria-invalid'] || (!unchangedTitle && duplicates.key === currentKey && duplicates.matches.length > 0) || undefined}
                    />
                  )}
                </Field>
                {!unchangedTitle && duplicates.key === currentKey && duplicates.error && (
                  <p role="alert" className="flex gap-2 rounded-lg border border-honey/60 bg-honey/10 px-3 py-2 text-xs">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />
                    <span>
                      Không kiểm tra được tên sách có bị trùng hay không: {duplicates.error.message}. Nếu vừa cập nhật app, đóng mọi cửa sổ mo-app.bat rồi mở lại.
                    </span>
                  </p>
                )}
                {!unchangedTitle && duplicates.key === currentKey && duplicates.matches.length > 0 && (
                  <div role="alert" className="flex gap-2 rounded-lg border border-danger/40 bg-danger/5 px-3 py-2 text-xs text-danger">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />
                    <div className="min-w-0">
                      <p className="font-medium">Tên sách này đã có trong thư viện:</p>
                      <ul className="mt-1 flex flex-col gap-0.5">
                        {duplicates.matches.map((book) => (
                          <li key={book.id}>
                            <span translate="no">{book.title}</span>
                            <span className="text-ink-muted">
                              {' · '}
                              <BookMeta book={book} />
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </div>
              <Field label="Tác giả" hint="Nhiều tác giả thì cách nhau bằng dấu phẩy" error={errors.creator_author}>
                {(props) => <Input {...props} value={form.creator_author} onChange={setInput('creator_author')} />}
              </Field>
              <Field label="Thể loại chính">
                {() => (
                  <Segmented label="Thể loại chính" value={cat} onChange={changeCategory} options={CATEGORIES.map((value) => ({ value, label: CATEGORY_LABELS[value] }))} />
                )}
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Loại ấn phẩm">
                  {(props) => (
                    <Select {...props} value={form.media_type} onChange={setInput('media_type')}>
                      {MEDIA_TYPES_BY_CATEGORY[cat].map((value) => (
                        <option key={value} value={value}>
                          {MEDIA_LABELS[value]}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <Field label={cat === 'Fanfiction' ? 'Nền tảng' : 'Định dạng'} error={errors.format}>
                  {(props) => (
                    <ComboInput {...props} value={form.format} onChange={set('format')} suggestions={formatSuggestions} placeholder={cat === 'Fanfiction' ? 'AO3, Wattpad' : 'Ebook, Paperback'} />
                  )}
                </Field>
              </div>
              <Field label="Trạng thái">
                {() => <Segmented label="Trạng thái" value={form.status} onChange={set('status')} options={STATUSES.map((value) => ({ value, label: STATUS_LABELS[value] }))} />}
              </Field>
              <Field label="Đánh giá" error={errors.rating}>
                {(props) => <StarInput {...props} value={form.rating} onChange={set('rating')} />}
              </Field>
              {isSmut(form.tags) && (
                <Field label="Độ spicy" hint="Chỉ hiện ở sách có tag smut" error={errors.spice_rating}>
                  {(props) => <ChiliInput {...props} value={form.spice_rating} onChange={set('spice_rating')} />}
                </Field>
              )}
              <div className="flex flex-wrap items-end gap-6">
                <label className="flex h-10 items-center gap-3 text-sm font-medium">
                  <Switch checked={form.is_favorite} onCheckedChange={set('is_favorite')} aria-label="Yêu thích" />
                  Yêu thích
                </label>
                <Field label="Ngày review" error={errors.review_date}>
                  {(props) => <Input {...props} type="date" value={form.review_date} onChange={setInput('review_date')} className="w-44" />}
                </Field>
              </div>
              <div className="grid gap-4 rounded-xl border border-line p-4 sm:grid-cols-2">
                <ImagePicker
                  label="Ảnh bìa"
                  hint="Hiện khi rê chuột vào sách trên kệ"
                  value={form.cover_image || null}
                  pending={images.cover.file}
                  onPick={pickImage('cover')}
                  onClear={clearImage('cover')}
                />
                <ImagePicker
                  label="Ảnh gáy sách"
                  hint="Ảnh dọc, hẹp; thay cho gáy màu trên kệ"
                  shape="spine"
                  value={form.spine_image || null}
                  pending={images.spine.file}
                  onPick={pickImage('spine')}
                  onClear={clearImage('spine')}
                />
                {!images.cover.file && !isLocalImage(form.cover_image) && (
                  <Field label="Hoặc dán link ảnh bìa" error={errors.cover_image} className="sm:col-span-2">
                    {(props) => <Input {...props} value={form.cover_image} onChange={setInput('cover_image')} placeholder="https://... (ví dụ link ảnh bìa trên Goodreads)" />}
                  </Field>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Ngôn ngữ" hint="Sửa danh sách trong Cài đặt → Ngôn ngữ" error={errors.language}>
                  {(props) => (
                    <Select {...props} value={form.language} onChange={setInput('language')}>
                      <option value="">Chưa chọn</option>
                      {languages.map((language) => (
                        <option key={language} value={language}>
                          {language}
                        </option>
                      ))}
                      {form.language && !languages.includes(form.language) && <option value={form.language}>{form.language} (không có trong danh sách)</option>}
                    </Select>
                  )}
                </Field>
                <Field label="Năm phát hành" error={errors.release_year}>
                  {(props) => <Input {...props} type="number" inputMode="numeric" value={form.release_year} onChange={setInput('release_year')} />}
                </Field>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Đơn vị">
                  {(props) => (
                    <Select {...props} value={form.unit_type} onChange={setInput('unit_type')}>
                      {Object.entries(UNIT_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <Field label="Tổng" error={errors.total_units}>
                  {(props) => <Input {...props} type="number" min={0} value={form.total_units} onChange={setInput('total_units')} />}
                </Field>
                <Field label="Đang ở" error={errors.current_unit}>
                  {(props) => <Input {...props} type="number" min={0} value={form.current_unit} onChange={setInput('current_unit')} />}
                </Field>
              </div>

              {cat === 'Fanfiction' && (
                <>
                  <Field label="Số chữ" hint={'Fanfic từ 80.000 chữ trở xuống được thống kê ở nhóm riêng "Fanfic ngắn" (cùng nhóm với News và Research Paper của Nonfiction)'} error={errors.word_count}>
                    {(props) => <Input {...props} type="number" min={0} value={form.word_count} onChange={setInput('word_count')} />}
                  </Field>
                  <Field label="Fandom">{(props) => <ChipsInput {...props} value={form.fandoms} onChange={set('fandoms')} suggestions={fandomSuggestions} placeholder="Chọn hoặc gõ rồi nhấn Enter" />}</Field>
                  <Field label="Ship / pairing" hint={form.fandoms.length ? 'Danh sách chỉ gồm cặp đôi của fandom đã chọn (kho fandom & cặp đôi và các fic đã nhập)' : 'Chọn fandom trước để lọc danh sách cặp đôi'}>
                    {(props) => <ChipsInput {...props} value={form.pairings} onChange={set('pairings')} suggestions={pairingSuggestions} placeholder="Chọn hoặc gõ A x B" />}
                  </Field>
                </>
              )}
              <Field label="Series" hint="Chọn series đã có hoặc gõ tên mới rồi nhấn Enter. Sách cùng series được gom ở trang Series.">
                {(props) => <ChipsInput {...props} value={seriesList} onChange={setSeries} suggestions={seriesSuggestions} placeholder="Chọn hoặc gõ rồi nhấn Enter" />}
              </Field>
              {cat === 'Visual/Comics' && (
                <Field label="Số volume" hint="Bộ trên 60 volume luôn được tính vào Truyện tranh trong thống kê" error={errors.volume_count}>
                  {(props) => <Input {...props} type="number" min={0} value={form.volume_count} onChange={setInput('volume_count')} />}
                </Field>
              )}
              {cat === 'Nonfiction' && (
                <Field label="Chủ đề">{(props) => <ChipsInput {...props} value={form.topics} onChange={set('topics')} suggestions={(facets.data?.topics ?? []).map((row) => row.value)} placeholder="Chọn hoặc gõ rồi nhấn Enter" />}</Field>
              )}
              <Field label={cat === 'Fanfiction' ? 'Genres / tags' : 'Genres'} hint="Ghi ra Obsidian ở property Genres">
                {(props) => <ChipsInput {...props} value={form.tags} onChange={set('tags')} suggestions={tagSuggestions} placeholder="Fantasy, Romance" />}
              </Field>
              {(cat === 'Fiction' || cat === 'Fanfiction' || cat === 'Nonfiction') && (
                <Field label="Tropes">{(props) => <ChipsInput {...props} value={form.tropes} onChange={set('tropes')} suggestions={tropeSuggestions} placeholder="Chọn hoặc gõ rồi nhấn Enter" />}</Field>
              )}
              {(cat === 'Fiction' || cat === 'Fanfiction') && (
                <Field label="Warnings" hint="Để trống nghĩa là sách không có warnings">
                  {(props) => <ChipsInput {...props} value={form.warnings} onChange={set('warnings')} suggestions={warningSuggestions} placeholder="Chọn hoặc gõ rồi nhấn Enter" />}
                </Field>
              )}

              {customDefs.length > 0 && (
                <fieldset className="flex flex-col gap-4 rounded-xl border border-line p-4">
                  <legend className="px-1 text-sm font-medium">Trường riêng của template {CATEGORY_LABELS[cat]}</legend>
                  {customDefs.map((def) => (
                    <CustomFieldInput
                      key={def.slug}
                      def={def}
                      value={form.custom_fields[def.slug]}
                      onChange={setCustom(def.slug)}
                      suggestions={customSuggestions[def.slug] ?? []}
                      error={errors[`custom_fields.${def.slug}`]}
                    />
                  ))}
                </fieldset>
              )}

              {isEdit ? (
                existing.data?.library_cards?.length > 0 && (
                  <div className="rounded-xl bg-surface-2 p-4 text-sm">
                    <p className="font-medium">Các lượt đọc</p>
                    <ul className="mt-2 flex flex-col gap-1 text-ink-muted">
                      {existing.data.library_cards.map((card) => (
                        <li key={card.id}>
                          Lượt {card.read_number}:{' '}
                          {!card.start_date && !card.finish_date && card.finish_year
                            ? `năm ${card.finish_year}`
                            : `${formatDate(card.start_date) || 'chưa rõ ngày'} đến ${formatDate(card.finish_date) || 'nay'}`}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 text-xs text-ink-muted">Thêm, sửa hoặc xoá lượt đọc ở tab Thẻ thư viện trên trang của sách.</p>
                  </div>
                )
              ) : (
                <fieldset className="grid grid-cols-2 gap-3 rounded-xl border border-line p-4">
                  <legend className="px-1 text-sm font-medium">Lượt đọc đầu tiên (không bắt buộc)</legend>
                  <Field label="Ngày bắt đầu">{(props) => <Input {...props} type="date" value={form.first_start} onChange={setInput('first_start')} />}</Field>
                  <Field label="Ngày đọc xong" error={errors.first_finish}>
                    {(props) => <Input {...props} type="date" value={form.first_finish} onChange={setInput('first_finish')} />}
                  </Field>
                </fieldset>
              )}
            </div>
          </form>
        )}
      </Dialog>
      {confirmDelete && <DeleteConfirm item={form} busy={saving} onCancel={() => setConfirmDelete(false)} onConfirm={remove} />}
      {dupPrompt && <DuplicateTitleDialog matches={dupPrompt.matches} isEdit={isEdit} onContinue={continueDuplicate} onStop={stopDuplicate} onDismiss={() => setDupPrompt(null)} />}
    </>
  );
}
