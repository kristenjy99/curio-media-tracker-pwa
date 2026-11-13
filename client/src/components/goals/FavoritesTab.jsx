import { useState } from 'react';
import { useFavorites, useMutate, useReadings } from '../../hooks/queries.js';
import { MONTH_NAMES } from '../../lib/utils.js';
import { Button } from '../ui/Button.jsx';
import { Cover } from '../ui/Cover.jsx';
import { Dialog } from '../ui/Dialog.jsx';
import { ErrorNote } from '../ui/ErrorNote.jsx';
import { BookSelect } from './BookSelect.jsx';

function PickDialog({ year, month, current, readIds, onClose }) {
  const [ids, setIds] = useState([0, 1, 2].map((i) => current[i]?.id ?? null));
  const save = useMutate(['fun']);
  const submit = () => {
    const chosen = ids.filter(Boolean);
    save.mutate({ method: 'put', path: `/favorites/${year}/${month}`, body: { item_ids: chosen } }, { onSuccess: onClose });
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()} title={`Yêu thích ${MONTH_NAMES[month - 1].toLowerCase()} ${year}`} description="Tối đa 3 sách, chỉ chọn được sách có ngày đọc xong trong tháng này. Không đủ 3 sách vẫn đưa được vào bracket." size="sm"
      footer={<><Button variant="ghost" onClick={onClose}>Huỷ</Button><Button variant="primary" onClick={submit} disabled={save.isPending}>Lưu</Button></>}>
      <div className="flex flex-col gap-3">
        {ids.map((id, index) => (
          <BookSelect key={index} value={id} onChange={(value) => setIds((list) => list.map((entry, i) => (i === index ? value : entry)))} filter={(item) => readIds.includes(item.id)} placeholder={readIds.length ? `Chọn sách ${index + 1}` : 'Chưa có sách đọc xong trong tháng'} aria-label={`Sách yêu thích ${index + 1}`} />
        ))}
        {new Set(ids.filter(Boolean)).size !== ids.filter(Boolean).length && <p className="text-sm text-danger" role="alert">Mỗi sách chỉ chọn một lần.</p>}
        {save.error && <ErrorNote error={save.error} />}
      </div>
    </Dialog>
  );
}

export function FavoritesTab({ year }) {
  const { data, error, isPending } = useFavorites(year);
  const readings = useReadings(year);
  const [month, setMonth] = useState(null);
  if (error) return <ErrorNote error={error} />;
  if (isPending) return <p className="text-ink-muted" role="status">Đang tải</p>;
  const readIdsOf = (m) => (readings.data?.reads ?? []).filter((read) => read.state === 'finished' && read.finish_date && Number(read.finish_date.slice(5, 7)) === m).map((read) => read.item_id);
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {data.months.map((entry) => (
        <section key={entry.month} className="rounded-2xl border border-line bg-surface/80 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-display text-lg">{MONTH_NAMES[entry.month - 1]}</h3>
            <Button size="sm" onClick={() => setMonth(entry.month)}>{entry.books.length ? 'Sửa' : 'Chọn'}</Button>
          </div>
          {entry.books.length === 0 ? <p className="text-sm text-ink-muted">Chưa chọn.</p> : (
            <ul className="flex gap-3">
              {entry.books.map((book) => (
                <li key={book.id} className="w-20 text-center text-xs"><Cover src={book.cover_image} title={book.title} /><span className="mt-1 line-clamp-2 block">{book.title}</span></li>
              ))}
            </ul>
          )}
        </section>
      ))}
      {month && <PickDialog key={month} year={year} month={month} current={data.months[month - 1].books} readIds={readIdsOf(month)} onClose={() => setMonth(null)} />}
    </div>
  );
}
