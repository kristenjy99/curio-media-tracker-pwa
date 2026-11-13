import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../components/ui/Button.jsx';
import { Dialog } from '../components/ui/Dialog.jsx';
import { ErrorNote } from '../components/ui/ErrorNote.jsx';
import { Field } from '../components/ui/Field.jsx';
import { Input, Select, Textarea } from '../components/ui/Input.jsx';
import { Segmented } from '../components/ui/Segmented.jsx';
import { Spinner } from '../components/ui/Spinner.jsx';
import { Stars, StarInput } from '../components/ui/StarRating.jsx';
import { useToast } from '../components/ui/Toast.jsx';
import { api, ApiError } from '../lib/api.js';
import { cn, hashString } from '../lib/utils.js';
import { categoryLabel, MEDIA_STATUS_LABELS } from './mediaConfig.js';

const INKS = ['#a8443a', '#2f4f7a', '#3f6b4e', '#7a3f6b'];
const pad = (value) => String(value).padStart(2, '0');
/** "03/2024", "2024" hoặc rỗng. */
const periodText = (year, month) => (year ? (month ? `${pad(month)}/${year}` : String(year)) : '');
const monthValue = (year, month) => (year && month ? `${year}-${pad(month)}` : '');
const hasMonths = (card) => Boolean(card.start_month || card.finish_month);

function WatchStamp({ card, size = 60 }) {
  const seed = hashString(`${card.id}-${card.watch_number}`);
  const ink = INKS[(card.watch_number - 1) % INKS.length];
  return (
    <span
      className={cn('stamp inline-flex shrink-0 flex-col items-center justify-center rounded-full text-center leading-none', !card.finished && 'stamp-open')}
      style={{ '--stamp-ink': ink, width: size, height: size, transform: `rotate(${(seed % 23) - 11}deg)` }}
      aria-hidden
    >
      <span className="text-[9px] font-semibold tracking-[0.12em]">{card.finished ? 'đã xem' : 'đang xem'}</span>
      <span className="font-display text-[22px] font-bold">#{card.watch_number}</span>
      <span className="text-[8px] font-medium tabular-nums">{card.season !== null ? `S${card.season}` : periodText(card.finish_year, card.finish_month)}</span>
    </span>
  );
}

