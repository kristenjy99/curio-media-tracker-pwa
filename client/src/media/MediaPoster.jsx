import { Heart } from 'lucide-react';
import { Cover } from '../components/ui/Cover.jsx';
import { Stars } from '../components/ui/StarRating.jsx';
import { cn } from '../lib/utils.js';
import { categoryLabel, MEDIA_STATUS_LABELS, progressText, seriesText, seasonText } from './mediaConfig.js';
import { useToggleMediaFavorite } from './queries.js';

/** Nút tim bật/tắt yêu thích; bấm không mở form sửa. */
/** Tên series và season tách thành từng đoạn chữ riêng để phần "Season 2/3" được dịch theo ngôn ngữ giao diện. */
function SeriesLine({ item }) {
  const season = seasonText(item);
  return (
    <>
      {item.series_name}
      {item.series_name && season ? ' · ' : null}
      {season ? <span>{season}</span> : null}
    </>
  );
}

export function FavoriteButton({ item, className }) {
  const toggle = useToggleMediaFavorite();
  return (
    <button
      type="button"
      aria-pressed={item.is_favorite}
      aria-label={item.is_favorite ? 'Bỏ yêu thích' : 'Yêu thích'}
      disabled={toggle.isPending}
      onClick={(event) => {
        event.stopPropagation();
        toggle.mutate(item);
      }}
      className={cn('rounded-full p-1.5 transition-colors', item.is_favorite ? 'text-danger' : 'text-ink-muted hover:text-danger', className)}
    >
      <Heart size={16} fill={item.is_favorite ? 'currentColor' : 'none'} />
    </button>
  );
}

/** Ô poster có tên (lưới). */
export function MediaPoster({ item, onOpen }) {
  const progress = progressText(item);
  return (
    <div className="group relative">
      <button type="button" onClick={() => onOpen(item)} className="flex w-full flex-col gap-2 text-left">
        <Cover src={item.cover_image} title={item.title} className="rounded-lg transition-transform group-hover:-translate-y-0.5" />
        <span className="line-clamp-2 text-sm font-medium leading-snug">{item.title}</span>
        {seriesText(item) && <span className="-mt-1.5 line-clamp-1 text-xs text-ink-muted"><SeriesLine item={item} /></span>}
        <span className="-mt-1.5 text-xs text-ink-muted">
          {categoryLabel(item.category)} · {MEDIA_STATUS_LABELS[item.status]}
          {progress && ' · '}
          {progress && <span>{progress}</span>}
        </span>
        <Stars value={item.rating} size={12} className="-mt-1.5" />
      </button>
      <FavoriteButton item={item} className="absolute right-1.5 top-1.5 bg-surface/85 shadow-sm backdrop-blur" />
    </div>
  );
}

/** Dạng bảng. */
export function MediaTable({ items, onOpen }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-surface/80">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-ink-muted">
            <th className="w-10 px-2 py-2.5" aria-label="Yêu thích" />
            {['Tên', 'Series', 'Loại', 'Nhãn thể loại', 'Quốc gia', 'Trạng thái', 'Tiến độ', 'Đánh giá'].map((h) => (
              <th key={h} className="px-4 py-2.5 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} onClick={() => onOpen(item)} className="cursor-pointer border-b border-line last:border-0 hover:bg-surface-2">
              <td className="px-2 py-1.5">
                <FavoriteButton item={item} />
              </td>
              <td className="px-4 py-2.5 font-medium">{item.title}</td>
              <td className="px-4 py-2.5 text-ink-muted"><SeriesLine item={item} /></td>
              <td className="px-4 py-2.5 text-ink-muted">{categoryLabel(item.category)}</td>
              <td className="px-4 py-2.5 text-ink-muted">{item.genres.join(', ')}</td>
              <td className="px-4 py-2.5 text-ink-muted">{item.countries.join(', ')}</td>
              <td className="px-4 py-2.5 text-ink-muted">{MEDIA_STATUS_LABELS[item.status]}</td>
              <td className="px-4 py-2.5 text-ink-muted">{progressText(item)}</td>
              <td className="px-4 py-2.5">
                <Stars value={item.rating} size={13} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
