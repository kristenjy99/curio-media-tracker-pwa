import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, BookOpen, Clapperboard, GripVertical, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Cover } from '../components/ui/Cover.jsx';
import { ErrorNote } from '../components/ui/ErrorNote.jsx';
import { Input } from '../components/ui/Input.jsx';
import { Segmented } from '../components/ui/Segmented.jsx';
import { Spinner } from '../components/ui/Spinner.jsx';
import { useToast } from '../components/ui/Toast.jsx';
import { useAuthors, useSeries } from '../hooks/queries.js';
import { api } from '../lib/api.js';
import { CATEGORIES, CATEGORY_LABELS, STATUS_LABELS } from '../lib/labels.js';
import { cn } from '../lib/utils.js';
import { categoryLabel, MEDIA_CATEGORIES, MEDIA_STATUS_LABELS } from '../media/mediaConfig.js';

const KIND_OPTIONS = [
  { value: 'all', label: 'Tất cả' },
  { value: 'book', label: 'Books' },
  { value: 'media', label: 'Medias' },
  { value: 'mixed', label: 'Cả hai' },
];

const BOOK_CATEGORY_OPTIONS = [{ value: 'all', label: 'Mọi thể loại' }, ...CATEGORIES.map((value) => ({ value, label: CATEGORY_LABELS[value] }))];
const MEDIA_CATEGORY_OPTIONS = [{ value: 'all', label: 'Mọi loại' }, ...MEDIA_CATEGORIES];
const VIEW_OPTIONS = [
  { value: 'series', label: 'Series' },
  { value: 'authors', label: 'Tác giả' },
];

const entryKey = (entry) => `${entry.source}-${entry.id}`;

function EntryRow({ entry, index, count, onMove, dragProps, dragging }) {
  const isBook = entry.source === 'book';
  const title = isBook ? (
    <Link to={`/books/${entry.id}`} className="font-medium hover:underline">
      {entry.title}
    </Link>
  ) : (
    <Link to={`/media/${entry.id}`} className="font-medium hover:underline">
      {entry.title}
    </Link>
  );
  const typeLabel = isBook ? CATEGORY_LABELS[entry.category] ?? entry.category : categoryLabel(entry.category);
  const statusLabel = isBook ? STATUS_LABELS[entry.status] ?? entry.status : MEDIA_STATUS_LABELS[entry.status] ?? entry.status;
  return (
    <li
      {...dragProps}
      className={cn('flex items-center gap-3 rounded-lg border border-transparent px-2 py-1.5 hover:bg-surface-2', dragging && 'border-moss bg-surface-2 opacity-60')}
    >
      <span className="cursor-grab text-ink-muted" title="Kéo để đổi thứ tự" aria-hidden>
        <GripVertical size={16} />
      </span>
      <span className="w-6 text-right text-sm tabular-nums text-ink-muted">{index + 1}</span>
      <div className="w-9 shrink-0">
        <Cover src={entry.cover_image} title={entry.title} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate">{title}</div>
        <div className="flex flex-wrap items-center gap-x-2 text-xs text-ink-muted">
          <span className="inline-flex items-center gap-1">
            {isBook ? <BookOpen size={12} /> : <Clapperboard size={12} />}
            {isBook ? 'Sách' : 'Media'} · {typeLabel}
          </span>
          {entry.subtitle && <span>{entry.subtitle}</span>}
          {entry.year && <span>{entry.year}</span>}
          {statusLabel && <span>{statusLabel}</span>}
          {entry.rating ? <span>{entry.rating} ★</span> : null}
        </div>
      </div>
      <div className="flex shrink-0 gap-0.5">
        <button type="button" disabled={index === 0} onClick={() => onMove(index, index - 1)} aria-label={`Đưa ${entry.title} lên`} className="rounded p-1.5 text-ink-muted hover:bg-line hover:text-ink disabled:opacity-30">
          <ArrowUp size={15} />
        </button>
        <button type="button" disabled={index === count - 1} onClick={() => onMove(index, index + 1)} aria-label={`Đưa ${entry.title} xuống`} className="rounded p-1.5 text-ink-muted hover:bg-line hover:text-ink disabled:opacity-30">
          <ArrowDown size={15} />
        </button>
      </div>
    </li>
  );
}

