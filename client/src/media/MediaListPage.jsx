import { Heart, LayoutGrid, Plus, Search, Table2 } from 'lucide-react';
import { useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '../components/ui/Button.jsx';
import { Select } from '../components/ui/Input.jsx';
import { Segmented } from '../components/ui/Segmented.jsx';
import { Spinner } from '../components/ui/Spinner.jsx';
import { MEDIA_CATEGORIES, MEDIA_STATUSES, MEDIA_STATUS_LABELS, MEDIA_VIEWS } from './mediaConfig.js';
import { MediaFormDialog } from './MediaFormDialog.jsx';
import { useMediaGenres, useMediaItems } from './queries.js';
import { MediaPoster, MediaTable } from './MediaPoster.jsx';

/** Trang danh sách chung: lọc category/trạng thái, tìm tên, chuyển lưới/bảng, thêm và sửa media. Bộ lọc lưu trên URL. */
export function MediaListPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  // Bấm vào media mở trang chi tiết; nút quay lại về đúng bộ lọc đang dùng.
  const openDetail = (it) => navigate(`/media/${it.id}`, { state: { from: `${location.pathname}${location.search}` } });
  const category = params.get('category') ?? 'all';
  const view = params.get('view') === 'table' ? 'table' : 'grid';
  const q = params.get('q') ?? '';
  const status = params.get('status') ?? 'all';
  const favorite = params.get('favorite') === '1';
  const genre = params.get('genre') ?? 'all';
  const genres = useMediaGenres().data?.genres ?? [];
  const [dialog, setDialog] = useState(null); // null | { item } (item = null khi thêm mới)
  const list = useMediaItems({ category: category === 'all' ? undefined : category, status: status === 'all' ? undefined : status, genre: genre === 'all' ? undefined : genre, favorite: favorite ? '1' : undefined, q });

  const update = (key, value, empty) => {
    const next = new URLSearchParams(params);
    if (!value || value === empty) next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  };

  const items = list.data?.items ?? [];
  const categoryOptions = [{ value: 'all', label: 'Tất cả' }, ...MEDIA_CATEGORIES];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented label="Lọc theo category" value={category} onChange={(v) => update('category', v, 'all')} options={categoryOptions} />
        <label className="relative ml-auto w-full sm:w-64">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" aria-hidden />
          <input
            type="search"
            value={q}
            onChange={(e) => update('q', e.target.value, '')}
            placeholder="Tìm theo tên"
            aria-label="Tìm theo tên"
            className="h-10 w-full rounded-lg border border-line bg-surface pl-9 pr-3 text-sm outline-none focus:border-moss"
          />
        </label>
        <Select aria-label="Lọc theo trạng thái" value={status} onChange={(e) => update('status', e.target.value, 'all')} className="w-auto">
          <option value="all">Mọi trạng thái</option>
          {MEDIA_STATUSES.map((s) => (
            <option key={s} value={s}>
              {MEDIA_STATUS_LABELS[s]}
            </option>
          ))}
        </Select>
        <Select aria-label="Lọc theo thể loại" value={genre} onChange={(e) => update('genre', e.target.value, 'all')} className="w-auto">
          <option value="all">Mọi thể loại</option>
          {genres.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </Select>
        <Button aria-pressed={favorite} variant={favorite ? 'primary' : 'secondary'} onClick={() => update('favorite', favorite ? '' : '1', '')}>
          <Heart size={16} fill={favorite ? 'currentColor' : 'none'} /> Yêu thích
        </Button>
        <Segmented
          label="Kiểu hiển thị"
          value={view}
          onChange={(v) => update('view', v, 'grid')}
          options={MEDIA_VIEWS.map((o) => ({ ...o, label: o.value === 'grid' ? <LayoutGrid size={16} aria-label={o.label} /> : <Table2 size={16} aria-label={o.label} /> }))}
        />
        <Button variant="primary" onClick={() => setDialog({ item: null })}>
          <Plus size={16} /> Thêm media
        </Button>
      </div>

      {list.isLoading ? (
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      ) : list.isError ? (
        <p className="py-20 text-center text-danger" role="alert">
          Không tải được danh sách media.
        </p>
      ) : items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line py-20 text-center text-ink-muted" role="status">
          Chưa có media nào khớp bộ lọc. Bấm "Thêm media" để thêm mục đầu tiên.
        </p>
      ) : view === 'grid' ? (
        <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
          {items.map((item) => (
            <MediaPoster key={item.id} item={item} onOpen={openDetail} />
          ))}
        </div>
      ) : (
        <MediaTable items={items} onOpen={openDetail} />
      )}

      {dialog && (
        <MediaFormDialog
          key={dialog.item?.id ?? 'new'}
          open
          item={dialog.item}
          defaultCategory={category === 'all' ? undefined : category}
          onOpenChange={(open) => !open && setDialog(null)}
        />
      )}
    </div>
  );
}
