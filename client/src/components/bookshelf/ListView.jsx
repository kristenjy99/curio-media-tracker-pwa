import { ZoomIn } from 'lucide-react';
import { useState } from 'react';
import { CATEGORY_LABELS } from '../../lib/labels.js';
import { formatDate, spineColor } from '../../lib/utils.js';
import { Stars } from '../ui/StarRating.jsx';
import { resolveFileUrl } from '../../lib/api.js';

const SIZE_KEY = 'rt-list-cover-width';
const readSize = () => {
  try {
    const value = Number(localStorage.getItem(SIZE_KEY));
    return value >= 32 && value <= 160 ? value : 32;
  } catch {
    return 32;
  }
};

function Thumb({ item, width }) {
  const [failed, setFailed] = useState(false);
  const style = { width, height: Math.round(width * 1.5) };
  if (item.cover_image && !failed) {
    return <img src={resolveFileUrl(item.cover_image)} alt="" onError={() => setFailed(true)} style={style} className="shrink-0 rounded-sm object-cover shadow-sm" loading="lazy" />;
  }
  return <span style={{ ...style, background: spineColor(item.title).bg }} className="shrink-0 rounded-sm" aria-hidden />;
}

export function ListView({ items, onOpen }) {
  // Cỡ bìa chỉnh bằng thanh trượt, nhớ trên máy này.
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
    <div className="flex flex-col gap-2">
    <label className="ml-auto flex items-center gap-2 text-sm text-ink-muted">
      <ZoomIn size={16} aria-hidden /> Cỡ bìa
      <input type="range" min={32} max={160} step={4} value={width} onChange={(event) => changeSize(Number(event.target.value))} className="w-40 accent-[var(--moss)]" aria-label="Cỡ ảnh bìa" />
    </label>
    <div className="overflow-x-auto rounded-xl border border-line bg-surface">
      <table className="w-full min-w-[860px] text-left text-sm">
        <thead className="border-b border-line text-ink-muted">
          <tr>
            <th scope="col" className="px-4 py-3 font-medium">Tên sách</th>
            <th scope="col" className="px-4 py-3 font-medium">Tác giả</th>
            <th scope="col" className="px-4 py-3 font-medium">Thể loại</th>
            <th scope="col" className="px-4 py-3 font-medium">Tags</th>
            <th scope="col" className="px-4 py-3 font-medium">Ratings</th>
            <th scope="col" className="px-4 py-3 font-medium">Ngày review</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            return (
              <tr key={item.id} className="border-b border-line/60 last:border-0 hover:bg-surface-2/60">
                <td className="px-4 py-2.5">
                  <button type="button" onClick={() => onOpen(item)} className="flex items-center gap-3 text-left">
                    <Thumb item={item} width={width} />
                    <span className="font-display text-[15px] font-medium leading-snug hover:underline">{item.title}</span>
                  </button>
                </td>
                <td className="px-4 py-2.5">{item.creator_author || <span className="text-ink-muted">Chưa có</span>}</td>
                <td className="px-4 py-2.5">{CATEGORY_LABELS[item.main_category]}</td>
                <td className="px-4 py-2.5">
                  {item.tags?.length ? (
                    <div className="flex max-w-[260px] flex-wrap gap-1">
                      {item.tags.map((tag) => (
                        <span key={tag} className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-ink-muted">{tag}</span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-ink-muted">Chưa có</span>
                  )}
                </td>
                <td className="px-4 py-2.5">{item.rating ? <Stars value={item.rating} /> : <span className="text-ink-muted">Chưa chấm</span>}</td>
                <td className="px-4 py-2.5 tabular-nums">{item.review_date ? formatDate(item.review_date) : <span className="text-ink-muted">Chưa có</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
    </div>
  );
}
