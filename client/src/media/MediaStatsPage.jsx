import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useSearchParams } from 'react-router-dom';
import { BarCard, DeltaTable, Panel, PieCard, RatingTable } from '../components/dashboard/InsightSections.jsx';
import { ErrorNote } from '../components/ui/ErrorNote.jsx';
import { Select } from '../components/ui/Input.jsx';
import { Spinner } from '../components/ui/Spinner.jsx';
import { cn } from '../lib/utils.js';
import { MEDIA_STATUS_LABELS, categoryLabel } from './mediaConfig.js';
import { useMediaStats } from './queries.js';

const TICK = { fill: 'var(--ink-muted)', fontSize: 13 };
const SERIES = [
  { key: 'finished', name: MEDIA_STATUS_LABELS.Finished, fill: 'var(--moss)' },
  { key: 'dnf', name: MEDIA_STATUS_LABELS.DNF, fill: 'var(--honey)' },
  { key: 'watching', name: MEDIA_STATUS_LABELS.Watching, fill: '#4e7a78' },
];

function Kpi({ label, value, note }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-2xl border border-line bg-surface/80 p-5">
      <span className="text-sm text-ink-muted">{label}</span>
      <span className="font-display text-4xl font-medium tabular-nums leading-none">{value}</span>
      {note && <span className="text-xs text-ink-muted">{note}</span>}
    </div>
  );
}

/** Cột chồng ngang theo category: Đã xem, Bỏ dở, Đang xem. */
function CategoryChart({ rows }) {
  const data = rows.map((row) => ({ ...row, name: categoryLabel(row.category) }));
  const summary = data.map((row) => `${row.name}: ${row.total}`).join(', ');
  return (
    <div role="img" aria-label={`Số media theo category. ${summary}`} className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 8 }} barCategoryGap="28%">
          <CartesianGrid horizontal={false} stroke="var(--line)" />
          <XAxis type="number" allowDecimals={false} domain={[0, (max) => Math.max(2, max)]} tick={TICK} stroke="var(--line)" />
          <YAxis type="category" dataKey="name" width={110} tick={{ ...TICK, fill: 'var(--ink)' }} stroke="var(--line)" />
          <Tooltip cursor={{ fill: 'var(--surface-2)', opacity: 0.6 }} />
          <Legend verticalAlign="top" align="right" iconType="square" wrapperStyle={{ fontSize: 13 }} formatter={(value) => <span style={{ color: 'var(--ink)' }}>{value}</span>} />
          {SERIES.map((serie) => (
            <Bar key={serie.key} dataKey={serie.key} name={serie.name} stackId="media" fill={serie.fill} isAnimationActive={false} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function ItemList({ items }) {
  if (items.length === 0) return <p className="py-8 text-center text-sm text-ink-muted">Chưa có media nào trong năm này.</p>;
  return (
    <ul className="divide-y divide-line/50 text-sm">
      {items.map((item) => (
        <li key={item.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2">
          <span className="min-w-0 flex-1 font-medium">{item.title}</span>
          <span className="text-ink-muted">{categoryLabel(item.category)}</span>
          <span className={cn('w-16 text-right', item.status === 'Finished' ? 'text-moss' : item.status === 'DNF' ? 'text-ink-muted' : 'text-ink')}>{MEDIA_STATUS_LABELS[item.status]}</span>
          <span className="w-14 text-right tabular-nums">{item.rating ? `${item.rating} ★` : <span className="text-ink-muted">—</span>}</span>
        </li>
      ))}
    </ul>
  );
}

export function MediaStatsPage() {
  const [params, setParams] = useSearchParams();
  const year = params.get('year') ? Number(params.get('year')) : undefined;
  const { data, error, isPending } = useMediaStats(year);

  if (error) return <ErrorNote error={error} className="mt-6" />;
  if (isPending || !data) {
    return (
      <div className="flex items-center gap-2 py-24 text-ink-muted" role="status">
        <Spinner /> Đang tính thống kê
      </div>
    );
  }

  const { totals, undated, stats, comparison, by_category: byCategory } = data;
  const ratingBy = stats.rating_by;
  const setYear = (value) => setParams(value ? { year: value } : {}, { replace: true });
  const undatedNote = [undated.done && `${undated.done} media đã xem/bỏ dở chưa có năm xem xong`, undated.watching && `${undated.watching} media đang xem chưa có năm bắt đầu (chỉ tính vào năm hiện tại)`].filter(Boolean).join('; ');

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-medium tracking-tight sm:text-5xl">Thống kê xem</h1>
          <p className="mt-1 text-sm text-ink-muted">Đã xem và bỏ dở tính theo năm xem xong; đang xem tính từ năm bắt đầu đến năm hiện tại.{undatedNote && ` Chưa tính: ${undatedNote}.`}</p>
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
        <Kpi label={`Đã xem xong năm ${data.year}`} value={totals.finished} note="Trạng thái Đã xem" />
        <Kpi label="Bỏ dở" value={totals.dnf} note="Trạng thái Bỏ dở, có năm xem xong" />
        <Kpi label="Đang xem" value={totals.watching} note="Tính riêng, không cộng vào Đã xem" />
        <Kpi label="Điểm trung bình" value={totals.average_rating !== null ? `${totals.average_rating.toFixed(2)} ★` : '—'} note={`${totals.rated} media đã chấm (đã xem + bỏ dở)`} />
      </div>

      <Panel title="Theo category" note="Đang xem là nhóm riêng, hiển thị cùng biểu đồ để so sánh">
        {byCategory.every((row) => row.total === 0) ? <p className="py-10 text-center text-sm text-ink-muted">Năm {data.year} chưa có media nào.</p> : <CategoryChart rows={byCategory} />}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Thể loại (genres)" note="Chỉ tính media đã xem và bỏ dở; media nhiều thể loại tính cho từng thể loại.">
          <PieCard rows={stats.genres} maxSlices={5} showRest />
        </Panel>
        <Panel title="Quốc gia" note="Chỉ tính media đã xem và bỏ dở.">
          <PieCard rows={stats.countries} />
        </Panel>
      </div>

      <Panel title="Đánh giá" note={`Điểm trung bình theo nhóm chỉ hiện khi có ít nhất ${ratingBy.min_group} media đã chấm.`}>
        <div className="grid gap-6 lg:grid-cols-3">
          <div>
            <h3 className="mb-1 text-sm font-medium">Phân bố số sao</h3>
            <BarCard rows={stats.rating_distribution} height={200} />
          </div>
          <RatingTable unit="media" title="Theo category" rows={ratingBy.category} min={ratingBy.min_group} labelOf={categoryLabel} />
          <RatingTable unit="media" title="Theo thể loại" rows={ratingBy.genre} min={ratingBy.min_group} />
        </div>
      </Panel>

      <Panel title="Đã xem / đang xem trong năm" note="Đang xem trước, rồi đã xem, rồi bỏ dở">
        <ItemList items={data.items} />
      </Panel>

      <Panel title={`So với năm ${comparison.previous_year}`} note="Chênh lệch = năm này − năm trước; phần trăm theo năm trước.">
        <DeltaTable headers={['Chỉ số', String(data.year), String(comparison.previous_year), 'Chênh', '%']} rows={comparison.rows.map((row) => ({ label: row.label, current: row.current, base: row.previous, diff: row.diff, pct: row.pct }))} />
      </Panel>
    </div>
  );
}
