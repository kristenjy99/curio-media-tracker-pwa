import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ReadCover } from '../components/calendar/ReadCover.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Cover } from '../components/ui/Cover.jsx';
import { Dialog } from '../components/ui/Dialog.jsx';
import { ErrorNote } from '../components/ui/ErrorNote.jsx';
import { Select } from '../components/ui/Input.jsx';
import { Segmented } from '../components/ui/Segmented.jsx';
import { Spinner } from '../components/ui/Spinner.jsx';
import { Switch } from '../components/ui/Switch.jsx';
import { useReadings } from '../hooks/queries.js';
import { cn, formatDate, MONTH_NAMES } from '../lib/utils.js';

const WEEKDAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const pad = (n) => String(n).padStart(2, '0');

/** Các ô của một tháng, tuần bắt đầu từ thứ Hai; null là ô trống đầu/cuối tháng. */
function monthCells(year, month) {
  const lead = (new Date(year, month - 1, 1).getDay() + 6) % 7;
  const days = new Date(year, month, 0).getDate();
  return [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
}

function DayList({ day, reads, onClose }) {
  const navigate = useNavigate();
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()} title={`Đọc xong ngày ${formatDate(day)}`} description={`${reads.length} lượt đọc`} size="sm">
      <ul className="flex flex-col gap-3">
        {reads.map((read) => (
          <li key={`${read.card_id}-${read.item_id}`}>
            <button type="button" onClick={() => navigate(`/books/${read.item_id}?tab=card`)} className="flex w-full items-center gap-3 rounded-lg p-1.5 text-left hover:bg-surface-2">
              <span className="w-12 shrink-0"><Cover src={read.cover_image} title={read.title} /></span>
              <span className="min-w-0">
                <span className="block font-display text-base leading-snug">{read.title}</span>
                <span className="block text-sm text-ink-muted">{read.author || 'Chưa có tác giả'}</span>
                <span className="mt-1 flex flex-wrap gap-1.5 text-xs">
                  {read.is_reread && <span className="rounded-full bg-honey/80 px-2 py-0.5 text-[#3b2a10]">Re-read, lượt {read.read_number}</span>}
                  {read.state === 'dnf' && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-ink-muted">Bỏ dở</span>}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}

function MonthGrid({ year, month, byDay, onDay, compact }) {
  const navigate = useNavigate();
  return (
    <div role="grid" aria-label={`${MONTH_NAMES[month - 1]} ${year}`}>
      <div className="grid grid-cols-7 gap-px text-center text-xs text-ink-muted">
        {WEEKDAYS.map((name) => <span key={name} className="py-1">{name}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-px rounded-lg bg-line/60 p-px">
        {monthCells(year, month).map((day, index) => {
          if (!day) return <span key={`blank-${index}`} className="bg-paper/60" />;
          const key = `${year}-${pad(month)}-${pad(day)}`;
          const reads = byDay.get(key) ?? [];
          const first = reads[0];
          return (
            <div key={key} role="gridcell" className={cn('relative bg-surface p-1', compact ? 'min-h-[44px]' : 'min-h-[104px]')}>
              <span className={cn('text-ink-muted', compact ? 'text-[10px]' : 'text-xs')}>{day}</span>
              {first && (
                <button
                  type="button"
                  onClick={() => (reads.length > 1 ? onDay(key, reads) : navigate(`/books/${first.item_id}?tab=card`))}
                  className={cn('mx-auto mt-0.5 block', compact ? 'w-4' : 'w-12')}
                  aria-label={reads.length > 1 ? `${reads.length} sách ngày ${key}` : `${first.title}${first.is_reread ? ', re-read' : ''}`}
                  title={reads.map((read) => read.title).join(', ')}
                >
                  <ReadCover read={first} count={reads.length} small={compact} />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function CalendarPage() {
  const [params, setParams] = useSearchParams();
  const now = new Date();
  const year = params.get('year') ? Number(params.get('year')) : now.getFullYear();
  const month = params.get('month') ? Number(params.get('month')) : now.getMonth() + 1;
  const view = params.get('view') === 'year' ? 'year' : 'month';
  const [showDnf, setShowDnf] = useState(true);
  const [dayDialog, setDayDialog] = useState(null);
  const { data, error, isPending } = useReadings(year);

  const go = (patch) => setParams((current) => { const next = new URLSearchParams(current); Object.entries(patch).forEach(([k, v]) => next.set(k, String(v))); return next; }, { replace: true });
  const shift = (delta) => {
    const index = year * 12 + (month - 1) + delta;
    go({ year: Math.floor(index / 12), month: (index % 12) + 1 });
  };

  const { byDay, yearOnly, total } = useMemo(() => {
    const map = new Map();
    const noDay = [];
    let count = 0;
    for (const read of data?.reads ?? []) {
      if (read.state === 'dnf' && !showDnf) continue;
      if (!read.finish_date) { noDay.push(read); continue; }
      map.set(read.finish_date, [...(map.get(read.finish_date) ?? []), read]);
      count += 1;
    }
    return { byDay: map, yearOnly: noDay, total: count };
  }, [data, showDnf]);

  if (error) return <ErrorNote error={error} className="mt-6" />;
  if (isPending || !data) return <div className="flex items-center gap-2 py-24 text-ink-muted" role="status"><Spinner /> Đang tải lịch</div>;

  const monthTotal = [...byDay].filter(([day]) => Number(day.slice(5, 7)) === month).reduce((sum, [, reads]) => sum + reads.length, 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-medium tracking-tight sm:text-5xl">Lịch đọc</h1>
          <p className="mt-1 text-sm text-ink-muted">{data.rules}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Segmented label="Kiểu xem" value={view} onChange={(value) => go({ view: value })} options={[{ value: 'month', label: 'Tháng' }, { value: 'year', label: 'Cả năm' }]} />
          <Select value={year} onChange={(event) => go({ year: event.target.value })} aria-label="Chọn năm" className="w-24">
            {[...new Set([...data.years, year])].sort((a, b) => b - a).map((entry) => <option key={entry} value={entry}>{entry}</option>)}
          </Select>
          {view === 'month' && (
            <>
              <Button variant="ghost" size="icon" onClick={() => shift(-1)} aria-label="Tháng trước"><ChevronLeft size={18} /></Button>
              <Select value={month} onChange={(event) => go({ month: event.target.value })} aria-label="Chọn tháng" className="w-32">
                {MONTH_NAMES.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}
              </Select>
              <Button variant="ghost" size="icon" onClick={() => shift(1)} aria-label="Tháng sau"><ChevronRight size={18} /></Button>
            </>
          )}
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={showDnf} onCheckedChange={setShowDnf} aria-label="Hiện sách bỏ dở" /> Hiện sách bỏ dở
          </label>
        </div>
      </div>

      <p className="text-sm text-ink-muted" role="status">
        {view === 'month' ? `${MONTH_NAMES[month - 1]} ${year}: ${monthTotal} lượt đọc` : `Năm ${year}: ${total} lượt đọc có ngày`}. Dấu ↻ là re-read; bìa mờ nét đứt là sách bỏ dở.
      </p>

      {view === 'month' ? (
        <MonthGrid year={year} month={month} byDay={byDay} onDay={(day, reads) => setDayDialog({ day, reads })} />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {MONTH_NAMES.map((name, index) => (
            <section key={name} className="rounded-2xl border border-line bg-surface/80 p-3">
              <button type="button" onClick={() => go({ view: 'month', month: index + 1 })} className="mb-2 font-display text-lg hover:underline">{name}</button>
              <MonthGrid year={year} month={index + 1} byDay={byDay} onDay={(day, reads) => setDayDialog({ day, reads })} compact />
            </section>
          ))}
        </div>
      )}

      {(yearOnly.length > 0 || data.undated.finished + data.undated.dnf > 0) && (
        <section className="rounded-2xl border border-line bg-surface/80 p-4 text-sm">
          <h2 className="font-display text-lg">Chưa đặt lên lịch được</h2>
          {yearOnly.length > 0 && (
            <p className="mt-1 text-ink-muted">
              {yearOnly.length} lượt năm {year} chỉ biết năm: {yearOnly.map((read) => read.title).join(', ')}.
            </p>
          )}
          {data.undated.finished + data.undated.dnf > 0 && (
            <p className="mt-1 text-ink-muted">
              {data.undated.finished} lượt đã xong và {data.undated.dnf} lượt bỏ dở không có ngày nào nên không thuộc năm nào. Bổ sung ngày ở tab Thẻ thư viện của sách.
            </p>
          )}
        </section>
      )}

      {dayDialog && <DayList day={dayDialog.day} reads={dayDialog.reads} onClose={() => setDayDialog(null)} />}
    </div>
  );
}
