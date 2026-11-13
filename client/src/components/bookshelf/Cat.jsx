/** Mèo ngồi trên kệ, vẽ bằng SVG; đuôi đung đưa khi rê chuột vào (tắt khi người dùng giảm chuyển động). */
export function ShelfCat({ className = '' }) {
  return (
    <svg viewBox="0 0 120 130" className={`cat ${className}`} role="img" aria-label="Con mèo ngồi trên kệ">
      <g fill="var(--ink)">
        <path d="M30 118c-6-22-2-48 12-62l-4-26 16 14c6-2 14-2 20 0l16-14-4 26c14 14 18 40 12 62z" />
        <ellipse cx="60" cy="120" rx="34" ry="8" />
      </g>
      <g fill="var(--honey)">
        <ellipse cx="50" cy="66" rx="5" ry="6" />
        <ellipse cx="70" cy="66" rx="5" ry="6" />
      </g>
      <g fill="var(--ink)">
        <ellipse cx="50" cy="67" rx="1.6" ry="4.2" />
        <ellipse cx="70" cy="67" rx="1.6" ry="4.2" />
      </g>
      <path d="M57 77h6l-3 3z" fill="var(--sage)" />
      <g stroke="var(--sage)" strokeWidth="1.2" strokeLinecap="round" opacity="0.7">
        <path d="M42 80l-12-2M42 84l-12 2M78 80l12-2M78 84l12 2" />
      </g>
      <g transform="translate(90 112)">
        <path className="cat-tail" d="M0 0c14 2 18 10 14 24-2 6 2 10 6 10" fill="none" stroke="var(--ink)" strokeWidth="7" strokeLinecap="round" />
      </g>
    </svg>
  );
}

export function CatMark({ size = 28 }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden>
      <rect width="64" height="64" rx="14" fill="var(--sage)" />
      <path d="M18 46V26l6-8 4 7h8l4-7 6 8v20c0 3-3 6-7 6H25c-4 0-7-3-7-6z" fill="var(--ink)" />
      <circle cx="27" cy="34" r="2.4" fill="var(--honey)" />
      <circle cx="37" cy="34" r="2.4" fill="var(--honey)" />
    </svg>
  );
}
