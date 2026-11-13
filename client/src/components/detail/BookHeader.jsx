import { CalendarDays, Heart, NotebookPen, Pencil, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { CATEGORY_LABELS, STATUS_LABELS } from '../../lib/labels.js';
import { cn, formatDate, formatNumber, spineColor, UNIT_WORDS } from '../../lib/utils.js';
import { GeneratedCover } from '../bookshelf/BookSpine.jsx';
import { Button } from '../ui/Button.jsx';
import { Stars } from '../ui/StarRating.jsx';
import { Chilis, isSmut } from '../ui/ChiliRating.jsx';
import { resolveFileUrl } from '../../lib/api.js';

const STATUS_TONE = {
  Reading: 'bg-honey/25 text-ink',
  Finished: 'bg-sage/40 text-ink',
  TBR: 'bg-surface-2 text-ink-muted',
  DNF: 'bg-danger/10 text-danger',
};

function LargeCover({ item }) {
  const [failed, setFailed] = useState(false);
  const color = spineColor(item.title);
  return (
    <div className="relative aspect-[2/3] w-44 shrink-0 overflow-hidden rounded-r-md rounded-l-sm shadow-[0_22px_40px_-18px_rgb(var(--shadow)/0.55),inset_4px_0_0_rgb(0_0_0/0.12)] sm:w-56 lg:w-64">
      {item.cover_image && !failed ? (
        <img src={resolveFileUrl(item.cover_image)} alt={`Bìa sách ${item.title}`} className="h-full w-full object-cover" onError={() => setFailed(true)} />
      ) : (
        <GeneratedCover item={item} color={color} />
      )}
      <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-3 bg-gradient-to-r from-black/20 to-transparent" />
    </div>
  );
}

function Stat({ label, children, className }) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1', className)}>
      <span className="text-xs text-ink-muted">{label}</span>
      <div className="text-lg font-semibold leading-tight">{children}</div>
    </div>
  );
}

function progressText(item) {
  const unit = UNIT_WORDS[item.unit_type] ?? '';
  if (item.unit_type === 'percent') return `${item.current_unit}%`;
  if (item.total_units) return `${unit} ${formatNumber(item.current_unit)} / ${formatNumber(item.total_units)}`;
  if (item.current_unit) return `${unit} ${formatNumber(item.current_unit)}`;
  return 'Chưa có tổng số';
}

/**
 * Trường hiện dưới tiêu đề, theo thể loại:
 *   Fiction: tác giả, series, thể loại (genres), tropes, warnings
 *   Truyện tranh: tác giả, series, thể loại (genres)
 *   Fanfiction: tác giả, series, fandom, pairings, thể loại, tropes, warnings
 *   Nonfiction: tác giả, series, thể loại, topics, tropes
 * Series và tropes chỉ hiện khi có giá trị; warnings trống nghĩa là sách không có cảnh báo.
 */
function seriesNames(item) {
  const value = item.custom_fields?.series;
  const list = Array.isArray(value) ? value : value ? [value] : [];
  return list.map((name) => String(name).replace(/^\[\[|\]\]$/g, '').trim()).filter(Boolean);
}

function infoRows(item) {
  const author = { label: 'Tác giả', text: item.creator_author };
  const genres = { label: 'Nhãn thể loại', chips: item.tags };
  const warnings = { label: 'Warnings', chips: item.warnings ?? [], tone: 'warning', emptyText: 'Không có warnings' };
  const names = seriesNames(item);
  const series = names.length ? [{ label: 'Series', chips: names }] : [];
  const tropes = item.tropes?.length ? [{ label: 'Tropes', chips: item.tropes }] : [];
  if (item.main_category === 'Fanfiction') {
    return [author, ...series, { label: 'Fandom', chips: item.fandoms }, { label: 'Pairings', chips: item.pairings }, genres, ...tropes, warnings];
  }
  if (item.main_category === 'Fiction') return [author, ...series, genres, ...tropes, warnings];
  if (item.main_category === 'Nonfiction') return [author, ...series, genres, { label: 'Topics', chips: item.topics }, ...tropes];
  return [author, ...series, genres];
}

