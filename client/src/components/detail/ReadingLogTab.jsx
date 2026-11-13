import { useQueryClient } from '@tanstack/react-query';
import { BookOpenCheck, Check, Pencil, Play, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useReadingLogs } from '../../hooks/queries.js';
import { api, ApiError } from '../../lib/api.js';
import { cn, formatDate, formatMinutes, formatNumber, todayIso, UNIT_WORDS } from '../../lib/utils.js';
import { Button } from '../ui/Button.jsx';
import { ErrorNote } from '../ui/ErrorNote.jsx';
import { Field } from '../ui/Field.jsx';
import { Input } from '../ui/Input.jsx';
import { Segmented } from '../ui/Segmented.jsx';
import { Spinner } from '../ui/Spinner.jsx';
import { Switch } from '../ui/Switch.jsx';
import { useToast } from '../ui/Toast.jsx';

const toInt = (value) => (value === '' || value === null || value === undefined ? 0 : Math.max(0, Math.trunc(Number(value)) || 0));

function Summary({ logs, unit }) {
  const stats = useMemo(() => {
    const days = new Set(logs.map((log) => log.date));
    const minutes = logs.reduce((sum, log) => sum + log.minutes_spent, 0);
    const units = logs.reduce((sum, log) => sum + log.units_read, 0);
    return { days: days.size, minutes, units, average: days.size ? Math.round(minutes / days.size) : 0 };
  }, [logs]);
  const entries = [
    { label: 'Ngày có đọc', value: formatNumber(stats.days) },
    { label: 'Tổng thời gian', value: formatMinutes(stats.minutes) },
    { label: `Tổng ${unit}`, value: formatNumber(stats.units) },
    { label: 'Trung bình mỗi ngày', value: formatMinutes(stats.average) },
  ];
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {entries.map((entry) => (
        <div key={entry.label} className="rounded-xl border border-line bg-surface px-4 py-3">
          <dt className="text-xs text-ink-muted">{entry.label}</dt>
          <dd className="mt-1 text-lg font-semibold tabular-nums">{entry.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function LogRow({ log, unit, onSaved }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ date: log.date, units: String(log.units_read), minutes: String(log.minutes_spent) });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/reading-logs/${log.id}`, { date: form.date, units_read: toInt(form.units), minutes_spent: toInt(form.minutes) });
      setEditing(false);
      onSaved();
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await api.delete(`/reading-logs/${log.id}`);
      toast(log.progress_applied ? `Đã xoá log, trả lại ${log.progress_applied} ${unit} khỏi tiến độ` : 'Đã xoá log');
      onSaved();
    } catch (caught) {
      setError(caught);
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <li className="px-4 py-3">
        <form onSubmit={save} className="flex flex-wrap items-end gap-2">
          <Input type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} className="w-40" aria-label="Ngày" />
          <Input type="number" min={0} value={form.units} onChange={(event) => setForm({ ...form, units: event.target.value })} className="w-28" aria-label={`Số ${unit}`} />
          <Input type="number" min={0} value={form.minutes} onChange={(event) => setForm({ ...form, minutes: event.target.value })} className="w-28" aria-label="Số phút" />
          <Button type="submit" size="sm" variant="primary" disabled={busy}>
            {busy ? <Spinner size={14} /> : <Check size={14} />} Lưu
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
            <X size={14} /> Huỷ
          </Button>
        </form>
        {log.progress_applied > 0 && <p className="mt-1.5 text-xs text-ink-muted">Đổi số {unit} thì tiến độ được tính lại theo số mới.</p>}
        {error && <ErrorNote error={error} className="mt-2" />}
      </li>
    );
  }

  return (
    <li className="flex items-center gap-4 px-4 py-2.5 text-sm">
      <span className="w-24 shrink-0 tabular-nums">{formatDate(log.date)}</span>
      <span className="w-28 shrink-0 tabular-nums">{log.units_read ? `${formatNumber(log.units_read)} ${unit}` : '—'}</span>
      <span className="flex-1 tabular-nums text-ink-muted">{log.minutes_spent ? formatMinutes(log.minutes_spent) : ''}</span>
      {log.progress_applied > 0 && <span className="hidden text-xs text-ink-muted sm:inline">đã cộng vào tiến độ</span>}
      <Button variant="ghost" size="icon-sm" onClick={() => setEditing(true)} aria-label={`Sửa log ngày ${formatDate(log.date)}`}>
        <Pencil size={14} />
      </Button>
      <Button variant="ghost" size="icon-sm" onClick={remove} disabled={busy} aria-label={`Xoá log ngày ${formatDate(log.date)}`}>
        <Trash2 size={14} />
      </Button>
      {error && <span className="text-xs text-danger">{error.message}</span>}
    </li>
  );
}

/**
 * Log đọc theo ngày (số trang/chương và số phút). Dữ liệu dùng cho streak và heatmap ở Dashboard.
 * Có thể nhập "đã đọc bao nhiêu" hoặc "đọc tới trang mấy"; mặc định cộng vào tiến độ của sách.
 */
export function ReadingLogTab({ item, onChanged }) {
  const toast = useToast();
  const client = useQueryClient();
  const logs = useReadingLogs(item.id);
  const unit = UNIT_WORDS[item.unit_type] ?? 'trang';
  // Sách nói tính tiến độ bằng phút: một ô nhập vừa là số đơn vị vừa là thời gian.
  const minutesUnit = item.unit_type === 'minutes';
  const [mode, setMode] = useState('amount');
  const [form, setForm] = useState({ date: todayIso(), units: '', minutes: '', advance: true });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const cards = item.library_cards ?? [];
  const latest = cards.at(-1);
  const openCard = latest && !latest.finish_date && !(latest.finish_year && !latest.start_date) ? latest : null;
  const reachedEnd = item.total_units && item.current_unit >= item.total_units;

  const refresh = () => {
    client.invalidateQueries({ queryKey: ['reading-logs', item.id] });
    onChanged();
  };

  const unitsFromForm = () => {
    if (mode === 'until') return Math.max(0, toInt(form.units) - item.current_unit);
    return toInt(form.units);
  };

  async function submit(event) {
    event.preventDefault();
    const units = unitsFromForm();
    const minutes = minutesUnit ? units : toInt(form.minutes);
    const nextErrors = {};
    if (mode === 'until' && toInt(form.units) <= item.current_unit) nextErrors.units = `Đang ở ${unit} ${item.current_unit}; nhập số lớn hơn`;
    if (item.total_units && mode === 'until' && toInt(form.units) > item.total_units) nextErrors.units = `Sách có ${formatNumber(item.total_units)} ${unit}`;
    if (!units && !minutes && !nextErrors.units) nextErrors.units = `Nhập số ${unit} hoặc số phút`;
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setBusy(true);
    setError(null);
    try {
      const payload = { item_id: item.id, date: form.date, units_read: units, minutes_spent: minutes, advance_progress: form.advance };
      const result = await api.post('/reading-logs', payload);
      toast(
        result.log.progress_applied
          ? `Đã ghi log; tiến độ ${unit} ${formatNumber(result.item.current_unit)}${result.item.total_units ? ` / ${formatNumber(result.item.total_units)}` : ''}`
          : 'Đã ghi log',
      );
      setForm((current) => ({ ...current, units: '', minutes: '' }));
      refresh();
    } catch (caught) {
      if (caught instanceof ApiError) {
        const fields = caught.fieldErrors();
        setErrors({ units: fields.units_read, minutes: fields.minutes_spent, date: fields.date });
      }
      setError(caught);
    } finally {
      setBusy(false);
    }
  }

  async function startReading() {
    setBusy(true);
    try {
      await api.post(`/items/${item.id}/library-cards`, { start_date: form.date });
      toast(`Đã bắt đầu lượt đọc #${cards.length + 1}`);
      onChanged();
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  }

  async function finishReading() {
    setBusy(true);
    try {
      const finish = openCard.start_date && openCard.start_date > form.date ? openCard.start_date : form.date;
      await api.patch(`/library-cards/${openCard.id}`, { finish_date: finish });
      toast(`Đã đánh dấu đọc xong lượt #${openCard.read_number}`);
      onChanged();
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  }

  const list = logs.data?.data ?? [];

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,22rem)_1fr]">
      <div className="flex flex-col gap-4">
        <form onSubmit={submit} className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5" noValidate>
          <h3 className="font-display text-2xl font-medium">Ghi log đọc</h3>
          <Field label="Ngày" error={errors.date}>
            {(props) => <Input {...props} type="date" value={form.date} max={todayIso()} onChange={(event) => setForm({ ...form, date: event.target.value })} />}
          </Field>
          <Segmented
            size="sm"
            label="Cách nhập"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'amount', label: `Số ${unit} đã đọc` },
              { value: 'until', label: `Đọc tới ${unit}` },
            ]}
          />
          <div className="grid grid-cols-2 gap-3">
            <Field label={mode === 'until' ? `Tới ${unit}` : `Số ${unit}`} error={errors.units}>
              {(props) => <Input {...props} type="number" min={0} inputMode="numeric" value={form.units} onChange={(event) => setForm({ ...form, units: event.target.value })} placeholder={mode === 'until' ? String(item.current_unit + 1) : ''} />}
            </Field>
            {!minutesUnit && (
              <Field label="Số phút" error={errors.minutes}>
                {(props) => <Input {...props} type="number" min={0} inputMode="numeric" value={form.minutes} onChange={(event) => setForm({ ...form, minutes: event.target.value })} />}
              </Field>
            )}
          </div>
          <label className="flex items-center gap-3 text-sm">
            <Switch checked={form.advance} onCheckedChange={(advance) => setForm({ ...form, advance })} aria-label="Cộng vào tiến độ" />
            Cộng vào tiến độ (đang ở {unit} {formatNumber(item.current_unit)}{item.total_units ? ` / ${formatNumber(item.total_units)}` : ''})
          </label>
          {error && <ErrorNote error={error} />}
          <Button type="submit" variant="primary" disabled={busy}>
            {busy && <Spinner />} Ghi log
          </Button>
        </form>

        {!openCard && item.status !== 'Finished' && (
          <div className="rounded-2xl border border-line bg-surface-2/60 p-4 text-sm">
            <p>Sách chưa có lượt đọc đang mở. Log vẫn được tính cho streak; thêm lượt đọc để ngày bắt đầu hiện trên thẻ thư viện và trong Obsidian.</p>
            <Button size="sm" className="mt-3" onClick={startReading} disabled={busy}>
              <Play size={14} /> Bắt đầu lượt đọc từ {formatDate(form.date)}
            </Button>
          </div>
        )}
        {openCard && reachedEnd && (
          <div className="rounded-2xl border border-moss/40 bg-sage/20 p-4 text-sm">
            <p>Đã tới {unit} cuối. Đánh dấu lượt #{openCard.read_number} đã đọc xong?</p>
            <Button size="sm" variant="primary" className="mt-3" onClick={finishReading} disabled={busy}>
              <BookOpenCheck size={14} /> Đọc xong ngày {formatDate(form.date)}
            </Button>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4">
        <Summary logs={list} unit={unit} />
        {logs.isLoading ? (
          <div className="flex items-center gap-2 py-6 text-ink-muted">
            <Spinner /> Đang lấy log
          </div>
        ) : list.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line px-4 py-10 text-center text-sm text-ink-muted">Chưa có log nào cho sách này.</p>
        ) : (
          <ul className={cn('divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface')} aria-label="Các log đọc">
            {list.map((log) => (
              <LogRow key={`${log.id}-${log.updated_at}`} log={log} unit={unit} onSaved={refresh} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