function SeriesCard({ group }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [dragIndex, setDragIndex] = useState(null);
  const [draft, setDraft] = useState(null);
  const entries = draft ?? group.entries;
  const save = useMutation({
    mutationFn: (next) => api.put('/series/order', { name: group.name, entries: next.map((entry) => ({ source: entry.source, id: entry.id })) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['series'] }),
    onError: (error) => toast(`Không lưu được thứ tự: ${error.message}`),
    onSettled: () => setDraft(null),
  });

  const move = (from, to) => {
    if (to < 0 || to >= entries.length || from === to) return;
    const next = [...entries];
    const [picked] = next.splice(from, 1);
    next.splice(to, 0, picked);
    setDraft(next);
    save.mutate(next);
  };

  return (
    <section className="rounded-2xl border border-line bg-surface/80 p-4">
      <header className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="font-display text-xl font-medium">{group.name}</h2>
        <span className="text-xs text-ink-muted">
          {group.book_count > 0 && <span>{`${group.book_count} sách`}</span>}
          {group.book_count > 0 && group.media_count > 0 && ' · '}
          {group.media_count > 0 && <span>{`${group.media_count} media`}</span>}
          {!group.ordered && group.entries.length > 1 && ' · chưa sắp xếp, đang theo năm rồi theo tên'}
        </span>
        {save.isPending && <Spinner />}
      </header>
      <ol className="flex flex-col">
        {entries.map((entry, index) => (
          <EntryRow
            key={entryKey(entry)}
            entry={entry}
            index={index}
            count={entries.length}
            onMove={move}
            dragging={dragIndex === index}
            dragProps={{
              draggable: true,
              onDragStart: (event) => {
                event.dataTransfer.effectAllowed = 'move';
                setDragIndex(index);
              },
              onDragOver: (event) => {
                event.preventDefault();
                if (dragIndex === null || dragIndex === index) return;
                const next = [...entries];
                const [picked] = next.splice(dragIndex, 1);
                next.splice(index, 0, picked);
                setDraft(next);
                setDragIndex(index);
              },
              onDragEnd: () => {
                setDragIndex(null);
                if (draft && draft.some((entry, i) => entryKey(entry) !== entryKey(group.entries[i]))) save.mutate(draft);
                else setDraft(null);
              },
            }}
          />
        ))}
      </ol>
    </section>
  );
}

