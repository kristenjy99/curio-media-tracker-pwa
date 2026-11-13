import { useSearchParams } from 'react-router-dom';
import { InsightSections } from '../components/dashboard/InsightSections.jsx';
import { CategoryChart } from '../components/dashboard/CategoryChart.jsx';
import { ReadingHeatmap } from '../components/dashboard/ReadingHeatmap.jsx';
import { ErrorNote } from '../components/ui/ErrorNote.jsx';
import { Select } from '../components/ui/Input.jsx';
import { Spinner } from '../components/ui/Spinner.jsx';
import { useDashboard } from '../hooks/queries.js';
import { cn, formatDate } from '../lib/utils.js';

function Kpi({ label, value, note, className, children }) {
  return (
    <div className={cn('flex flex-col gap-1.5 rounded-2xl border border-line bg-surface/80 p-5', className)}>
      <span className="text-sm text-ink-muted">{label}</span>
      <span className="font-display text-4xl font-medium tabular-nums leading-none">{value}</span>
      {note && <span className="text-xs text-ink-muted">{note}</span>}
      {children}
    </div>
  );
}

function Panel({ title, note, children }) {
  return (
    <section className="rounded-2xl border border-line bg-surface/80 p-5">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="font-display text-xl font-medium">{title}</h2>
        {note && <p className="text-xs text-ink-muted">{note}</p>}
      </div>
      {children}
    </section>
  );
}

function streakNote(streak) {
  if (!streak.last_read_date) return 'Chưa có log đọc nào';
  if (streak.current === 0) return `Đứt từ ${formatDate(streak.last_read_date)}`;
  return streak.active_today ? 'Hôm nay đã ghi log' : 'Hôm nay chưa ghi log, ghi để giữ chuỗi';
}

export function DashboardPage() {
  const [params, setParams] = useSearchParams();
  const year = params.get('year') ? Number(params.get('year')) : undefined;
  const { data, error, isPending } = useDashboard(year);

  if (error) return <ErrorNote error={error} className="mt-6" />;
  if (isPending || !data) {
    return (
      <div className="flex items-center gap-2 py-24 text-ink-muted" role="status">
        <Spinner /> Đang tính thống kê
      </div>
    );
  }

  const { totals, short_fanfic: shortFanfic, streak, heatmap } = data;
  const setYear = (value) => {
    setParams(value ? { year: value } : {}, { replace: true });
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-medium tracking-tight sm:text-5xl">Thống kê đọc</h1>
          <p className="mt-1 text-sm text-ink-muted">Tính theo lượt đọc đã xong; lượt chỉ biết năm được tính vào năm đó.</p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-ink-muted">Năm</span>
          <Select value={data.year} onChange={(event) => setYear(event.target.value)} aria-label="Chọn năm thống kê" className="w-28">
            {data.years.map((entry) => (
              <option key={entry} value={entry}>{entry}</option>
            ))}
          </Select>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label={`Đã đọc xong năm ${data.year}`} value={totals.total} note={shortFanfic.total ? `Chưa tính ${shortFanfic.total} fanfic ngắn (≤ 80.000 chữ), news, research paper` : 'Gồm first-read và re-read'} />
        <Kpi label="First-read" value={totals.first_read} note="Lượt đọc đầu tiên của sách" />
        <Kpi label="Re-read" value={totals.re_read} note="Từ lượt đọc thứ hai trở đi" />
        <Kpi label="Streak đọc liên tục" value={<span><span aria-hidden>🐾 </span>{streak.current} ngày</span>} note={streakNote(streak)}>
          <span className="text-xs text-ink-muted">Dài nhất: <span className="tabular-nums">{streak.longest}</span> ngày</span>
        </Kpi>
      </div>

      <Panel title="Theo thể loại" note="Fanfic ngắn, News và Research Paper là nhóm riêng, không cộng vào tổng ở trên">
        {data.by_category.every((row) => row.total === 0) ? (
          <p className="py-10 text-center text-sm text-ink-muted">Năm {data.year} chưa có lượt đọc nào đã xong.</p>
        ) : (
          <CategoryChart rows={data.by_category} />
        )}
      </Panel>

      <Panel title={`Lịch đọc ${data.year}`} note={`${heatmap.active_days} ngày có ghi log`}>
        <ReadingHeatmap year={data.year} days={heatmap.days} />
      </Panel>

      <InsightSections stats={data.stats} year={data.year} />
    </div>
  );
}
