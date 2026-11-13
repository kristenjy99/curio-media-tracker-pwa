import { Crown, Shuffle, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useBracketCandidates, useBrackets, useMutate } from '../../hooks/queries.js';
import { cn } from '../../lib/utils.js';
import { Button } from '../ui/Button.jsx';
import { Cover } from '../ui/Cover.jsx';
import { ErrorNote } from '../ui/ErrorNote.jsx';
import { Input, Select } from '../ui/Input.jsx';

const ROUND_NAMES = { 4: ['Bán kết', 'Chung kết'], 8: ['Tứ kết', 'Bán kết', 'Chung kết'], 16: ['Vòng 16', 'Tứ kết', 'Bán kết', 'Chung kết'] };

function BracketView({ bracket }) {
  const pick = useMutate(['fun']);
  const remove = useMutate(['fun']);
  const names = ROUND_NAMES[bracket.size];
  const champion = bracket.champion ? bracket.books[bracket.champion] : null;
  return (
    <section className="rounded-2xl border border-line bg-surface/80 p-5">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h3 className="font-display text-xl">{bracket.name}</h3>
        <span className="text-sm text-ink-muted">{bracket.size} sách, năm {bracket.year}</span>
        <Button variant="ghost" size="sm" className="ml-auto" onClick={() => window.confirm('Xoá bracket này?') && remove.mutate({ method: 'delete', path: `/brackets/${bracket.id}` })}><Trash2 size={14} /> Xoá</Button>
      </div>
      <div className="flex items-stretch gap-6 overflow-x-auto pb-2">
        {bracket.rounds.map((matches, round) => (
          <div key={round} className="flex min-w-[210px] flex-col justify-around gap-3">
            <h4 className="text-center text-sm text-ink-muted">{names[round]}</h4>
            {matches.map((match) => (
              <div key={match.match} className="flex flex-col gap-1 rounded-xl border border-line bg-surface p-1.5">
                {match.players.map((id, slot) => {
                  const book = id ? bracket.books[id] : null;
                  const won = id && match.winner === id;
                  return (
                    <button
                      key={slot}
                      type="button"
                      disabled={!book || pick.isPending}
                      aria-pressed={Boolean(won)}
                      onClick={() => pick.mutate({ method: 'put', path: `/brackets/${bracket.id}/pick`, body: { round, match: match.match, item_id: won ? null : id } })}
                      className={cn('flex items-center gap-2 rounded-lg px-2 py-1 text-left text-sm', won ? 'bg-moss text-on-moss' : 'hover:bg-surface-2 disabled:opacity-50', match.winner && !won && book && 'opacity-60')}
                    >
                      <span className="w-6 shrink-0">{book && <Cover src={book.cover_image} title={book.title} />}</span>
                      <span className="line-clamp-2">{book ? book.title : 'Chờ kết quả'}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        ))}
        <div className="flex min-w-[170px] flex-col items-center justify-center gap-2 text-center">
          <Crown className="text-honey" aria-hidden />
          {champion ? (
            <>
              <span className="w-20"><Cover src={champion.cover_image} title={champion.title} /></span>
              <span className="font-display">{champion.title}</span>
              <span className="text-xs text-ink-muted">Sách của năm {bracket.year}</span>
            </>
          ) : <span className="text-sm text-ink-muted">Bấm vào sách thắng ở từng trận</span>}
        </div>
      </div>
      {(pick.error || remove.error) && <ErrorNote error={pick.error ?? remove.error} />}
    </section>
  );
}

function CreateBracket({ year }) {
  const { data } = useBracketCandidates(year);
  const create = useMutate(['fun']);
  const [size, setSize] = useState(8);
  const [name, setName] = useState(`Sách của năm ${year}`);
  const [picked, setPicked] = useState([]);
  const candidates = data?.data ?? [];
  const toggle = (id) => setPicked((list) => (list.includes(id) ? list.filter((entry) => entry !== id) : list.length < size ? [...list, id] : list));
  const shuffle = () => setPicked((list) => [...list].sort(() => Math.random() - 0.5));
  return (
    <section className="rounded-2xl border border-line bg-surface/80 p-5">
      <h3 className="font-display text-xl">Tạo bracket</h3>
      <p className="mb-3 text-sm text-ink-muted">Ứng viên là sách yêu thích tháng và sách đánh dấu yêu thích đã đọc xong trong năm {year}. Thứ tự chọn quyết định cách xếp cặp (1 gặp 2, 3 gặp 4, ...).</p>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Input value={name} onChange={(event) => setName(event.target.value)} className="w-64" aria-label="Tên bracket" />
        <Select value={size} onChange={(event) => { setSize(Number(event.target.value)); setPicked([]); }} className="w-28" aria-label="Số sách"><option value={4}>4 sách</option><option value={8}>8 sách</option><option value={16}>16 sách</option></Select>
        <Button onClick={() => setPicked(candidates.slice(0, size).map((book) => book.id))}>Chọn top {size} theo rating</Button>
        <Button onClick={shuffle} disabled={picked.length < 2}><Shuffle size={14} /> Xáo cặp</Button>
        <span className="text-sm tabular-nums text-ink-muted">{picked.length}/{size}</span>
      </div>
      {candidates.length === 0 ? <p className="text-sm text-ink-muted">Chưa có ứng viên. Chọn yêu thích tháng hoặc đánh dấu yêu thích cho sách đã đọc trong năm.</p> : (
        <ul className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {candidates.map((book) => {
            const order = picked.indexOf(book.id);
            return (
              <li key={book.id}>
                <label className={cn('flex cursor-pointer items-center gap-2 rounded-lg border p-1.5 text-sm', order >= 0 ? 'border-moss bg-surface-2' : 'border-line')}>
                  <input type="checkbox" checked={order >= 0} onChange={() => toggle(book.id)} />
                  <span className="w-6 shrink-0"><Cover src={book.cover_image} title={book.title} /></span>
                  <span className="line-clamp-2 flex-1">{book.title}</span>
                  {order >= 0 && <span className="tabular-nums text-ink-muted">#{order + 1}</span>}
                </label>
              </li>
            );
          })}
        </ul>
      )}
      {create.error && <ErrorNote error={create.error} className="mt-2" />}
      <Button variant="primary" className="mt-3" disabled={picked.length !== size || !name.trim() || create.isPending} onClick={() => create.mutate({ method: 'post', path: '/brackets', body: { name, year, size, item_ids: picked } }, { onSuccess: () => setPicked([]) })}>Tạo bracket</Button>
    </section>
  );
}

export function BracketTab({ year }) {
  const { data, error } = useBrackets(year);
  if (error) return <ErrorNote error={error} />;
  return (
    <div className="flex flex-col gap-5">
      {(data?.data ?? []).map((bracket) => <BracketView key={bracket.id} bracket={bracket} />)}
      <CreateBracket year={year} />
    </div>
  );
}
