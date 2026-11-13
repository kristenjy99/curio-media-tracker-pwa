import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useState } from 'react';
import { CATEGORY_LABELS } from '../../lib/labels.js';
import { cn } from '../../lib/utils.js';
import { Segmented } from '../ui/Segmented.jsx';

const COLORS = ['#3f6b4e', '#d9a94e', '#4e7a78', '#9dbf96', '#8a5a3c', '#6e7f3e', '#2c4a52', '#b9cfa8', '#6b4a45'];
const TICK = { fill: 'var(--ink-muted)', fontSize: 12 };

export function Panel({ title, note, children, className }) {
  return (
    <section className={cn('rounded-2xl border border-line bg-surface/80 p-5', className)}>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="font-display text-xl font-medium">{title}</h2>
        {note && <p className="max-w-xl text-xs text-ink-muted">{note}</p>}
      </div>
      {children}
    </section>
  );
}

const Empty = () => <p className="py-8 text-center text-sm text-ink-muted">Chưa có dữ liệu trong năm này.</p>;

/** Biểu đồ tròn kèm chú giải dạng danh sách (đọc được cả khi không nhìn màu). rows: [{ name, count }]. */
export function PieCard({ rows, maxSlices = 8, labelOf = (name) => name, showRest = false }) {
  const data = rows.filter((row) => row.count > 0);
  const [restOpen, setRestOpen] = useState(false);
  if (!data.length) return <Empty />;
  const head = data.slice(0, maxSlices);
  const rest = data.slice(maxSlices).reduce((sum, row) => sum + row.count, 0);
  const slices = rest ? [...head, { name: 'Khác', count: rest }] : head;
  const total = slices.reduce((sum, row) => sum + row.count, 0);
  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="h-44 w-44 shrink-0" role="img" aria-label={slices.map((row) => `${labelOf(row.name)}: ${row.count}`).join(', ')}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={slices} dataKey="count" nameKey="name" innerRadius={38} outerRadius={80} stroke="var(--surface)" isAnimationActive={false}>
              {slices.map((row, index) => <Cell key={row.name} fill={COLORS[index % COLORS.length]} />)}
            </Pie>
            <Tooltip formatter={(value, name) => [value, labelOf(name)]} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="min-w-[160px] flex-1 text-sm">
        {slices.map((row, index) => (
          <li key={row.name} className="flex items-center gap-2 py-0.5">
            <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: COLORS[index % COLORS.length] }} aria-hidden />
            <span className="truncate">{labelOf(row.name)}</span>
            <span className="ml-auto tabular-nums text-ink-muted">{row.count} · {Math.round((row.count / total) * 100)}%</span>
          </li>
        ))}
        {showRest && rest > 0 && (
          <li className="pt-1">
            <button type="button" onClick={() => setRestOpen(!restOpen)} aria-expanded={restOpen} className="text-xs font-medium text-moss hover:underline">
              {restOpen ? 'Thu gọn' : `Xem thêm ${data.length - head.length} mục trong “Khác”`}
            </button>
            {restOpen && (
              <ul className="mt-1 border-l border-line pl-3">
                {data.slice(maxSlices).map((row) => (
                  <li key={row.name} className="flex items-center gap-2 py-0.5">
                    <span className="truncate">{labelOf(row.name)}</span>
                    <span className="ml-auto tabular-nums text-ink-muted">{row.count} · {Math.round((row.count / total) * 100)}%</span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        )}
      </ul>
    </div>
  );
}

export function BarCard({ rows, color = 'var(--moss)', height = 220 }) {
  if (!rows.some((row) => row.count > 0)) return <Empty />;
  return (
    <div className="w-full" style={{ height }} role="img" aria-label={rows.map((row) => `${row.name}: ${row.count}`).join(', ')}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 4, right: 8, bottom: 4, left: -16 }}>
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis dataKey="name" tick={TICK} stroke="var(--line)" interval={0} />
          <YAxis allowDecimals={false} tick={TICK} stroke="var(--line)" />
          <Tooltip cursor={{ fill: 'var(--surface-2)', opacity: 0.6 }} />
          <Bar dataKey="count" name="Số lượt" fill={color} isAnimationActive={false} radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Hiện `limit` dòng đầu, phần còn lại nằm sau nút "Xem thêm". limit = Infinity để hiện tất cả. */
export function useCutRows(rows, limit) {
  const [expanded, setExpanded] = useState(false);
  const hidden = Number.isFinite(limit) ? Math.max(0, rows.length - limit) : 0;
  const visible = expanded || !hidden ? rows : rows.slice(0, limit);
  const toggle = hidden > 0 && (
    <button type="button" onClick={() => setExpanded(!expanded)} aria-expanded={expanded} className="mt-1 text-xs font-medium text-moss hover:underline">
      {expanded ? 'Thu gọn' : `Xem thêm ${hidden}`}
    </button>
  );
  return { visible, toggle };
}

export function RatingTable({ title, rows, min, limit = 5, unit = 'sách', labelOf = (name) => name, symbol = '★' }) {
  const { visible, toggle } = useCutRows(rows, limit);
  return (
    <div>
      <h3 className="mb-1 text-sm font-medium">{title}</h3>
      {rows.length === 0 ? <p className="text-sm text-ink-muted">Chưa có dữ liệu.</p> : (
        <>
          <table className="w-full text-sm">
            <tbody>
              {visible.map((row) => (
                <tr key={row.name} className="border-b border-line/50 last:border-0">
                  <td className="py-1 pr-2">{labelOf(row.name)}</td>
                  <td className="py-1 text-right tabular-nums text-ink-muted">{row.count} {unit}</td>
                  <td className="w-20 py-1 text-right tabular-nums">
                    {row.average !== null ? `${row.average.toFixed(2)} ${symbol}` : <span className="text-ink-muted" title={`Cần ít nhất ${min} ${unit} đã chấm điểm (đang có ${row.rated})`}>—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {toggle}
        </>
      )}
    </div>
  );
}

const SCOPE_OPTIONS = [
  { value: 'all', label: 'Tất cả' },
  { value: 'Fanfiction', label: 'Fanfiction' },
  { value: 'Fiction', label: 'Fiction' },
  { value: 'Nonfiction', label: 'Nonfiction' },
];

/** Bộ lọc thể loại cho một panel; chọn 'all' thì dùng số liệu tổng. */
function ScopeFilter({ value, onChange, label }) {
  return <Segmented size="sm" label={label} value={value} onChange={onChange} options={SCOPE_OPTIONS} className="mb-3" />;
}

const fmt = (value) => (value === null || value === undefined ? '—' : Number(value).toLocaleString('vi-VN'));
const signed = (value) => (value > 0 ? `+${fmt(value)}` : fmt(value));
const pctText = (value) => (value === null ? 'không so sánh được' : `${value > 0 ? '+' : ''}${value.toLocaleString('vi-VN')}%`);

export function DeltaTable({ rows, headers }) {
  return (
    <table className="w-full text-sm">
      <thead className="text-ink-muted">
        <tr>{headers.map((header, index) => <th key={header} scope="col" className={cn('py-1 font-medium', index ? 'text-right' : 'text-left')}>{header}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.label} className="border-t border-line/50">
            <td className="py-1.5">{row.label}</td>
            <td className="text-right tabular-nums">{fmt(row.current)}</td>
            <td className="text-right tabular-nums">{fmt(row.base)}</td>
            <td className="text-right tabular-nums">{signed(row.diff)}</td>
            <td className="text-right tabular-nums text-ink-muted">{pctText(row.pct)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const METRIC_LABEL = { books: 'Số sách', pages: 'Số trang', hours: 'Số giờ' };

export function InsightSections({ stats, year }) {
  const { behavior, comparison, rating_by: ratingBy, data_quality: quality } = stats;
  const dnf = behavior.dnf;
  const [genreScope, setGenreScope] = useState('all');
  const [authorScope, setAuthorScope] = useState('all');
  const [ratingScope, setRatingScope] = useState('all');
  const [ratingMetric, setRatingMetric] = useState('stars');
  const genres = genreScope === 'all' ? stats.genres.rows : stats.by_scope[genreScope].genres;
  const authors = authorScope === 'all' ? stats.authors : stats.by_scope[authorScope].authors;
  const rating = ratingScope === 'all'
    ? { distribution: stats.rating_distribution, ...ratingBy }
    : { distribution: stats.by_scope[ratingScope].rating_distribution, ...stats.by_scope[ratingScope].rating_by };
  const spice = ratingScope === 'all' ? stats.spice : stats.by_scope[ratingScope].spice;
  const shown = ratingMetric === 'spice' && spice ? { distribution: spice.distribution, genre: spice.genre, format: spice.format, author: spice.author } : rating;
  const symbol = ratingMetric === 'spice' ? '🌶️' : '★';
  const fanfic = stats.fanfic;
  return (
    <>
      <p className="-mb-2 text-xs text-ink-muted">{stats.basis}</p>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Phân bố thể loại (genre/tag)" note={stats.genres.rule}><ScopeFilter label="Lọc genre theo thể loại chính" value={genreScope} onChange={setGenreScope} /><PieCard rows={genres} maxSlices={5} showRest /></Panel>
        <Panel title="Fiction / Nonfiction" note="Theo thể loại chính của sách."><PieCard rows={stats.categories} labelOf={(name) => CATEGORY_LABELS[name] ?? name} /></Panel>
        <Panel title="Top tác giả" note="Sách nhiều tác giả (ngăn bằng dấu phẩy) tính cho từng tác giả."><ScopeFilter label="Lọc tác giả theo thể loại chính" value={authorScope} onChange={setAuthorScope} /><PieCard rows={authors} maxSlices={6} /></Panel>
        {fanfic.count > 0 && (
          <Panel title="Fanfiction: fandom & pairing" note={fanfic.rule} className="lg:col-span-2">
            <div className="grid gap-6 sm:grid-cols-2">
              <RatingTable title={`Fandom (${fanfic.count} fic)`} rows={fanfic.fandoms} min={ratingBy.min_group} limit={Infinity} />
              <RatingTable title="Pairing / Ship" rows={fanfic.pairings} min={ratingBy.min_group} />
            </div>
          </Panel>
        )}
        <Panel title="Ngôn ngữ"><PieCard rows={stats.languages} /></Panel>
        <Panel title="Độ dài sách" note="Theo số trang; sách tính bằng chương/volume nằm ở “Chưa có số trang”."><BarCard rows={stats.lengths} /></Panel>
      </div>

      <Panel title="Đánh giá" note={ratingBy.rule}>
        <div className="flex flex-wrap items-center gap-3">
          <ScopeFilter label="Lọc đánh giá theo thể loại chính" value={ratingScope} onChange={setRatingScope} />
          <Segmented
            size="sm"
            label="Loại đánh giá"
            value={ratingMetric}
            onChange={setRatingMetric}
            options={[
              { value: 'stars', label: 'Điểm sao ★' },
              { value: 'spice', label: 'Độ spicy 🌶️' },
            ]}
          />
        </div>
        {ratingMetric === 'spice' && (
          <p className="text-xs text-ink-muted">
            Chỉ tính sách có tag smut: {spice?.count ?? 0} lượt đọc, {spice?.rated ?? 0} lượt có độ spicy. Bảng theo thể loại không tính chính tag smut.
          </p>
        )}
        <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
          <div>
            <h3 className="mb-1 text-sm font-medium">{ratingMetric === 'spice' ? 'Phân bố độ spicy' : 'Phân bố rating'}</h3>
            <BarCard rows={shown.distribution} height={200} color={ratingMetric === 'spice' ? '#d9482b' : undefined} />
          </div>
          <div className="grid gap-6 sm:grid-cols-3">
            <RatingTable title="Theo thể loại" rows={shown.genre} min={ratingBy.min_group} symbol={symbol} />
            <RatingTable title="Theo format" rows={shown.format} min={ratingBy.min_group} symbol={symbol} />
            <RatingTable title="Theo tác giả" rows={shown.author} min={ratingBy.min_group} symbol={symbol} />
          </div>
        </div>
      </Panel>

      <Panel title="Hành vi đọc">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <div className="text-sm text-ink-muted">Tỉ lệ bỏ dở (DNF) năm {year}</div>
            <div className="font-display text-3xl tabular-nums">{dnf.year_rate === null ? '—' : `${dnf.year_rate}%`}</div>
            <p className="text-xs text-ink-muted">{dnf.year_dnf} bỏ dở / {dnf.year_dnf + dnf.year_finished} lượt kết thúc. Toàn thời gian: {dnf.all_time_rate === null ? '—' : `${dnf.all_time_rate}%`} ({dnf.all_time_dnf} sách). {dnf.rule}</p>
          </div>
          <div>
            <div className="text-sm text-ink-muted">TBR → đã đọc</div>
            <div className="font-display text-3xl tabular-nums">{behavior.tbr_to_read.count}</div>
            <p className="text-xs text-ink-muted">{behavior.tbr_to_read.rule}</p>
          </div>
          <div>
            <div className="text-sm text-ink-muted">Số lần re-read</div>
            <div className="font-display text-3xl tabular-nums">{behavior.rereads}</div>
            <p className="text-xs text-ink-muted">Lượt đọc từ lần thứ hai trở đi, đã xong trong năm.</p>
          </div>
        </div>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title={`So với năm ${comparison.previous_year}`} note="Chênh lệch = năm này − năm trước; phần trăm theo năm trước.">
          <DeltaTable headers={['Chỉ số', String(year), String(comparison.previous_year), 'Chênh', '%']} rows={comparison.rows.map((row) => ({ label: row.label, current: row.current, base: row.previous, diff: row.diff, pct: row.pct }))} />
        </Panel>
        <Panel title="So với mục tiêu" note="Chênh lệch = đã đạt − mục tiêu; phần trăm theo mục tiêu.">
          {stats.vs_goal.length === 0 ? (
            <p className="text-sm text-ink-muted">Chưa đặt mục tiêu cho năm {year}. Đặt ở trang Mục tiêu.</p>
          ) : (
            <DeltaTable headers={['Chỉ số', 'Đã đạt', 'Mục tiêu', 'Chênh', '%']} rows={stats.vs_goal.map((row) => ({ label: METRIC_LABEL[row.metric], current: row.current, base: row.target, diff: row.diff, pct: row.pct }))} />
          )}
        </Panel>
      </div>

      <p className="text-xs text-ink-muted">
        Dữ liệu thiếu: {quality.pages_missing} sách không có số trang, {quality.no_rating} chưa chấm, {quality.no_genre} chưa có tag, {quality.no_language} chưa có ngôn ngữ, {quality.undated_finished} lượt đã xong không có ngày/năm. {quality.note}
      </p>
    </>
  );
}
