import { useMemo } from 'react';

const MONTHS = ['Th1', 'Th2', 'Th3', 'Th4', 'Th5', 'Th6', 'Th7', 'Th8', 'Th9', 'Th10', 'Th11', 'Th12'];
const WEEKDAY_ROWS = [{ row: 0, label: 'T2' }, { row: 2, label: 'T4' }, { row: 4, label: 'T6' }, { row: 6, label: 'CN' }];
const LEVEL_MIX = [0, 35, 55, 78, 100];
const CELL = 17;
const GAP = 3;

const levelOf = (logs) => (logs >= 4 ? 4 : logs);
const levelColor = (level) =>
  level === 0 ? 'var(--surface-2)' : `color-mix(in srgb, var(--moss) ${LEVEL_MIX[level]}%, var(--surface-2))`;

function buildWeeks(year, byDate) {
  const start = new Date(Date.UTC(year, 0, 1));
  const end = new Date(Date.UTC(year, 11, 31));
  const offset = (start.getUTCDay() + 6) % 7; // tuần bắt đầu từ thứ hai
  const weeks = [];
  let week = Array(offset).fill(null);
  const monthStarts = [];
  for (let day = new Date(start); day <= end; day = new Date(day.getTime() + 86_400_000)) {
    const iso = day.toISOString().slice(0, 10);
    if (day.getUTCDate() === 1) monthStarts.push({ month: day.getUTCMonth(), weekIndex: weeks.length });
    week.push({ date: iso, ...(byDate.get(iso) ?? { logs: 0, units: 0, minutes: 0 }) });
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length) weeks.push([...week, ...Array(7 - week.length).fill(null)]);
  return { weeks, monthStarts };
}

function cellLabel(cell) {
  const [y, m, d] = cell.date.split('-');
  const date = `${d}/${m}/${y}`;
  if (!cell.logs) return `${date}: không có log`;
  const parts = [`${cell.logs} log`];
  if (cell.units) parts.push(`${cell.units.toLocaleString('vi-VN')} trang/chương`);
  if (cell.minutes) parts.push(`${cell.minutes.toLocaleString('vi-VN')} phút`);
  return `${date}: ${parts.join(', ')}`;
}

/** Heatmap kiểu GitHub: mỗi cột một tuần, mỗi ô một ngày; màu theo số log trong ngày. */
export function ReadingHeatmap({ year, days }) {
  const { weeks, monthStarts } = useMemo(() => buildWeeks(year, new Map(days.map((entry) => [entry.date, entry]))), [year, days]);
  const width = weeks.length * (CELL + GAP);
  return (
    <div>
      <div className="overflow-x-auto pb-2">
        <div className="flex gap-2">
          <div className="relative shrink-0 pt-5 text-xs text-ink-muted" style={{ width: 22 }} aria-hidden>
            {WEEKDAY_ROWS.map(({ row, label }) => (
              <span key={label} className="absolute left-0" style={{ top: 20 + row * (CELL + GAP) }}>{label}</span>
            ))}
          </div>
          <div style={{ width }} className="shrink-0">
            <div className="relative h-5 text-xs text-ink-muted" aria-hidden>
              {monthStarts.map(({ month, weekIndex }) => (
                <span key={month} className="absolute" style={{ left: weekIndex * (CELL + GAP) }}>{MONTHS[month]}</span>
              ))}
            </div>
            <div className="flex" style={{ gap: GAP }} role="img" aria-label={`Lịch đọc năm ${year}, ${days.length} ngày có ghi log`}>
              {weeks.map((week, weekIndex) => (
                <div key={weekIndex} className="flex flex-col" style={{ gap: GAP }}>
                  {week.map((cell, index) =>
                    cell ? (
                      <div
                        key={cell.date}
                        title={cellLabel(cell)}
                        className="rounded-[3px]"
                        style={{ width: CELL, height: CELL, background: levelColor(levelOf(cell.logs)) }}
                      />
                    ) : (
                      <div key={`pad-${index}`} style={{ width: CELL, height: CELL }} />
                    ),
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-end gap-1.5 text-xs text-ink-muted">
        <span>Ít</span>
        {LEVEL_MIX.map((_, level) => (
          <span key={level} className="inline-block rounded-[3px]" style={{ width: CELL, height: CELL, background: levelColor(level) }} />
        ))}
        <span>Nhiều</span>
      </div>
    </div>
  );
}