function AuthorCard({ author, category }) {
  const books = category === 'all' ? author.books : author.books.filter((book) => book.category === category);
  return (
    <section className="rounded-2xl border border-line bg-surface/80 p-4">
      <header className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="font-display text-xl font-medium">{author.name}</h2>
        <span className="text-xs text-ink-muted">
          {books.length} sách{category !== 'all' && books.length !== author.count && ` (tổng ${author.count})`} · {author.finished} đã đọc
          {author.average_rating !== null && ` · trung bình ${author.average_rating.toFixed(2)} ★`}
        </span>
      </header>
      <ul className="flex flex-col">
        {books.map((book) => (
          <li key={book.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-surface-2">
            <div className="w-9 shrink-0">
              <Cover src={book.cover_image} title={book.title} />
            </div>
            <div className="min-w-0 flex-1">
              <Link to={`/books/${book.id}`} className="block truncate font-medium hover:underline">
                {book.title}
              </Link>
              <div className="flex flex-wrap items-center gap-x-2 text-xs text-ink-muted">
                <span>{CATEGORY_LABELS[book.category] ?? book.category}</span>
                {book.year && <span>{book.year}</span>}
                {book.status && <span>{STATUS_LABELS[book.status] ?? book.status}</span>}
                {book.rating ? <span>{book.rating} ★</span> : null}
                {book.series.length > 0 && <span>Series: {book.series.join(', ')}</span>}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function AuthorsView({ query, category }) {
  const authors = useAuthors();
  const list = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (authors.data?.data ?? []).filter((author) => {
      const books = category === 'all' ? author.books : author.books.filter((book) => book.category === category);
      if (!books.length) return false;
      return !needle || author.name.toLowerCase().includes(needle) || books.some((book) => book.title.toLowerCase().includes(needle));
    });
  }, [authors.data, query, category]);
  if (authors.isLoading) return <Spinner />;
  if (authors.error) return <ErrorNote error={authors.error} />;
  if (!list.length)
    return <p className="py-16 text-center text-sm text-ink-muted">{authors.data?.data?.length ? 'Không có tác giả nào khớp bộ lọc.' : 'Chưa có sách nào ghi tác giả.'}</p>;
  return (
    <>
      <p className="-mt-2 text-xs text-ink-muted">{list.length} tác giả. Sách nhiều tác giả (ngăn bằng dấu phẩy) có mặt ở từng tác giả.</p>
      <div className="grid gap-4 lg:grid-cols-2">
        {list.map((author) => (
          <AuthorCard key={author.key} author={author} category={category} />
        ))}
      </div>
    </>
  );
}

export function SeriesPage() {
  const series = useSeries();
  // Bộ lọc nằm trên URL để tải lại trang không mất.
  const [params, setParams] = useSearchParams();
  const kind = params.get('kind') ?? 'all';
  const category = params.get('cat') ?? 'all';
  const view = kind === 'book' ? params.get('view') ?? 'series' : 'series';
  const query = params.get('q') ?? '';
  const update = (patch) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        for (const [key, value] of Object.entries(patch)) {
          if (value === undefined || value === 'all' || value === '' || (key === 'view' && value === 'series')) next.delete(key);
          else next.set(key, value);
        }
        return next;
      },
      { replace: true },
    );

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (series.data?.data ?? []).filter((group) => {
      if (kind === 'book' && !group.book_count) return false;
      if (kind === 'media' && !group.media_count) return false;
      if (kind === 'mixed' && !(group.book_count && group.media_count)) return false;
      // Lọc category nhỏ: series phải có ít nhất một phần thuộc category đó.
      if (category !== 'all' && (kind === 'book' || kind === 'media') && !group.entries.some((entry) => entry.source === kind && entry.category === category)) return false;
      return !needle || group.name.toLowerCase().includes(needle) || group.entries.some((entry) => entry.title.toLowerCase().includes(needle));
    });
  }, [series.data, query, kind, category]);

  const categoryOptions = kind === 'book' ? BOOK_CATEGORY_OPTIONS : kind === 'media' ? MEDIA_CATEGORY_OPTIONS : null;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-3xl font-medium">Series</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-muted">
          Gom sách (trường Series trong form sửa sách) và media (ô Series) có cùng tên series, không phân biệt hoa thường. Kéo hoặc bấm mũi tên để đổi thứ tự, thứ tự được lưu ngay. Ở Books có thêm danh sách tác giả.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
          <Input
            value={query}
            onChange={(event) => update({ q: event.target.value })}
            placeholder={view === 'authors' ? 'Tìm tác giả hoặc tên sách' : 'Tìm series hoặc tên phần'}
            aria-label="Tìm"
            className="pl-9"
          />
        </div>
        <Segmented size="sm" label="Lọc theo Books hoặc Medias" value={kind} onChange={(value) => update({ kind: value, cat: undefined, view: undefined })} options={KIND_OPTIONS} />
        {kind === 'book' && <Segmented size="sm" label="Kiểu xem" value={view} onChange={(value) => update({ view: value })} options={VIEW_OPTIONS} />}
      </div>
      {categoryOptions && (
        <Segmented
          size="sm"
          label={kind === 'book' ? 'Lọc theo thể loại sách' : 'Lọc theo loại media'}
          value={category}
          onChange={(value) => update({ cat: value })}
          options={categoryOptions}
          className="-mt-2 self-start"
        />
      )}
      {view === 'authors' ? (
        <AuthorsView query={query} category={category} />
      ) : (
        <>
          {series.isLoading && <Spinner />}
          {series.error && <ErrorNote error={series.error} />}
          {series.data && groups.length === 0 && (
            <p className="py-16 text-center text-sm text-ink-muted">
              {series.data.data.length ? 'Không có series nào khớp bộ lọc.' : 'Chưa có series nào. Điền trường Series khi sửa sách hoặc ô Series khi sửa media.'}
            </p>
          )}
          <div className="grid gap-4 lg:grid-cols-2">
            {groups.map((group) => (
              <SeriesCard key={group.key} group={group} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
