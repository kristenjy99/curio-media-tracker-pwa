import { translate } from '../../i18n/translator.js';
import { Bar, BarChart, Cell, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CATEGORY_LABELS } from '../../lib/labels.js';

const LABELS = { ...CATEGORY_LABELS, 'Fanfic ngắn': 'Fanfic ngắn / News / Paper (riêng)' };
const SEPARATE = 'Fanfic ngắn';
const TICK = { fill: 'var(--ink-muted)', fontSize: 13 };

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-sm shadow-lg">
      <div className="mb-1 font-medium">{label}</div>
      <div className="text-ink-muted">First-read: <span className="tabular-nums text-ink">{row.first_read}</span></div>
      <div className="text-ink-muted">Re-read: <span className="tabular-nums text-ink">{row.re_read}</span></div>
      <div className="mt-1 border-t border-line pt-1 text-ink-muted">Tổng: <span className="font-semibold tabular-nums text-ink">{row.total}</span></div>
    </div>
  );
}

/** Cột chồng ngang theo category: First-read (xanh rêu) và Re-read (vàng mật). */
export function CategoryChart({ rows }) {
  const data = rows.map((row) => ({ ...row, name: LABELS[row.category] ?? row.category }));
  const summary = data.map((row) => `${row.name}: ${row.total}`).join(', ');
  return (
    <div role="img" aria-label={`Số lượt đọc xong theo thể loại. ${summary}`} className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 8 }} barCategoryGap="28%">
          <CartesianGrid horizontal={false} stroke="var(--line)" />
          <XAxis type="number" allowDecimals={false} domain={[0, (max) => Math.max(2, max)]} tick={TICK} stroke="var(--line)" />
          <YAxis type="category" dataKey="name" width={136} tick={{ ...TICK, fill: 'var(--ink)' }} tickFormatter={(value) => translate(value)} stroke="var(--line)" />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--surface-2)', opacity: 0.6 }} />
          <Legend verticalAlign="top" align="right" iconType="square" wrapperStyle={{ fontSize: 13 }} formatter={(value) => <span style={{ color: 'var(--ink)' }}>{value}</span>} />
          <Bar dataKey="first_read" name="First-read" stackId="reads" fill="var(--moss)" isAnimationActive={false}>
            {data.map((row) => <Cell key={row.category} fillOpacity={row.category === SEPARATE ? 0.5 : 1} />)}
          </Bar>
          <Bar dataKey="re_read" name="Re-read" stackId="reads" fill="var(--honey)" isAnimationActive={false}>
            {data.map((row) => <Cell key={row.category} fillOpacity={row.category === SEPARATE ? 0.5 : 1} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
