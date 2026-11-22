import { useQueryClient } from '@tanstack/react-query';
import { Highlighter, Pencil, Plus, Quote as QuoteIcon, Search, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuotes } from '../../hooks/queries.js';
import { api, ApiError } from '../../lib/api.js';
import { CATEGORY_LABELS } from '../../lib/labels.js';
import { formatDate } from '../../lib/utils.js';
import { BookSelect } from '../goals/BookSelect.jsx';
import { Button } from '../ui/Button.jsx';
import { Cover } from '../ui/Cover.jsx';
import { Dialog } from '../ui/Dialog.jsx';
import { ErrorNote } from '../ui/ErrorNote.jsx';
import { Field } from '../ui/Field.jsx';
import { Input, Textarea } from '../ui/Input.jsx';
import { Segmented } from '../ui/Segmented.jsx';
import { Spinner } from '../ui/Spinner.jsx';
import { useToast } from '../ui/Toast.jsx';

const KIND_LABELS = { quote: 'Quote', highlight: 'Highlight' };

/** Thêm hoặc sửa một quote. `itemId` cố định sách (tab trong trang sách); không có thì chọn sách trong form. */
function QuoteDialog({ quote, itemId, onClose, onSaved }) {
  const isEdit = Boolean(quote);
  const toast = useToast();
  const [form, setForm] = useState(() => ({
    item_id: quote?.item_id ?? itemId ?? null,
    kind: quote?.kind ?? 'quote',
    content: quote?.content ?? '',
    location: quote?.location ?? '',
    note: quote?.note ?? '',
  }));
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);
  const set = (key) => (value) => setForm((current) => ({ ...current, [key]: value }));

  async function submit(event) {
    event.preventDefault();
    const nextErrors = {};
    if (!form.item_id) nextErrors.item_id = 'Cần chọn sách';
    if (!form.content.trim()) nextErrors.content = 'Cần nội dung quote';
    setErrors(nextErrors);
    setFormError(null);
    if (Object.keys(nextErrors).length) return;
    setSaving(true);
    try {
      const body = { kind: form.kind, content: form.content, location: form.location, note: form.note };
      if (isEdit) await api.patch(`/quotes/${quote.id}`, body);
      else await api.post('/quotes', { ...body, item_id: form.item_id });
      toast(isEdit ? 'Đã lưu quote' : 'Đã thêm quote');
      onSaved();
      onClose();
    } catch (error) {
      if (error instanceof ApiError && error.details.length) setErrors(error.fieldErrors());
      setFormError(error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={isEdit ? 'Sửa quote' : 'Thêm quote'}
      footer={
        <>
          <Button onClick={onClose}>Huỷ</Button>
          <Button variant="primary" type="submit" form="quote-form" disabled={saving}>
            {saving && <Spinner />} {isEdit ? 'Lưu thay đổi' : 'Thêm quote'}
          </Button>
        </>
      }
    >
      <form id="quote-form" onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {formError && !Object.keys(errors).length && <ErrorNote error={formError} />}
        {!itemId && !isEdit && (
          <Field label="Sách" required error={errors.item_id}>
            {(props) => <BookSelect {...props} value={form.item_id} onChange={set('item_id')} />}
          </Field>
        )}
        <Field label="Loại">
          {() => (
            <Segmented
              label="Loại"
              value={form.kind}
              onChange={set('kind')}
              options={[
                { value: 'quote', label: 'Quote' },
                { value: 'highlight', label: 'Highlight' },
              ]}
            />
          )}
        </Field>
        <Field label="Nội dung" required error={errors.content}>
          {(props) => <Textarea {...props} value={form.content} onChange={(event) => set('content')(event.target.value)} rows={6} autoFocus />}
        </Field>
        <Field label="Vị trí" hint="Trang, chương hoặc %, ví dụ: tr. 42" error={errors.location}>
          {(props) => <Input {...props} value={form.location} onChange={(event) => set('location')(event.target.value)} maxLength={100} />}
        </Field>
        <Field label="Ghi chú của bạn" error={errors.note}>
          {(props) => <Textarea {...props} value={form.note} onChange={(event) => set('note')(event.target.value)} rows={3} />}
        </Field>
      </form>
    </Dialog>
  );
}

function DeleteQuoteDialog({ quote, onClose, onDeleted }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  async function remove() {
    setBusy(true);
    try {
      await api.delete(`/quotes/${quote.id}`);
      toast('Đã xoá quote');
      onDeleted();
      onClose();
    } catch (error) {
      toast(error.message, { tone: 'error' });
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      size="sm"
      title="Xoá quote này?"
      footer={
        <>
          <Button onClick={onClose}>Giữ lại</Button>
          <Button variant="danger" onClick={remove} disabled={busy}>
            {busy ? <Spinner /> : <Trash2 size={16} />} Xoá quote
          </Button>
        </>
      }
    >
      <p className="text-sm text-ink-muted">Không hoàn tác được trong app.</p>
    </Dialog>
  );
}

function QuoteCard({ quote, showBook, onEdit, onDelete }) {
  const Icon = quote.kind === 'highlight' ? Highlighter : QuoteIcon;
  return (
    <li className="flex gap-4 rounded-xl border border-line bg-surface p-4">
      {showBook && (
        <Link to={`/books/${quote.item_id}?tab=quotes`} className="hidden w-12 shrink-0 sm:block" aria-label={`Mở sách ${quote.item_title}`} tabIndex={-1}>
          <Cover src={quote.item_cover} title={quote.item_title} />
        </Link>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
          <span className={quote.kind === 'highlight' ? 'inline-flex items-center gap-1 rounded-full bg-honey/20 px-2 py-0.5 text-ink' : 'inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-ink'}>
            <Icon size={12} aria-hidden /> {KIND_LABELS[quote.kind]}
          </span>
          {quote.location && <span translate="no">{quote.location}</span>}
          <span>{formatDate(quote.created_at)}</span>
        </div>
        <blockquote translate="no" className="mt-2 whitespace-pre-wrap break-words border-l-2 border-moss pl-3 font-display text-lg leading-relaxed text-ink">
          {quote.content}
        </blockquote>
        {quote.note && (
          <p translate="no" className="mt-2 whitespace-pre-wrap break-words text-sm text-ink-muted">
            {quote.note}
          </p>
        )}
        {showBook && (
          <p className="mt-3 text-sm">
            <span className="text-ink-muted">Trích từ </span>
            <Link to={`/books/${quote.item_id}?tab=quotes`} className="font-medium text-moss underline-offset-4 hover:underline" translate="no">
              {quote.item_title}
            </Link>
            {quote.item_author && (
              <>
                <span className="text-ink-muted"> · </span>
                <span translate="no">{quote.item_author}</span>
              </>
            )}
            <span className="text-ink-muted"> · {CATEGORY_LABELS[quote.item_category] ?? quote.item_category}</span>
          </p>
        )}
      </div>
      <div className="flex shrink-0 flex-col gap-1">
        <Button variant="ghost" size="icon-sm" onClick={() => onEdit(quote)} aria-label="Sửa quote" title="Sửa quote">
          <Pencil size={15} />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={() => onDelete(quote)} aria-label="Xoá quote" title="Xoá quote">
          <Trash2 size={15} />
        </Button>
      </div>
    </li>
  );
}

/**
 * Danh sách quotes & highlights có ô tìm kiếm và lọc theo loại.
 * itemId: chỉ quotes của một sách (tab trong trang sách), không thì toàn thư viện kèm sách nguồn.
 */
export function QuoteList({ itemId }) {
  const client = useQueryClient();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('all');
  const [editing, setEditing] = useState(null); // null | 'new' | quote
  const [deleting, setDeleting] = useState(null);
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const quotes = useQuotes({ q: query || undefined, kind: kind === 'all' ? undefined : kind, item_id: itemId });
  const list = quotes.data?.data ?? [];
  const counts = quotes.data?.counts ?? { quote: 0, highlight: 0 };
  const totalAll = counts.quote + counts.highlight;
  const refresh = () => client.invalidateQueries({ queryKey: ['quotes'] });
  const filtered = Boolean(query) || kind !== 'all';

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          label="Loại"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'all', label: 'Tất cả', count: totalAll },
            { value: 'quote', label: 'Quotes', count: counts.quote },
            { value: 'highlight', label: 'Highlights', count: counts.highlight },
          ]}
        />
        <div className="relative w-full sm:ml-auto sm:w-80">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
          <Input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={itemId ? 'Tìm trong quotes của sách này' : 'Tìm theo nội dung, tên sách, tác giả'}
            aria-label="Tìm quote"
            className="pl-9"
          />
        </div>
        <Button variant="primary" onClick={() => setEditing('new')}>
          <Plus size={16} /> Thêm quote
        </Button>
      </div>

      <ErrorNote error={quotes.error} />
      {quotes.isLoading && (
        <div className="flex items-center gap-2 py-12 text-ink-muted" role="status">
          <Spinner /> Đang lấy quotes
        </div>
      )}
      {!quotes.isLoading && !quotes.error && list.length === 0 && (
        <div className="rounded-xl border border-dashed border-line px-6 py-12 text-center">
          {filtered && totalAll > 0 ? (
            <>
              <p className="font-display text-2xl">Không có quote nào khớp</p>
              <p className="mt-2 text-sm text-ink-muted">Thử từ khoá khác hoặc chọn lại loại.</p>
            </>
          ) : (
            <>
              <p className="font-display text-2xl">Chưa có quote nào</p>
              <p className="mt-2 text-sm text-ink-muted">Lưu lại câu trích dẫn hoặc đoạn đánh dấu khi đọc bằng nút Thêm quote.</p>
            </>
          )}
        </div>
      )}
      {list.length > 0 && (
        <>
          {filtered && <p className="text-sm text-ink-muted" role="status">{`Tìm thấy ${list.length} quote`}</p>}
          <ul className="flex flex-col gap-3">
            {list.map((quote) => (
              <QuoteCard key={quote.id} quote={quote} showBook={!itemId} onEdit={setEditing} onDelete={setDeleting} />
            ))}
          </ul>
        </>
      )}

      {editing && <QuoteDialog quote={editing === 'new' ? null : editing} itemId={itemId} onClose={() => setEditing(null)} onSaved={refresh} />}
      {deleting && <DeleteQuoteDialog quote={deleting} onClose={() => setDeleting(null)} onDeleted={refresh} />}
    </div>
  );
}