function WatchDialog({ item, card, nextNumber, onClose, onSaved }) {
  const isNew = !card;
  const nowYear = new Date().getFullYear();
  const [mode, setMode] = useState(card ? (hasMonths(card) ? 'month' : 'year') : 'month');
  const [form, setForm] = useState(() => ({
    season: card?.season ?? (isNew ? item.season_current ?? null : null),
    start: card ? monthValue(card.start_year, card.start_month) : `${nowYear}-${pad(new Date().getMonth() + 1)}`,
    finish: card ? monthValue(card.finish_year, card.finish_month) : '',
    start_year: card?.start_year ? String(card.start_year) : isNew ? '' : '',
    finish_year: card?.finish_year ? String(card.finish_year) : isNew ? String(nowYear) : '',
    rating: card?.rating ?? null,
    note: card?.note ?? '',
  }));
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = (key) => (value) => setForm((current) => ({ ...current, [key]: value }));
  const seasonCount = Math.max(item.season_total ?? 0, item.season_current ?? 0, item.episodes_per_season?.length ?? 0, form.season ?? 0);
  const title = isNew ? `Thêm lượt xem #${nextNumber}` : `Lượt xem #${card.watch_number}`;

  async function submit(event) {
    event.preventDefault();
    const payload = { season: form.season, rating: form.rating, note: form.note.trim() || null };
    const nextErrors = {};
    if (mode === 'month') {
      const [sy, sm] = form.start ? form.start.split('-').map(Number) : [null, null];
      const [fy, fm] = form.finish ? form.finish.split('-').map(Number) : [null, null];
      if (!sy && !fy) nextErrors.start_year = 'Cần ít nhất tháng bắt đầu hoặc tháng xem xong; không nhớ tháng thì chọn "Chỉ nhớ năm"';
      Object.assign(payload, { start_year: sy, start_month: sm, finish_year: fy, finish_month: fm });
    } else {
      const sy = form.start_year ? Number(form.start_year) : null;
      const fy = form.finish_year ? Number(form.finish_year) : null;
      for (const [key, value] of [['start_year', sy], ['finish_year', fy]]) if (value !== null && (!Number.isInteger(value) || value < 1900 || value > 3000)) nextErrors[key] = 'Năm từ 1900 đến 3000';
      if (sy === null && fy === null) nextErrors.start_year = 'Cần ít nhất năm bắt đầu hoặc năm xem xong';
      Object.assign(payload, { start_year: sy, start_month: null, finish_year: fy, finish_month: null });
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setBusy(true);
    setError(null);
    try {
      if (isNew) await api.post(`/media/items/${item.id}/watch-cards`, payload);
      else await api.patch(`/media/watch-cards/${card.id}`, payload);
      onSaved(isNew ? `Đã thêm lượt xem #${nextNumber}` : `Đã lưu lượt xem #${card.watch_number}`);
    } catch (caught) {
      const fields = caught instanceof ApiError ? caught.fieldErrors() : {};
      // Lỗi năm/tháng từ server gắn vào ô tương ứng của kiểu nhập đang dùng.
      if (mode === 'month') setErrors({ start_year: fields.start_year, finish_year: fields.finish_year });
      else setErrors(fields);
      setError(caught);
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await api.delete(`/media/watch-cards/${card.id}`);
      onSaved(`Đã xoá lượt xem #${card.watch_number}`);
    } catch (caught) {
      setError(caught);
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={title}
      footer={
        confirmDelete ? (
          <>
            <span className="mr-auto text-sm">Xoá lượt #{card.watch_number}? Các lượt sau được đánh số lại.</span>
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
            <Button variant="primary" type="submit" form="watch-form" disabled={busy}>
              {busy && <Spinner />} Lưu
            </Button>
          </>
        )
      }
    >
      <form id="watch-form" onSubmit={submit} className="flex flex-col gap-5" noValidate>
        {error && !Object.values(errors).some(Boolean) && <ErrorNote error={error} />}
        <Field label="Season" hint="Chọn season nếu muốn chấm điểm riêng cho từng season; xem lại một season thì thêm một lượt mới cùng season" error={errors.season}>
          {(props) => (
            <Select {...props} value={form.season ?? ''} onChange={(event) => set('season')(event.target.value === '' ? null : Number(event.target.value))} className="w-56">
              <option value="">Không theo season (cả bộ)</option>
              {Array.from({ length: Math.max(seasonCount, 1) }, (_, index) => index + 1).map((season) => (
                <option key={season} value={season}>
                  Season {season}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Segmented
          label="Kiểu ghi thời gian"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'month', label: 'Tháng/năm' },
            { value: 'year', label: 'Chỉ nhớ năm' },
          ]}
        />
        {mode === 'month' ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Bắt đầu xem" error={errors.start_year}>
              {(props) => <Input {...props} type="month" value={form.start} onChange={(event) => set('start')(event.target.value)} />}
            </Field>
            <Field label="Xem xong" hint="Để trống nếu đang xem" error={errors.finish_year}>
              {(props) => <Input {...props} type="month" value={form.finish} onChange={(event) => set('finish')(event.target.value)} />}
            </Field>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Năm bắt đầu" error={errors.start_year}>
              {(props) => <Input {...props} type="number" inputMode="numeric" min={1900} max={3000} value={form.start_year} onChange={(event) => set('start_year')(event.target.value)} />}
            </Field>
            <Field label="Năm xem xong" hint="Để trống nếu đang xem" error={errors.finish_year}>
              {(props) => <Input {...props} type="number" inputMode="numeric" min={1900} max={3000} value={form.finish_year} onChange={(event) => set('finish_year')(event.target.value)} />}
            </Field>
          </div>
        )}
        <Field label="Đánh giá lượt này" error={errors.rating}>
          {(props) => <StarInput {...props} value={form.rating} onChange={set('rating')} />}
        </Field>
        <Field label="Cảm nhận ngắn" hint="Ghi trên thẻ; review dài viết ở tab Note & Review" error={errors.note}>
          {(props) => <Textarea {...props} value={form.note} onChange={(event) => set('note')(event.target.value)} rows={3} maxLength={5000} />}
        </Field>
      </form>
    </Dialog>
  );
}

const MIN_ROWS = 8;

/** Thẻ lượt xem kiểu thẻ thư viện: mỗi lượt (theo season hoặc cả bộ) một dòng có con dấu. Bấm dòng để sửa hoặc xoá. */
export function WatchCardTab({ item, onChanged }) {
  const toast = useToast();
  const [dialog, setDialog] = useState(null);
  const cards = item.watch_cards ?? [];
  const blanks = Math.max(0, MIN_ROWS - cards.length);
  const saved = (message) => {
    setDialog(null);
    toast(message);
    onChanged();
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-ink-muted">
          {cards.length ? `${cards.length} lượt xem.` : 'Chưa có lượt xem nào.'} Trạng thái hiện tại: {MEDIA_STATUS_LABELS[item.status]}. Năm xem trong thống kê lấy theo các lượt này.
        </p>
        <Button variant="primary" className="ml-auto" onClick={() => setDialog({ card: null })}>
          <Plus size={16} /> Thêm lượt xem mới
        </Button>
      </div>
      <article className="library-card mx-auto w-full max-w-4xl" aria-label="Thẻ lượt xem">
        <header className="library-card-head grid gap-x-8 gap-y-3 px-6 pb-4 pt-6 sm:grid-cols-[1fr_auto] sm:px-10">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold tracking-[0.18em] text-[var(--card-ink)]/70">Thẻ lượt xem · {categoryLabel(item.category)}</p>
            <h2 className="mt-1 font-display text-3xl italic leading-tight text-[var(--card-ink)] [overflow-wrap:anywhere]">{item.title}</h2>
            {item.series_name && <p className="mt-1 font-display text-lg italic text-[var(--card-ink)]/80">{item.series_name}</p>}
          </div>
          <dl className="grid grid-cols-[auto_auto] content-start gap-x-3 gap-y-1 text-xs text-[var(--card-ink)]/80">
            <dt>Số thẻ</dt>
            <dd className="font-mono tabular-nums">{(item.sync_uid ?? '').slice(0, 8)}</dd>
            {item.season_total ? (
              <>
                <dt>Số season</dt>
                <dd className="tabular-nums">{item.season_total}</dd>
              </>
            ) : null}
          </dl>
        </header>
        <div className="overflow-x-auto px-3 pb-6 sm:px-6">
          <table className="library-card-table w-full min-w-[680px] text-left text-sm text-[var(--card-ink)]">
            <thead>
              <tr>
                <th scope="col" className="w-16">Lượt</th>
                <th scope="col" className="w-24">Season</th>
                <th scope="col" className="w-28">Bắt đầu</th>
                <th scope="col" className="w-28">Xem xong</th>
                <th scope="col" className="w-28">Đánh giá</th>
                <th scope="col">Ghi chú</th>
                <th scope="col" className="w-24 text-center">Dấu</th>
              </tr>
            </thead>
            <tbody>
              {cards.map((card) => (
                <tr key={card.id} className="cursor-pointer hover:bg-[var(--card-ink)]/5" onClick={() => setDialog({ card })}>
                  <td>
                    <button type="button" className="font-display text-lg font-semibold underline-offset-4 hover:underline" onClick={(event) => { event.stopPropagation(); setDialog({ card }); }} aria-label={`Sửa lượt xem #${card.watch_number}`}>
                      #{card.watch_number}
                    </button>
                  </td>
                  <td className="handwritten">
                    {card.season !== null ? `S${card.season}` : 'cả bộ'}
                    {card.season !== null && card.season_watch_number > 1 && <span>{` · lần ${card.season_watch_number}`}</span>}
                  </td>
                  <td className="handwritten tabular-nums">{periodText(card.start_year, card.start_month) || '?'}</td>
                  <td className="handwritten tabular-nums">{periodText(card.finish_year, card.finish_month) || <span className="opacity-60">đang xem</span>}</td>
                  <td>{card.rating ? <Stars value={card.rating} size={13} /> : ''}</td>
                  <td className="handwritten max-w-[16rem] truncate" title={card.note ?? ''}>{card.note}</td>
                  <td className="relative h-[4.25rem] text-center">
                    <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                      <WatchStamp card={card} />
                    </span>
                  </td>
                </tr>
              ))}
              {Array.from({ length: blanks }, (_, index) => (
                <tr key={`blank-${index}`} aria-hidden>
                  <td className="h-[4.25rem]" colSpan={7} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
      {dialog && <WatchDialog item={item} card={dialog.card} nextNumber={cards.length + 1} onClose={() => setDialog(null)} onSaved={saved} />}
    </div>
  );
}
