import { useState } from 'react';
import { useGoals, useMutate } from '../../hooks/queries.js';
import { cn } from '../../lib/utils.js';
import { Button } from '../ui/Button.jsx';
import { ErrorNote } from '../ui/ErrorNote.jsx';
import { Input } from '../ui/Input.jsx';

const LABELS = { books: 'Số sách', pages: 'Số trang', hours: 'Số giờ' };
const STATUS = {
  ahead: ['Vượt kế hoạch', 'bg-sage/50'],
  on_track: ['Đúng kế hoạch', 'bg-surface-2'],
  behind: ['Chậm kế hoạch', 'bg-honey/60'],
  done: ['Đã đạt mục tiêu', 'bg-moss text-on-moss'],
  missed: ['Không đạt', 'bg-surface-2'],
  not_started: ['Chưa bắt đầu', 'bg-surface-2'],
};
const num = (value) => Number(value).toLocaleString('vi-VN');

function GoalCard({ metric, goal, year, unit }) {
  const [target, setTarget] = useState(goal?.target ?? '');
  const save = useMutate(['goals', 'dashboard']);
  const dirty = Number(target) > 0 && Number(target) !== goal?.target;
  const [label, tone] = goal ? STATUS[goal.status] : [];
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface/80 p-5">
      <div className="flex items-baseline justify-between">
        <h3 className="font-display text-xl">{LABELS[metric]}</h3>
        {goal && <span className={cn('rounded-full px-2.5 py-0.5 text-xs', tone)}>{label}</span>}
      </div>
      <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); if (dirty) save.mutate({ method: 'put', path: '/goals', body: { year, metric, target: Number(target) } }); }}>
        <Input type="number" min="1" step="any" value={target} onChange={(event) => setTarget(event.target.value)} aria-label={`Mục tiêu ${LABELS[metric].toLowerCase()} năm ${year}`} placeholder={`Mục tiêu (${unit})`} />
        <Button type="submit" variant="primary" disabled={!dirty || save.isPending}>Lưu</Button>
        {goal && <Button variant="ghost" onClick={() => save.mutate({ method: 'delete', path: `/goals/${goal.id}` })} aria-label="Xoá mục tiêu">Xoá</Button>}
      </form>
      {save.error && <ErrorNote error={save.error} />}
      {goal && (
        <>
          <div className="h-3 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={Math.min(goal.percent, 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`Tiến độ ${LABELS[metric].toLowerCase()}`}>
            <div className="h-full rounded-full bg-moss" style={{ width: `${Math.min(goal.percent, 100)}%` }} />
          </div>
          <p className="text-sm tabular-nums">{num(goal.current)} / {num(goal.target)} {unit} ({goal.percent}%)</p>
          <ul className="text-sm text-ink-muted">
            <li>Kế hoạch đến hôm nay: {num(goal.expected)} {unit}; {goal.gap >= 0 ? 'vượt' : 'thiếu'} {num(Math.abs(goal.gap))} {unit}.</li>
            {goal.remaining > 0 && year >= new Date().getFullYear() && <li>Cần khoảng {num(goal.per_month)} {unit}/tháng, {num(goal.per_week)} {unit}/tuần cho phần còn lại ({num(goal.remaining)} {unit}).</li>}
          </ul>
        </>
      )}
    </div>
  );
}

export function GoalsTab({ year }) {
  const { data, error, isPending } = useGoals(year);
  if (error) return <ErrorNote error={error} />;
  if (isPending) return <p className="text-ink-muted" role="status">Đang tải mục tiêu</p>;
  const byMetric = Object.fromEntries(data.goals.map((goal) => [goal.metric, goal]));
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-3">
        {[['books', 'sách'], ['pages', 'trang'], ['hours', 'giờ']].map(([metric, unit]) => (
          <GoalCard key={`${year}-${metric}-${byMetric[metric]?.target ?? ''}`} metric={metric} goal={byMetric[metric]} year={year} unit={unit} />
        ))}
      </div>
      <div className="text-xs text-ink-muted">
        <p>Nguồn số liệu: {data.rules.books} {data.rules.pages} {data.rules.hours}</p>
        {data.totals.pages_missing > 0 && <p className="mt-1">{data.totals.pages_missing} lượt đã xong chưa có số trang nên chưa cộng vào số trang.</p>}
      </div>
    </div>
  );
}
