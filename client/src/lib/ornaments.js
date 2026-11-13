import { hashString } from './utils.js';

/** PRNG nhỏ có hạt giống, để cách xếp giữ nguyên khi kệ vẽ lại và chỉ đổi khi bấm xếp lại. */
function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Chọn ngẫu nhiên tối đa `per_shelf` món (mỗi món tối đa một lần trên một tầng) và vị trí chen giữa các cuốn.
 * Trả mảng { key, src, size, index } cho Shelf.
 */
export function placeOrnaments(settings, shelfKey, bookCount, seed) {
  if (!settings?.enabled || !settings.per_shelf) return [];
  const pool = (settings.items ?? []).filter((item) => item.enabled);
  if (!pool.length) return [];
  const random = mulberry32(hashString(`${seed}:${shelfKey}`));
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  // Số món của tầng cũng ngẫu nhiên (ít nhất 1) để các tầng không giống nhau.
  const count = Math.min(shuffled.length, 1 + Math.floor(random() * settings.per_shelf));
  return shuffled.slice(0, count).map((item) => ({ key: item.id, src: item.src, size: item.size, index: Math.floor(random() * (bookCount + 1)) }));
}

const SEED_KEY = 'rt-ornament-seed';

/** Hạt giống của phiên: giữ khi chuyển trang trong phiên, đổi khi bấm xếp lại. */
export function readOrnamentSeed() {
  try {
    const saved = sessionStorage.getItem(SEED_KEY);
    if (saved) return saved;
    const fresh = Math.random().toString(36).slice(2);
    sessionStorage.setItem(SEED_KEY, fresh);
    return fresh;
  } catch {
    return Math.random().toString(36).slice(2);
  }
}

export function nextOrnamentSeed() {
  const fresh = Math.random().toString(36).slice(2);
  try {
    sessionStorage.setItem(SEED_KEY, fresh);
  } catch {
    // Không ghi được sessionStorage thì chỉ đổi trong lần xem này.
  }
  return fresh;
}
