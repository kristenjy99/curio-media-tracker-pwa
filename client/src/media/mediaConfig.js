// Category lớn của Media. `value` sẽ là giá trị lưu trong DB ở bước sau.
export const MEDIA_CATEGORIES = [
  { value: 'tv_series', label: 'TV Series' },
  { value: 'movie', label: 'Movies' },
  { value: 'animation', label: 'Animation' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'short_drama', label: 'Short Dramas' },
];

export const MEDIA_VIEWS = [
  { value: 'grid', label: 'Lưới poster' },
  { value: 'table', label: 'Bảng' },
];

// Bộ trạng thái lấy theo bên sách (TBR, Reading, Finished, DNF), đổi sang ngữ cảnh xem.
export const MEDIA_STATUSES = ['TBW', 'Watching', 'Finished', 'DNF'];
export const MEDIA_STATUS_LABELS = { TBW: 'TBW', Watching: 'Đang xem', Finished: 'Đã xem', DNF: 'Bỏ dở' };

export const categoryLabel = (value) => MEDIA_CATEGORIES.find((c) => c.value === value)?.label ?? value;

/** "Season 10/10", "Season 3" hoặc rỗng khi chưa nhập season. */
export function seasonText(item) {
  if (item.season_current === null || item.season_current === undefined) return '';
  return item.season_total ? `Season ${item.season_current}/${item.season_total}` : `Season ${item.season_current}`;
}

/** "9-1-1 · Season 10/10" hoặc chỉ tên series/season nếu thiếu một phần. */
export const seriesText = (item) => [item.series_name, seasonText(item)].filter(Boolean).join(' · ');

/** "12/24 tập", "12 tập" hoặc rỗng khi chưa có tiến độ. */
export function progressText(item) {
  if (item.progress_total) return `${item.progress_current}/${item.progress_total} tập`;
  return item.progress_current ? `${item.progress_current} tập` : '';
}
