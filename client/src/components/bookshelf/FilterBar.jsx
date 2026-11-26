import * as Popover from '@radix-ui/react-popover';
import { Check, Heart, AlertTriangle, HeartHandshake, LayoutGrid, Lightbulb, LayoutList, Library, PenLine, Search, Sparkles, Tag, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { CATEGORIES, CATEGORY_LABELS, SORT_OPTIONS, STATUSES, STATUS_LABELS } from '../../lib/labels.js';
import { cn } from '../../lib/utils.js';
import { usePairings, useTags } from '../../hooks/queries.js';
import { Button } from '../ui/Button.jsx';
import { Input, Select } from '../ui/Input.jsx';
import { Segmented } from '../ui/Segmented.jsx';

/** Chọn nhiều giá trị (tag, fandom, pairing); sách phải có đủ các giá trị đã chọn. `description` thay câu giải thích mặc định. */
function ListFilter({ entries, selected, onChange, label, noun, icon: Icon = Tag, hint, description }) {
  const [query, setQuery] = useState('');
  const visible = entries.filter((entry) => entry.tag.toLowerCase().includes(query.toLowerCase())).slice(0, 200);
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <Button variant={selected.length ? 'primary' : 'secondary'} size="md">
          <Icon size={15} />
          {selected.length ? `${selected.length} ${noun}` : label}
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="start" sideOffset={6} className="z-50 w-72 rounded-xl border border-line bg-surface p-3 shadow-xl">
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Tìm ${noun}`} aria-label={`Tìm ${noun}`} className="h-9" />
          <p className="mt-2 text-xs text-ink-muted">{description ?? <>Chọn nhiều {noun}: sách phải có đủ các {noun} đã chọn.{hint ? ` ${hint}` : ''}</>}</p>
          <ul className="mt-2 max-h-64 overflow-y-auto">
            {visible.length === 0 && <li className="px-2 py-3 text-sm text-ink-muted">Chưa có {noun} nào khớp.</li>}
            {visible.map(({ tag, count }) => {
              const active = selected.some((entry) => entry.toLowerCase() === tag.toLowerCase());
              return (
                <li key={tag}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={active}
                    onClick={() => onChange(active ? selected.filter((entry) => entry.toLowerCase() !== tag.toLowerCase()) : [...selected, tag])}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface-2"
                  >
                    <span className={cn('flex h-4 w-4 items-center justify-center rounded border', active ? 'border-moss bg-moss text-on-moss' : 'border-line')}>
                      {active && <Check size={12} />}
                    </span>
                    <span className="flex-1 truncate">{tag}</span>
                    <span className="text-xs text-ink-muted">{count}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {selected.length > 0 && (
            <Button variant="link" size="sm" className="mt-2" onClick={() => onChange([])}>
              Bỏ chọn tất cả
            </Button>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function FilterBar({ filters, setFilters, facets }) {
  const [search, setSearch] = useState(filters.q ?? '');
  useEffect(() => setSearch(filters.q ?? ''), [filters.q]);
  useEffect(() => {
    const timer = setTimeout(() => {
      if ((filters.q ?? '') !== search) setFilters({ q: search || undefined });
    }, 250);
    return () => clearTimeout(timer);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  const categoryOptions = useMemo(
    () => [
      { value: 'all', label: 'Tất cả', count: facets?.total },
      ...CATEGORIES.map((category) => ({ value: category, label: CATEGORY_LABELS[category], count: facets?.categories?.[category] ?? 0 })),
    ],
    [facets],
  );
  const years = facets?.read_years ?? [];
  const activeCount = [filters.q, filters.status?.length, filters.tag?.length, filters.fandom?.length, filters.pairing?.length, filters.topic?.length, filters.author?.length, filters.year, filters.rating, filters.fav, filters.review].filter(Boolean).length;
  const asEntries = (list) => (list ?? []).map((entry) => ({ tag: entry.value, count: entry.count }));
  // Đã chọn fandom thì danh sách pairing chỉ còn pairing của các fic thuộc (đủ) các fandom đó, số đếm cũng theo đó.
  // Tags chỉ gồm tag của sách thuộc thể loại đang xem.
  const tags = useTags(filters.cat);
  const isFanfic = filters.cat === 'Fanfiction';
  const pairings = usePairings(isFanfic ? filters.fandom ?? [] : []);
  // Tác giả: số sách theo thể loại đang xem; tác giả đang chọn mà không còn trong danh sách vẫn hiện để bỏ chọn được.
  const authorEntries = useMemo(() => {
    const entries = (facets?.authors ?? [])
      .map((entry) => ({ tag: entry.value, count: filters.cat ? entry.categories?.[filters.cat] ?? 0 : entry.count }))
      .filter((entry) => entry.count > 0);
    const missing = (filters.author ?? []).filter((value) => !entries.some((entry) => entry.tag.toLowerCase() === value.toLowerCase()));
    return [...entries, ...missing.map((value) => ({ tag: value, count: 0 }))];
  }, [facets, filters.cat, filters.author]);
  const pairingEntries = useMemo(() => {
    const entries = asEntries(pairings.data?.data);
    // Pairing đang chọn mà không còn trong danh sách vẫn hiện để bỏ chọn được.
    const missing = (filters.pairing ?? []).filter((value) => !entries.some((entry) => entry.tag.toLowerCase() === value.toLowerCase()));
    return [...entries, ...missing.map((value) => ({ tag: value, count: 0 }))];
  }, [pairings.data, filters.pairing]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented label="Thể loại" value={filters.cat ?? 'all'} onChange={(value) => setFilters({ cat: value === 'all' ? undefined : value })} options={categoryOptions} />
        <div className="relative ml-auto w-full sm:w-72">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm theo tên sách hoặc tác giả" aria-label="Tìm sách" className="pl-9" />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Trạng thái" className="flex flex-wrap gap-1">
          {STATUSES.map((status) => {
            const active = filters.status?.includes(status);
            return (
              <button
                key={status}
                type="button"
                aria-pressed={active}
                onClick={() =>
                  setFilters({ status: active ? filters.status.filter((entry) => entry !== status) : [...(filters.status ?? []), status] })
                }
                className={cn(
                  'h-10 rounded-lg border px-3 text-sm font-medium transition-colors',
                  active ? 'border-moss bg-moss text-on-moss' : 'border-line bg-surface text-ink-muted hover:text-ink',
                )}
              >
                {STATUS_LABELS[status]}
                <span className="ml-1.5 text-xs opacity-70">{facets?.statuses?.[status] ?? 0}</span>
              </button>
            );
          })}
        </div>
        <ListFilter
          entries={authorEntries}
          selected={filters.author ?? []}
          onChange={(author) => setFilters({ author })}
          label="Tác giả"
          noun="tác giả"
          icon={PenLine}
          description="Chọn nhiều tác giả: hiện sách của bất kỳ tác giả nào đã chọn."
        />
        <div className="flex items-center gap-1">
          <Select value={filters.year ?? ''} onChange={(event) => setFilters({ year: event.target.value || undefined, year_mode: undefined })} aria-label="Chọn năm đọc" className="w-auto">
            <option value="">Mọi năm đọc</option>
            {years.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </Select>
        </div>
        <Select value={filters.rating ?? ''} onChange={(event) => setFilters({ rating: event.target.value || undefined })} aria-label="Lọc theo rating" className="w-auto">
          <option value="">Mọi rating</option>
          <option value="5">5 sao</option>
          <option value="4">Từ 4 sao</option>
          <option value="3">Từ 3 sao</option>
          <option value="2">Từ 2 sao</option>
          <option value="1">Từ 1 sao</option>
          <option value="none">Chưa chấm</option>
        </Select>
        <Button variant={filters.fav ? 'primary' : 'secondary'} aria-pressed={Boolean(filters.fav)} onClick={() => setFilters({ fav: filters.fav ? undefined : '1' })}>
          <Heart size={15} fill={filters.fav ? 'currentColor' : 'none'} /> Yêu thích
          <span className="text-xs opacity-70">{facets?.favorites ?? 0}</span>
        </Button>
        {facets?.needs_review > 0 && (
          <Button variant={filters.review ? 'primary' : 'secondary'} aria-pressed={Boolean(filters.review)} onClick={() => setFilters({ review: filters.review ? undefined : '1' })}>
            <AlertTriangle size={15} /> Cần sửa <span className="text-xs opacity-70">{facets.needs_review}</span>
          </Button>
        )}
        <ListFilter entries={tags.data?.data ?? facets?.tags ?? []} selected={filters.tag ?? []} onChange={(tag) => setFilters({ tag })} label="Tags" noun="tag" />
        {filters.cat === 'Fanfiction' && (
          <>
            <ListFilter entries={asEntries(facets?.fandoms)} selected={filters.fandom ?? []} onChange={(fandom) => setFilters({ fandom })} label="Fandom" noun="fandom" icon={Sparkles} />
            <ListFilter
              entries={pairingEntries}
              selected={filters.pairing ?? []}
              onChange={(pairing) => setFilters({ pairing })}
              label="Pairing"
              noun="pairing"
              icon={HeartHandshake}
              hint={filters.fandom?.length ? `Chỉ hiện pairing thuộc fandom đã chọn: ${filters.fandom.join(', ')}.` : undefined}
            />
          </>
        )}
        {filters.cat === 'Nonfiction' && (
          <ListFilter entries={asEntries(facets?.topics)} selected={filters.topic ?? []} onChange={(topic) => setFilters({ topic })} label="Chủ đề" noun="chủ đề" icon={Lightbulb} />
        )}
        {activeCount > 0 && (
          <Button variant="ghost" onClick={() => setFilters({ q: undefined, status: [], tag: [], fandom: [], pairing: [], topic: [], author: [], year: undefined, rating: undefined, fav: undefined, review: undefined })}>
            <X size={15} /> Xoá bộ lọc
          </Button>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Select value={filters.sort ?? 'updated_at'} onChange={(event) => setFilters({ sort: event.target.value })} aria-label="Sắp xếp" className="w-auto">
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          <div role="radiogroup" aria-label="Kiểu hiển thị" className="flex rounded-lg border border-line bg-surface p-0.5">
            {[
              { value: 'shelf', label: 'Kệ sách', icon: Library },
              { value: 'grid', label: 'Lưới bìa', icon: LayoutGrid },
              { value: 'list', label: 'Danh sách', icon: LayoutList },
            ].map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={(filters.view ?? 'shelf') === value}
                aria-label={label}
                title={label}
                onClick={() => setFilters({ view: value })}
                className={cn('rounded-md p-2', (filters.view ?? 'shelf') === value ? 'bg-surface-2 text-ink' : 'text-ink-muted hover:text-ink')}
              >
                <Icon size={17} />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
