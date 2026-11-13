import { Play, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useInvalidateLibrary, useItems } from '../../hooks/queries.js';
import { api } from '../../lib/api.js';
import { formatDate, todayIso } from '../../lib/utils.js';
import { useLibraryActions } from '../layout/LibraryActions.jsx';
import { Button } from '../ui/Button.jsx';
import { Cover } from '../ui/Cover.jsx';
import { ErrorNote } from '../ui/ErrorNote.jsx';
import { Input, Select } from '../ui/Input.jsx';
import { Segmented } from '../ui/Segmented.jsx';

const OWNERSHIP = { owned: 'Đã sở hữu', wishlist: 'Wishlist' };

function Row({ item, onChange, onError }) {
  const navigate = useNavigate();
  const patch = async (body) => {
    try { await api.patch(`/items/${item.id}`, body); onChange(); } catch (error) { onError(error); }
  };
  const start = async () => {
    try { await api.post(`/items/${item.id}/start-reading`, {}); onChange(); } catch (error) { onError(error); }
  };
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface p-2.5">
      <span className="w-10 shrink-0"><Cover src={item.cover_image} title={item.title} /></span>
      <button type="button" onClick={() => navigate(`/books/${item.id}`)} className="min-w-[160px] flex-1 text-left">
        <span className="block font-display leading-snug hover:underline">{item.title}</span>
        <span className="block text-sm text-ink-muted">{item.creator_author || 'Chưa có tác giả'}</span>
      </button>
      <Select value={item.ownership ?? ''} onChange={(event) => patch({ ownership: event.target.value || null })} aria-label={`Sở hữu: ${item.title}`} className="w-36">
        <option value="">Chưa phân loại</option>
        <option value="owned">Đã sở hữu</option>
        <option value="wishlist">Wishlist</option>
      </Select>
      <Input type="date" value={item.release_date ?? ''} onChange={(event) => patch({ release_date: event.target.value || null })} aria-label={`Ngày phát hành: ${item.title}`} className="w-40" />
      <Button variant="primary" size="sm" onClick={start}><Play size={14} /> Bắt đầu đọc</Button>
    </li>
  );
}

export function TbrTab() {
  const { data, error } = useItems({ status: 'TBR', sort: 'title', order: 'asc' });
  const invalidate = useInvalidateLibrary();
  const { openNewBook } = useLibraryActions();
  const [ownership, setOwnership] = useState('all');
  const [view, setView] = useState('genre');
  const [actionError, setActionError] = useState(null);
  const today = todayIso();

  const items = useMemo(() => (data?.data ?? []).filter((item) => ownership === 'all' || (ownership === 'none' ? !item.ownership : item.ownership === ownership)), [data, ownership]);
  const groups = useMemo(() => {
    if (view === 'upcoming') {
      const upcoming = items.filter((item) => item.release_date && item.release_date >= today).sort((a, b) => a.release_date.localeCompare(b.release_date));
      return [['Sắp phát hành', upcoming]];
    }
    const map = new Map();
    for (const item of items) for (const tag of item.tags?.length ? item.tags : ['Chưa có thể loại']) map.set(tag, [...(map.get(tag) ?? []), item]);
    return [...map].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], 'vi'));
  }, [items, view, today]);

  if (error) return <ErrorNote error={error} />;
  const refresh = () => { setActionError(null); invalidate(); };
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented label="Nhóm" value={view} onChange={setView} options={[{ value: 'genre', label: 'Theo thể loại' }, { value: 'upcoming', label: 'Sắp phát hành' }]} />
        <Segmented
          label="Sở hữu"
          value={ownership}
          onChange={setOwnership}
          options={[{ value: 'all', label: 'Tất cả' }, { value: 'owned', label: OWNERSHIP.owned }, { value: 'wishlist', label: OWNERSHIP.wishlist }, { value: 'none', label: 'Chưa phân loại' }]}
        />
        <Button className="ml-auto" onClick={() => openNewBook()}><Plus size={16} /> Thêm sách (chọn trạng thái TBR)</Button>
      </div>
      {actionError && <ErrorNote error={actionError} />}
      {view === 'genre' && <p className="text-xs text-ink-muted">Thể loại lấy từ genres/tags của sách; sách có nhiều tag xuất hiện ở từng nhóm. “Bắt đầu đọc” chuyển sang Đang đọc và tạo lượt đọc mới từ hôm nay.</p>}
      {groups.every(([, list]) => list.length === 0) && <p className="py-10 text-center text-ink-muted">{view === 'upcoming' ? 'Chưa có sách TBR nào có ngày phát hành sắp tới.' : 'Chưa có sách nào trong TBR.'}</p>}
      {groups.map(([name, list]) => list.length > 0 && (
        <section key={name}>
          <h3 className="mb-2 font-display text-lg">{name} <span className="text-sm text-ink-muted">({list.length})</span></h3>
          <ul className="flex flex-col gap-2">
            {list.map((item) => <Row key={`${name}-${item.id}`} item={item} onChange={refresh} onError={setActionError} />)}
          </ul>
          {view === 'upcoming' && <p className="mt-2 text-xs text-ink-muted">Ra mắt gần nhất: {formatDate(list[0].release_date)}</p>}
        </section>
      ))}
    </div>
  );
}
