import { useState } from 'react';
import { cn, spineColor } from '../../lib/utils.js';
import { resolveFileUrl } from '../../lib/api.js';

/** Bìa sách theo tỉ lệ 2:3; không có ảnh hoặc ảnh lỗi thì hiện ô màu theo tiêu đề. */
export function Cover({ src, title, className }) {
  const [failed, setFailed] = useState(false);
  if (src && !failed) {
    return <img src={resolveFileUrl(src)} alt="" loading="lazy" onError={() => setFailed(true)} className={cn('aspect-[2/3] w-full rounded-sm object-cover shadow-sm', className)} />;
  }
  const color = spineColor(title ?? '');
  return (
    <span style={{ background: color.bg, color: color.fg }} className={cn('flex aspect-[2/3] w-full items-center justify-center rounded-sm text-[10px] font-medium', className)} aria-hidden>
      {String(title ?? '?').trim().charAt(0).toUpperCase()}
    </span>
  );
}
