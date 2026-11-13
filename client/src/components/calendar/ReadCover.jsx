import { RotateCw } from 'lucide-react';
import { cn } from '../../lib/utils.js';
import { Cover } from '../ui/Cover.jsx';

/** Bìa trong ô lịch: re-read có dấu ↻ kèm số lượt, sách bỏ dở mờ, viền nét đứt. */
export function ReadCover({ read, count = 1, small = false }) {
  const dnf = read.state === 'dnf';
  return (
    <span className="relative block w-full">
      <Cover src={read.cover_image} title={read.title} className={cn(dnf && 'opacity-55 grayscale outline-dashed outline-1 outline-ink-muted')} />
      {read.is_reread && (
        <span className="absolute left-0.5 top-0.5 flex items-center gap-0.5 rounded bg-honey px-1 text-[10px] font-semibold leading-4 text-[#3b2a10]" title={`Re-read, lượt ${read.read_number}`}>
          <RotateCw size={small ? 8 : 10} aria-hidden />
          {!small && read.read_number}
        </span>
      )}
      {dnf && !small && <span className="absolute inset-x-0 bottom-0 bg-ink/70 text-center text-[10px] leading-4 text-paper">Bỏ dở</span>}
      {count > 1 && (
        <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-moss px-1 text-[11px] font-semibold tabular-nums text-on-moss shadow">{count}</span>
      )}
    </span>
  );
}
