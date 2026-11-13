import { Star, StarHalf } from 'lucide-react';
import { cn } from '../../lib/utils.js';

export function Stars({ value, size = 14, className }) {
  if (!value) return null;
  const full = Math.floor(value);
  const half = value % 1 >= 0.5;
  return (
    <span className={cn('inline-flex items-center text-honey', className)} aria-label={`${value} sao`}>
      {Array.from({ length: full }, (_, index) => (
        <Star key={index} size={size} fill="currentColor" strokeWidth={0} />
      ))}
      {half && <StarHalf size={size} fill="currentColor" strokeWidth={0} />}
    </span>
  );
}

/** Chọn 0–5 sao, bước 0,5: bấm nửa trái ngôi sao = nửa sao. Phím mũi tên tăng/giảm 0,5. */
export function StarInput({ value, onChange, id, ...aria }) {
  const current = value ?? 0;
  return (
    <div className="flex items-center gap-3">
      <div
        id={id}
        role="slider"
        tabIndex={0}
        aria-valuemin={0}
        aria-valuemax={5}
        aria-valuenow={current}
        aria-valuetext={current ? `${current} sao` : 'Chưa chấm'}
        {...aria}
        onKeyDown={(event) => {
          if (event.key === 'ArrowRight' || event.key === 'ArrowUp') onChange(Math.min(5, current + 0.5));
          if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') onChange(current - 0.5 <= 0 ? null : current - 0.5);
        }}
        className="flex rounded-md"
      >
        {[1, 2, 3, 4, 5].map((star) => {
          const fill = current >= star ? 'full' : current >= star - 0.5 ? 'half' : 'empty';
          return (
            <span key={star} className="relative h-7 w-7 text-honey">
              <Star size={28} className="absolute inset-0 text-line" fill="currentColor" strokeWidth={0} />
              {fill !== 'empty' && (
                <span className="absolute inset-0 overflow-hidden" style={{ width: fill === 'half' ? '50%' : '100%' }}>
                  <Star size={28} fill="currentColor" strokeWidth={0} />
                </span>
              )}
              <button type="button" tabIndex={-1} aria-hidden className="absolute inset-y-0 left-0 w-1/2" onClick={() => onChange(star - 0.5)} />
              <button type="button" tabIndex={-1} aria-hidden className="absolute inset-y-0 right-0 w-1/2" onClick={() => onChange(star)} />
            </span>
          );
        })}
      </div>
      <span className="min-w-16 text-sm text-ink-muted">{current ? `${current.toLocaleString('vi-VN')} / 5` : 'Chưa chấm'}</span>
      {current > 0 && (
        <button type="button" className="text-xs text-ink-muted underline-offset-2 hover:underline" onClick={() => onChange(null)}>
          Bỏ chấm
        </button>
      )}
    </div>
  );
}
