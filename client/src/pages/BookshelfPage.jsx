import { Dices, Plus, Upload } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { FilterBar } from '../components/bookshelf/FilterBar.jsx';
import { ListView } from '../components/bookshelf/ListView.jsx';
import { Shelf } from '../components/bookshelf/Shelf.jsx';
import { ShelfCat } from '../components/bookshelf/Cat.jsx';
import { useLibraryActions } from '../components/layout/LibraryActions.jsx';
import { Button } from '../components/ui/Button.jsx';
import { ErrorNote } from '../components/ui/ErrorNote.jsx';
import { Spinner } from '../components/ui/Spinner.jsx';
import { useFacets, useItems, useSettings } from '../hooks/queries.js';
import { nextOrnamentSeed, placeOrnaments, readOrnamentSeed } from '../lib/ornaments.js';
import { CATEGORIES, CATEGORY_LABELS, STATUSES, STATUS_LABELS } from '../lib/labels.js';

const LIST_KEYS = ['status', 'tag', 'fandom', 'pairing', 'topic', 'author'];

function useFilters() {
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => {
    const result = {};
    for (const [key, value] of params) {
      if (LIST_KEYS.includes(key)) result[key] = [...(result[key] ?? []), value];
      else result[key] = value;
    }
    return result;
  }, [params]);

  const setFilters = useCallback(
    (patch) =>
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          for (const [key, value] of Object.entries(patch)) {
            next.delete(key);
            if (Array.isArray(value)) value.forEach((entry) => next.append(key, entry));
            else if (value !== undefined && value !== null && value !== '') next.set(key, value);
          }
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );
  return [filters, setFilters];
}

function EmptyLibrary() {
  const { openNewBook, openImport } = useLibraryActions();
  return (
    <div className="mt-10">
      <div className="relative">
        <div className="flex min-h-[220px] items-end justify-center px-4 pb-0">
          <ShelfCat className="w-28" />
        </div>
        <div className="shelf-plank" />
      </div>
      <div className="mx-auto mt-8 max-w-md text-center">
        <h2 className="font-display text-3xl">Kệ còn trống</h2>
        <p className="mt-2 text-ink-muted">Thêm cuốn đầu tiên, hoặc chuyển cả thư viện từ Goodreads hay Notion sang.</p>
        <div className="mt-5 flex justify-center gap-2">
          <Button variant="primary" onClick={() => openNewBook()}>
            <Plus size={16} /> Thêm sách
          </Button>
          <Button onClick={openImport}>
            <Upload size={16} /> Import
          </Button>
        </div>
      </div>
    </div>
  );
}

export function BookshelfPage() {
  const [filters, setFilters] = useFilters();
  const { openNewBook } = useLibraryActions();
  const navigate = useNavigate();
  const location = useLocation();
  const facets = useFacets();

  const query = {
    q: filters.q,
    main_category: filters.cat,
    status: filters.status,
    tag: filters.tag,
    // Fandom/pairing chỉ lọc khi đang xem kệ Fanfiction.
    fandom: filters.cat === 'Fanfiction' ? filters.fandom : undefined,
    pairing: filters.cat === 'Fanfiction' ? filters.pairing : undefined,
    // Chủ đề chỉ lọc khi đang xem kệ Nonfiction.
    topic: filters.cat === 'Nonfiction' ? filters.topic : undefined,
    rating_min: filters.rating && filters.rating !== 'none' ? filters.rating : undefined,
    unrated: filters.rating === 'none' ? 'true' : undefined,
    is_favorite: filters.fav ? 'true' : undefined,
    needs_review: filters.review ? 'true' : undefined,
    author: filters.author,
    // Bộ lọc năm phát hành đã bỏ (patch 6); link cũ có year_mode=release thì bỏ qua năm.
    read_year: filters.year_mode !== 'release' ? filters.year : undefined,
    sort: filters.sort ?? 'updated_at',
    order: (filters.sort ?? 'updated_at') === 'title' ? 'asc' : 'desc',
  };
  const items = useItems(query);
  const list = items.data?.data ?? [];
  // Mở trang chi tiết; lưu lại kệ + bộ lọc hiện tại để nút "Kệ sách" quay về đúng chỗ.
  const open = (item) => navigate(`/books/${item.id}`, { state: { from: `${location.pathname}${location.search}` } });

  const settings = useSettings();
  const [ornamentSeed, setOrnamentSeed] = useState(readOrnamentSeed);
  const ornamentSettings = settings.data?.ornaments;
  const hasOrnaments = Boolean(ornamentSettings?.enabled && ornamentSettings.per_shelf && ornamentSettings.items?.some((item) => item.enabled));
  const shelves = useMemo(() => {
    if (!filters.cat) {
      return CATEGORIES.map((category) => ({
        key: category,
        title: CATEGORY_LABELS[category],
        category,
        items: list.filter((item) => item.main_category === category),
      })).filter((shelf) => shelf.items.length);
    }
    return STATUSES.map((status) => ({
      key: status,
      title: STATUS_LABELS[status],
      category: filters.cat,
      items: list.filter((item) => item.status === status),
    })).filter((shelf) => shelf.items.length);
  }, [list, filters.cat]);

  if (facets.data?.total === 0) return <EmptyLibrary />;

  return (
    <div className="flex flex-col gap-8">
      <FilterBar filters={filters} setFilters={setFilters} facets={facets.data} />
      <ErrorNote error={items.error} />
      {items.isLoading && (
        <div className="flex items-center gap-2 py-16 text-ink-muted">
          <Spinner /> Đang lấy sách
        </div>
      )}
      {!items.isLoading && list.length === 0 && !items.error && (
        <div className="rounded-xl border border-dashed border-line px-6 py-14 text-center">
          <p className="font-display text-2xl">Không có cuốn nào khớp bộ lọc</p>
          <p className="mt-2 text-sm text-ink-muted">Thử bỏ bớt trạng thái, tác giả, năm hoặc tag đang chọn.</p>
        </div>
      )}
      {list.length > 0 &&
        (filters.view === 'list' ? (
          <ListView items={list} onOpen={open} />
        ) : (
          <div className="flex flex-col gap-10">
            {hasOrnaments && (
              <div className="-mb-8 flex justify-end">
                <Button variant="ghost" size="sm" onClick={() => setOrnamentSeed(nextOrnamentSeed())} title="Đặt lại đồ trang trí ở vị trí ngẫu nhiên khác">
                  <Dices size={15} /> Xếp lại đồ trang trí
                </Button>
              </div>
            )}
            {shelves.map((shelf, index) => (
              <Shelf
                key={shelf.key}
                title={shelf.title}
                items={shelf.items}
                onOpen={open}
                withCat={index === 0}
                ornaments={placeOrnaments(ornamentSettings, shelf.key, shelf.items.length, ornamentSeed)}
                action={
                  <Button variant="ghost" size="sm" onClick={() => openNewBook(shelf.category)} aria-label={`Thêm sách vào kệ ${shelf.title}`}>
                    <Plus size={15} /> <span className="hidden sm:inline">Thêm vào kệ này</span>
                  </Button>
                }
              />
            ))}
          </div>
        ))}
    </div>
  );
}
