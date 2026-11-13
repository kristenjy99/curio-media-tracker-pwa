import { Heart } from 'lucide-react';
import { useState } from 'react';
import { useCoverColor } from '../../lib/coverColor.js';
import { CATEGORY_LABELS, STATUS_LABELS } from '../../lib/labels.js';
import { cn, hashString, spineColor } from '../../lib/utils.js';
import { resolveFileUrl } from '../../lib/api.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/** Độ dày gáy theo độ dài thực của tác phẩm: số trang, số chữ (fanfic) hoặc số volume. */
function spineWidth(item) {
  if (item.main_category === 'Fanfiction' && item.word_count) return clamp(16 + item.word_count / 6000, 20, 56);
  if (item.main_category === 'Visual/Comics' && item.volume_count) return clamp(22 + item.volume_count * 0.6, 24, 60);
  if (item.unit_type === 'pages' && item.total_units) return clamp(18 + item.total_units / 18, 22, 56);
  return 30 + (hashString(item.title) % 10);
}

export function GeneratedCover({ item, color }) {
  return (
    <div className="flex h-full w-full flex-col justify-between p-3" style={{ background: color.bg, color: color.fg }}>
      <div className="rounded-sm border p-2" style={{ borderColor: `${color.fg}55` }}>
        <p className="font-display text-[15px] font-semibold leading-snug [overflow-wrap:anywhere]">{item.title}</p>
      </div>
      <p className="text-[11px] leading-tight opacity-80">{item.creator_author}</p>
    </div>
  );
}

export function BookSpine({ item, onOpen }) {
  const [coverFailed, setCoverFailed] = useState(false);
  const [spineFailed, setSpineFailed] = useState(false);
  // Không có ảnh gáy: gáy lấy màu theo bìa (nếu đọc được màu), không thì màu cố định theo tên sách.
  const coverColor = useCoverColor(item.cover_image, Boolean(item.cover_image) && (!item.spine_image || spineFailed) && !coverFailed);
  const color = coverColor ?? spineColor(item.title);
  // Có ảnh gáy thì độ rộng gáy theo tỉ lệ thật của ảnh để ảnh không bị cắt.
  const [spineRatio, setSpineRatio] = useState(null);
  const height = 212 + (hashString(item.id + item.title) % 5) * 7;
  const width = spineRatio ? clamp(Math.round(height * spineRatio), 18, 90) : spineWidth(item);
  const coverWidth = Math.round(height * 0.66);
  const hasCover = item.cover_image && !coverFailed;

  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className={cn(
        'book group relative shrink-0 overflow-hidden rounded-t-[3px] rounded-b-[2px] text-left shadow-[inset_-3px_0_6px_rgb(0_0_0/0.18),inset_2px_0_0_rgb(255_255_255/0.12)] hover:z-10 focus-visible:z-10 [&:hover]:![width:var(--cover-w)] [&:focus-visible]:![width:var(--cover-w)]',
        item.status === 'DNF' && 'saturate-50',
      )}
      style={{ width, height, '--cover-w': `${coverWidth}px`, background: color.bg, color: color.fg }}
      aria-label={`${item.title}${item.creator_author ? `, ${item.creator_author}` : ''}. ${CATEGORY_LABELS[item.main_category]}, ${STATUS_LABELS[item.status]}`}
    >
      {item.spine_image && !spineFailed ? (
        <img
          src={resolveFileUrl(item.spine_image)}
          alt=""
          aria-hidden
          loading="lazy"
          onError={() => setSpineFailed(true)}
          onLoad={(event) => setSpineRatio(event.currentTarget.naturalWidth / event.currentTarget.naturalHeight)}
          className="absolute inset-0 h-full w-full object-cover transition-opacity duration-200 group-hover:opacity-0 group-focus-visible:opacity-0"
        />
      ) : (
      <span className="absolute inset-0 flex flex-col items-center py-3 transition-opacity duration-200 group-hover:opacity-0 group-focus-visible:opacity-0">
        <span className="spine-band w-full" />
        <span className="spine-band mt-1 w-full" />
        <span className="spine-title mt-3 max-h-[calc(100%-4.5rem)] overflow-hidden text-ellipsis whitespace-nowrap font-display text-[13px] font-semibold leading-none tracking-wide">
          {item.title}
        </span>
        <span className="mt-auto flex flex-col items-center gap-1.5">
          {item.is_favorite && <Heart size={10} fill="currentColor" strokeWidth={0} aria-hidden />}
          <span className="spine-band w-full" />
        </span>
      </span>
      )}
      {item.status === 'Reading' && (
        <span aria-hidden className="absolute left-1/2 top-0 h-7 w-2.5 -translate-x-1/2 bg-honey [clip-path:polygon(0_0,100%_0,100%_100%,50%_78%,0_100%)]" />
      )}
      <span className="absolute inset-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden>
        {hasCover ? (
          <img src={resolveFileUrl(item.cover_image)} alt="" loading="lazy" onError={() => setCoverFailed(true)} className="h-full w-full object-cover" />
        ) : (
          <GeneratedCover item={item} color={color} />
        )}
      </span>
    </button>
  );
}