function InfoRows({ item }) {
  return (
    <dl className="grid max-w-2xl grid-cols-[6.5rem_1fr] gap-x-4 gap-y-2.5 text-sm">
      {infoRows(item).map((row) => (
        <div key={row.label} className="contents">
          <dt className="pt-0.5 text-ink-muted">{row.label}</dt>
          <dd className="min-w-0">
            {row.chips ? (
              row.chips.length ? (
                <ul className="flex flex-wrap gap-1.5">
                  {row.chips.map((chip) => (
                    <li
                      key={chip}
                      className={cn('rounded-md px-2 py-0.5', row.tone === 'warning' ? 'border border-danger/40 bg-danger/10 font-medium text-danger' : 'bg-surface-2')}
                    >
                      {row.tone === 'warning' && <span aria-hidden>⚠ </span>}
                      {chip}
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="text-ink-muted">{row.emptyText ?? 'Chưa có'}</span>
              )
            ) : (
              <span className="text-base">{row.text || <span className="text-sm text-ink-muted">Chưa có</span>}</span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Đầu trang chi tiết: tiêu đề serif lớn bên trái, bìa lớn bên phải. */
export function BookHeader({ item, onEdit, onToggleFavorite, favoriteBusy, onLogToday }) {
  const progress = Math.min(100, item.progress_percent ?? 0);

  return (
    <section className="flex flex-col-reverse gap-8 md:flex-row md:items-start md:justify-between">
      <div className="flex min-w-0 flex-1 flex-col gap-5">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded-full border border-line px-2.5 py-0.5">{CATEGORY_LABELS[item.main_category]}</span>
          <span className={cn('rounded-full px-2.5 py-0.5 font-medium', STATUS_TONE[item.status])}>{STATUS_LABELS[item.status]}</span>
        </div>
        <h1 className="font-display text-4xl font-medium leading-[1.05] tracking-tight [overflow-wrap:anywhere] sm:text-5xl lg:text-6xl">{item.title}</h1>
        <InfoRows item={item} />

        <div className="grid max-w-2xl grid-cols-2 gap-x-6 gap-y-5 rounded-2xl border border-line bg-surface/80 p-5 sm:grid-cols-4">
          <Stat label="Tiến độ" className="col-span-2 sm:col-span-2">
            <span className="tabular-nums">{progress.toLocaleString('vi-VN')}%</span>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Tiến độ đọc">
              <div className="h-full rounded-full bg-moss transition-[width]" style={{ width: `${progress}%` }} />
            </div>
            <span className="mt-1.5 block text-xs font-normal text-ink-muted">{progressText(item)}</span>
          </Stat>
          <Stat label="Re-read">
            <span className="inline-flex items-center gap-1.5 tabular-nums">
              <RotateCcw size={16} className="text-ink-muted" aria-hidden />
              {item.reread_count} lần
            </span>
          </Stat>
          <Stat label="Đọc gần nhất">
            <span className="inline-flex items-center gap-1.5 tabular-nums">
              <CalendarDays size={16} className="text-ink-muted" aria-hidden />
              {item.last_read_date ? formatDate(item.last_read_date) : 'Chưa có'}
            </span>
          </Stat>
          <Stat label="Đánh giá" className="col-span-2 sm:col-span-4">
            {item.rating ? <Stars value={item.rating} size={18} /> : <span className="text-base font-normal text-ink-muted">Chưa chấm</span>}
          </Stat>
          {isSmut(item.tags) && (
            <Stat label="Độ spicy" className="col-span-2 sm:col-span-4">
              {item.spice_rating ? <Chilis value={item.spice_rating} size={18} /> : <span className="text-base font-normal text-ink-muted">Chưa chấm</span>}
            </Stat>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant={item.is_favorite ? 'primary' : 'secondary'}
            onClick={onToggleFavorite}
            disabled={favoriteBusy}
            aria-pressed={item.is_favorite}
          >
            <Heart size={16} fill={item.is_favorite ? 'currentColor' : 'none'} /> {item.is_favorite ? 'Đang yêu thích' : 'Yêu thích'}
          </Button>
          <Button onClick={onEdit}>
            <Pencil size={16} /> Sửa thông tin
          </Button>
          <Button variant="ghost" onClick={onLogToday}>
            <NotebookPen size={16} /> Ghi log hôm nay
          </Button>
        </div>

      </div>
      <div className="flex justify-center md:justify-end">
        <LargeCover item={item} />
      </div>
    </section>
  );
}
