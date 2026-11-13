import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { api, ApiError } from '../../lib/api.js';
import { STATUS_LABELS } from '../../lib/labels.js';
import { cn, formatDate, hashString, todayIso } from '../../lib/utils.js';
import { Button } from '../ui/Button.jsx';
import { Dialog } from '../ui/Dialog.jsx';
import { ErrorNote } from '../ui/ErrorNote.jsx';
import { Field } from '../ui/Field.jsx';
import { Input, Textarea } from '../ui/Input.jsx';
import { Segmented } from '../ui/Segmented.jsx';
import { Spinner } from '../ui/Spinner.jsx';
import { Stars, StarInput } from '../ui/StarRating.jsx';
import { useToast } from '../ui/Toast.jsx';

const isFinished = (card) => Boolean(card.finish_date) || (Boolean(card.finish_year) && !card.start_date);
const yearOnly = (card) => !card.start_date && !card.finish_date && Boolean(card.finish_year);

// Mực dấu: đỏ son, xanh chàm, xanh rêu; mỗi lượt một màu và một góc nghiêng cố định.
const INKS = ['#a8443a', '#2f4f7a', '#3f6b4e', '#7a3f6b'];

function stampDate(card) {
  if (yearOnly(card)) return `năm ${card.finish_year}`;
  const date = card.finish_date ?? card.start_date;
  return date ? formatDate(date).replace(/\//g, '.') : '';
}

/** Con dấu cao su tròn cho một lượt đọc. */
export function ReadStamp({ card, size = 84 }) {
  const seed = hashString(`${card.id}-${card.read_number}`);
  const ink = INKS[(card.read_number - 1) % INKS.length];
  const rotate = (seed % 23) - 11;
  const done = isFinished(card);
  return (
    <span
      className={cn('stamp inline-flex shrink-0 flex-col items-center justify-center rounded-full text-center leading-none', !done && 'stamp-open')}
      style={{ '--stamp-ink': ink, width: size, height: size, transform: `rotate(${rotate}deg)` }}
      aria-hidden
    >
      <span className="text-[9px] font-semibold tracking-[0.12em]">{done ? 'đã đọc' : 'đang đọc'}</span>
      <span className="font-display text-[22px] font-bold">#{card.read_number}</span>
      <span className="text-[8px] font-medium tabular-nums">{stampDate(card)}</span>
    </span>
  );
}

function ReadDialog({ itemId, card, nextNumber, onClose, onSaved }) {
  const isNew = !card;
  const [mode, setMode] = useState(card && yearOnly(card) ? 'year' : 'dates');
  const [form, setForm] = useState(() => ({
    start_date: card?.start_date ?? (isNew ? todayIso() : ''),
    finish_date: card?.finish_date ?? '',
    finish_year: card?.finish_year ? String(card.finish_year) : String(new Date().getFullYear()),
    rating: card?.rating ?? null,
    review_summary: card?.review_summary ?? '',
  }));
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = (key) => (value) => setForm((current) => ({ ...current, [key]: value }));

  async function submit(event) {
    event.preventDefault();
    const nextErrors = {};
    const payload = { rating: form.rating, review_summary: form.review_summary.trim() || null };
    if (mode === 'dates') {
      if (form.start_date && form.finish_date && form.finish_date < form.start_date) nextErrors.finish_date = 'Ngày đọc xong phải sau ngày bắt đầu';
      if (!form.start_date && !form.finish_date) nextErrors.start_date = 'Cần ít nhất một ngày; không nhớ ngày thì chọn "Chỉ nhớ năm"';
      Object.assign(payload, { start_date: form.start_date || null, finish_date: form.finish_date || null, finish_year: null });
    } else {
      const year = Number(form.finish_year);
      if (!Number.isInteger(year) || year < 1900 || year > 2100) nextErrors.finish_year = 'Năm từ 1900 đến 2100';
      Object.assign(payload, { start_date: null, finish_date: null, finish_year: year });
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setBusy(true);
    setError(null);
    try {
      if (isNew) await api.post(`/items/${itemId}/library-cards`, payload);
      else await api.patch(`/library-cards/${card.id}`, payload);
      onSaved(isNew ? `Đã thêm lượt đọc #${nextNumber}` : `Đã lưu lượt đọc #${card.read_number}`);
    } catch (caught) {
      if (caught instanceof ApiError) setErrors(caught.fieldErrors());
      setError(caught);
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await api.delete(`/library-cards/${card.id}`);
      onSaved(`Đã xoá lượt đọc #${card.read_number}`);
    } catch (caught) {
      setError(caught);
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={isNew ? `Thêm lượt đọc #${nextNumber}` : `Lượt đọc #${card.read_number}`}
      description={isNew && nextNumber > 1 && mode === 'dates' ? 'Lượt đọc lại: chưa có ngày đọc xong thì sách chuyển sang Đang đọc và tiến độ về 0.' : undefined}
      footer={
        confirmDelete ? (
          <>
            <span className="mr-auto text-sm">Xoá lượt #{card.read_number}? Các lượt sau được đánh số lại.</span>
            <Button onClick={() => setConfirmDelete(false)}>Giữ lại</Button>
            <Button variant="danger" onClick={remove} disabled={busy}>
              {busy ? <Spinner /> : <Trash2 size={16} />} Xoá
            </Button>
          </>
        ) : (
          <>
            {!isNew && (
              <Button variant="ghost" className="mr-auto text-danger" onClick={() => setConfirmDelete(true)} disabled={busy}>
                <Trash2 size={16} /> Xoá lượt này
              </Button>
            )}
            <Button onClick={onClose}>Huỷ</Button>
            <Button variant="primary" type="submit" form="read-form" disabled={busy}>
              {busy && <Spinner />} Lưu
            </Button>
          </>
        )
      }
    >
      <form id="read-form" onSubmit={submit} className="flex flex-col gap-5" noValidate>
        {error && !Object.keys(errors).length && <ErrorNote error={error} />}
        <Segmented
          label="Kiểu ghi ngày"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'dates', label: 'Có ngày cụ thể' },
            { value: 'year', label: 'Chỉ nhớ năm' },
          ]}
        />
        {mode === 'dates' ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Ngày bắt đầu" error={errors.start_date}>
              {(props) => <Input {...props} type="date" value={form.start_date} onChange={(event) => set('start_date')(event.target.value)} />}
            </Field>
            <Field label="Ngày đọc xong" hint="Để trống nếu đang đọc" error={errors.finish_date}>
              {(props) => <Input {...props} type="date" value={form.finish_date} onChange={(event) => set('finish_date')(event.target.value)} />}
            </Field>
          </div>
        ) : (
          <Field label="Năm đọc" hint="Lượt đọc chỉ biết năm được tính là đã đọc xong trong năm đó" error={errors.finish_year}>
            {(props) => <Input {...props} type="number" inputMode="numeric" min={1900} max={2100} value={form.finish_year} onChange={(event) => set('finish_year')(event.target.value)} className="w-36" />}
          </Field>
        )}
        <Field label="Đánh giá lượt này" error={errors.rating}>
          {(props) => <StarInput {...props} value={form.rating} onChange={set('rating')} />}
        </Field>
        <Field label="Cảm nhận ngắn" hint="Ghi trên thẻ thư viện; review dài viết ở tab Note & Review" error={errors.review_summary}>
          {(props) => <Textarea {...props} value={form.review_summary} onChange={(event) => set('review_summary')(event.target.value)} rows={3} maxLength={5000} />}
        </Field>
      </form>
    </Dialog>
  );
}

