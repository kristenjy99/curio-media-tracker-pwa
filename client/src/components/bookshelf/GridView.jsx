import { Heart, ZoomIn } from 'lucide-react';
import { useState } from 'react';
import { resolveFileUrl } from '../../lib/api.js';
import { spineColor } from '../../lib/utils.js';
import { Stars } from '../ui/StarRating.jsx';

const SIZE_KEY = 'rt-grid-cover-width';
const MIN = 96;
const MAX = 220;
const DEFAULT = 140;
const readSize = () => {
  try {
    const value = Number(localStorage.getItem(SIZE_KEY));
    return value >= MIN && value <= MAX ? value : DEFAULT;
  } catch {
    return DEFAULT;
  }
};

/** Bìa bo góc nhẹ; không có ảnh hoặc ảnh lỗi thì vẽ bìa giả bằng màu theo tiêu đề, có tên sách và tác giả. */
function GridCover({ item }) {
  const [failed, setFailed] = useState(false);
  if (item.cover_image && !failed) {
    return <img src={resolveFileUrl(item.cover_image)} alt="" loading="lazy" onError={() => setFailed(true)} className="h-full w-full object-cover" />;
  }
  const color = spineColor(item.title ?? '');
  return (
    <span style={{ background: color.bg, color: color.fg }} className="flex h-full w-full flex-col justify-between p-3 text-left" aria-hidden>
      <span translate="no" className="line-clamp-5 font-display text-sm leading-snug">
        {item.title}
      </span>
      {item.creator_author && (
        <span translate="no" className="line-clamp-2 text-[11px] opacity-80">
          {item.creator_author}
        </span>
      )}
    </span>
  );
}

function GridCard({ item, onOpen }) {
  return (
    <li className="min-w-0">
      <button type="button" onClick={() => onOpen(item)} className="group flex w-full flex-col gap-2 rounded-xl text-left focus-visible:outline-none">
        <span className="relative block aspect-[2/3] w-full overflow-hidden rounded-lg bg-surface-2 shadow-sm ring-1 ring-black/5 transition duration-200 group-hover:-translate-y-1 group-hover:shadow-lg group-focus-visible:ring-2 group-focus-visible:ring-moss motion-reduce:transition-none motion-reduce:group-hover:translate-y-0 dark:ring-white/10">
          <GridCover item={item} />
          {item.is_favorite && (
            <span className="absolute right-1.5 top-1.5 rounded-full bg-black/45 p-1 text-white backdrop-blur-sm">
              <Heart size={12} fill="currentColor" strokeWidth={0} aria-label="Yêu thích" />
            </span>
          )}
        </span>
        <span className="flex min-w-0 flex-col gap-0.5 px-0.5">
          <span translate="no" className="line-clamp-2 text-sm font-medium leading-snug text-ink">
            {item.title}
          </span>
          {item.creator_author && (
            <span translate="no" className="truncate text-xs text-ink-muted">
              {item.creator_author}
            </span>
          )}
          {item.rating > 0 && <Stars value={item.rating} size={11} />}
        </span>
      </button>
    </li>
  );
}

/** Xem dạng lưới bìa, chia nhóm theo trạng thái giống kệ sách; cỡ bìa chỉnh bằng thanh trượt và nhớ trên máy này. */
export function GridView({ shelves, onOpen }) {
  const [width, setWidth] = useState(readSize);
  const changeSize = (value) => {
    setWidth(value);
    try {
      localStorage.setItem(SIZE_KEY, String(value));
    } catch {
      // không lưu được thì chỉ áp dụng trong phiên
    }
  };
  return (
    <div className="flex flex-col gap-8">
      <label className="ml-auto flex items-center gap-2 text-sm text-ink-muted">
        <ZoomIn size={16} aria-hidden /> Cỡ bìa
        <input
          type="range"
          min={MIN}
          max={MAX}
          step={4}
          value={width}
          onChange={(event) => changeSize(Number(event.target.value))}
          className="w-40 accent-[var(--moss)]"
          aria-label="Cỡ ảnh bìa"
        />
      </label>
      {shelves.map((shelf) => (
        <section key={shelf.key} aria-label={shelf.title} className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3 border-b border-line pb-2">
            <h2 className="font-display text-xl">
              {shelf.title} <span className="text-sm font-normal text-ink-muted">· {shelf.items.length}</span>
            </h2>
            {shelf.action}
          </div>
          {/* Trên điện thoại cột tối thiểu nhỏ lại để luôn được ít nhất 2 cột. */}
          <ul className="grid gap-x-4 gap-y-6" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(min(${width}px, calc(50% - 0.5rem)), 1fr))` }}>
            {shelf.items.map((item) => (
              <GridCard key={item.id} item={item} onOpen={onOpen} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
