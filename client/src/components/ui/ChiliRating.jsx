import { cn } from '../../lib/utils.js';

const CHILI = '🌶️';
/** Sách có tag smut (không phân biệt hoa thường) mới có độ spicy. */
export const isSmut = (tags) => (tags ?? []).some((tag) => String(tag).trim().toLowerCase() === 'smut');

function Chili({ fill, size }) {
  return (
    <span className="relative inline-block leading-none" style={{ width: size, height: size, fontSize: size * 0.9 }} aria-hidden>
      <span className="absolute inset-0 opacity-25 grayscale">{CHILI}</span>
      {fill > 0 && (
        <span className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
          {CHILI}
        </span>
      )}
    </span>
  );
}

/** Hiển thị độ spicy 0–5 bằng quả ớt, có nửa quả. */
export function Chilis({ value, size = 16, className, showEmpty = false }) {
  if (!value && !showEmpty) return null;
  return (
    <span className={cn('inline-flex items-center gap-0.5', className)} aria-label={`Độ spicy ${value ?? 0} / 5`} role="img">
      {[1, 2, 3, 4, 5].map((level) => (
        <Chili key={level} size={size} fill={(value ?? 0) >= level ? 1 : (value ?? 0) >= level - 0.5 ? 0.5 : 0} />
      ))}
    </span>
  );
}

/** Chọn 0–5 quả ớt, bước 0,5: bấm nửa trái quả = nửa quả. Phím mũi tên tăng/giảm 0,5. */
export function ChiliInput({ value, onChange, id, ...aria }) {
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
        aria-valuetext={current ? `${current} ớt` : 'Chưa chấm'}
        {...aria}
        onKeyDown={(event) => {
          if (event.key === 'ArrowRight' || event.key === 'ArrowUp') onChange(Math.min(5, current + 0.5));
          if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') onChange(current - 0.5 <= 0 ? null : current - 0.5);
        }}
        className="flex gap-0.5 rounded-md"
      >
        {[1, 2, 3, 4, 5].map((level) => (
          <span key={level} className="relative">
            <Chili size={28} fill={current >= level ? 1 : current >= level - 0.5 ? 0.5 : 0} />
            <button type="button" tabIndex={-1} aria-hidden className="absolute inset-y-0 left-0 w-1/2" onClick={() => onChange(level - 0.5)} />
            <button type="button" tabIndex={-1} aria-hidden className="absolute inset-y-0 right-0 w-1/2" onClick={() => onChange(level)} />
          </span>
        ))}
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