const MIN_ROWS = 8;

/** Thẻ thư viện giấy: mỗi lượt đọc một dòng, cột cuối là con dấu. Bấm vào dòng để sửa hoặc xoá. */
export function LibraryCardTab({ item, onChanged }) {
  const toast = useToast();
  const [dialog, setDialog] = useState(null);
  const cards = item.library_cards ?? [];
  const blanks = Math.max(0, MIN_ROWS - cards.length);
  const cardNumber = (item.sync_uid ?? '').slice(0, 8);

  const saved = (message) => {
    setDialog(null);
    toast(message);
    onChanged();
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-ink-muted">
          {cards.length ? `${cards.length} lượt đọc, ${Math.max(cards.length - 1, 0)} lần re-read.` : 'Chưa có lượt đọc nào.'} Trạng thái hiện tại: {STATUS_LABELS[item.status]}.
        </p>
        <Button variant="primary" className="ml-auto" onClick={() => setDialog({ card: null })}>
          <Plus size={16} /> Thêm lượt đọc mới
        </Button>
      </div>

      <article className="library-card mx-auto w-full max-w-4xl" aria-label="Thẻ thư viện">
        <header className="library-card-head grid gap-x-8 gap-y-3 px-6 pb-4 pt-6 sm:grid-cols-[1fr_auto] sm:px-10">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold tracking-[0.18em] text-[var(--card-ink)]/70">Thẻ thư viện · {item.main_category === 'Visual/Comics' ? 'Truyện tranh' : item.main_category}</p>
            <h2 className="mt-1 font-display text-3xl italic leading-tight text-[var(--card-ink)] [overflow-wrap:anywhere]">{item.title}</h2>
            {item.creator_author && <p className="mt-1 font-display text-lg italic text-[var(--card-ink)]/80">{item.creator_author}</p>}
          </div>
          <dl className="grid grid-cols-[auto_auto] content-start gap-x-3 gap-y-1 text-xs text-[var(--card-ink)]/80">
            <dt>Số thẻ</dt>
            <dd className="font-mono tabular-nums">{cardNumber}</dd>
            {item.release_year && (
              <>
                <dt>Xuất bản</dt>
                <dd className="tabular-nums">{item.release_year}</dd>
              </>
            )}
          </dl>
        </header>
        <div className="overflow-x-auto px-3 pb-6 sm:px-6">
          <table className="library-card-table w-full min-w-[640px] text-left text-sm text-[var(--card-ink)]">
            <thead>
              <tr>
                <th scope="col" className="w-16">Lượt</th>
                <th scope="col" className="w-32">Ngày mượn</th>
                <th scope="col" className="w-32">Ngày trả</th>
                <th scope="col" className="w-28">Đánh giá</th>
                <th scope="col">Ghi chú</th>
                <th scope="col" className="w-28 text-center">Dấu</th>
              </tr>
            </thead>
            <tbody>
              {cards.map((card) => (
                <tr key={card.id} className="cursor-pointer hover:bg-[var(--card-ink)]/5" onClick={() => setDialog({ card })}>
                  <td>
                    <button type="button" className="font-display text-lg font-semibold underline-offset-4 hover:underline" onClick={(event) => { event.stopPropagation(); setDialog({ card }); }} aria-label={`Sửa lượt đọc #${card.read_number}`}>
                      #{card.read_number}
                    </button>
                  </td>
                  <td className="handwritten tabular-nums">{yearOnly(card) ? '' : formatDate(card.start_date) || '?'}</td>
                  <td className="handwritten tabular-nums">{yearOnly(card) ? `năm ${card.finish_year}` : formatDate(card.finish_date) || <span className="opacity-60">đang đọc</span>}</td>
                  <td>{card.rating ? <Stars value={card.rating} size={13} /> : ''}</td>
                  <td className="handwritten max-w-[18rem] truncate" title={card.review_summary ?? ''}>{card.review_summary}</td>
                  <td className="relative h-[4.25rem] text-center">
                    <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                      <ReadStamp card={card} size={60} />
                    </span>
                  </td>
                </tr>
              ))}
              {Array.from({ length: blanks }, (_, index) => (
                <tr key={`blank-${index}`} aria-hidden>
                  <td className="h-[4.25rem]" colSpan={6} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>

      {dialog && (
        <ReadDialog
          itemId={item.id}
          card={dialog.card}
          nextNumber={cards.length + 1}
          onClose={() => setDialog(null)}
          onSaved={saved}
        />
      )}
    </div>
  );
}
