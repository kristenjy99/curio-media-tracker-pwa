import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useChallenges, useMutate } from '../../hooks/queries.js';
import { firstLetter } from '../../lib/utils.js';
import { Button } from '../ui/Button.jsx';
import { Cover } from '../ui/Cover.jsx';
import { Dialog } from '../ui/Dialog.jsx';
import { ErrorNote } from '../ui/ErrorNote.jsx';
import { Input, Select, Textarea } from '../ui/Input.jsx';
import { BookSelect } from './BookSelect.jsx';

const TYPES = { prompt: 'Theo prompt', bingo: 'Reading bingo', az: 'A–Z' };

function CreateDialog({ onClose }) {
  const [form, setForm] = useState({ name: '', type: 'prompt', year: new Date().getFullYear(), size: 5, az_mode: 'title', prompts: '' });
  const create = useMutate(['fun']);
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const submit = (event) => {
    event.preventDefault();
    const prompts = form.prompts.split('\n').map((line) => line.trim()).filter(Boolean);
    const body = { name: form.name, type: form.type, year: Number(form.year) || undefined, prompts };
    if (form.type === 'bingo') body.size = Number(form.size);
    if (form.type === 'az') body.az_mode = form.az_mode;
    create.mutate({ method: 'post', path: '/challenges', body }, { onSuccess: onClose });
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()} title="Tạo challenge" size="sm">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <label className="text-sm font-medium">Tên<Input value={form.name} onChange={set('name')} required maxLength={100} className="mt-1" /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm font-medium">Loại
            <Select value={form.type} onChange={set('type')} className="mt-1">{Object.entries(TYPES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select>
          </label>
          <label className="text-sm font-medium">Năm<Input type="number" value={form.year} onChange={set('year')} className="mt-1" /></label>
        </div>
        {form.type === 'bingo' && (
          <label className="text-sm font-medium">Kích thước lưới
            <Select value={form.size} onChange={set('size')} className="mt-1">{[3, 4, 5].map((n) => <option key={n} value={n}>{n} × {n}</option>)}</Select>
          </label>
        )}
        {form.type === 'az' && (
          <label className="text-sm font-medium">Chữ cái theo
            <Select value={form.az_mode} onChange={set('az_mode')} className="mt-1"><option value="title">Chữ đầu của tiêu đề</option><option value="author">Chữ đầu của tên tác giả</option></Select>
          </label>
        )}
        {form.type !== 'az' && (
          <label className="text-sm font-medium">{form.type === 'bingo' ? 'Nội dung các ô (mỗi dòng một ô, có thể để trống)' : 'Danh sách đề bài (mỗi dòng một đề)'}
            <Textarea value={form.prompts} onChange={set('prompts')} className="mt-1" />
          </label>
        )}
        {create.error && <ErrorNote error={create.error} />}
        <Button type="submit" variant="primary" disabled={create.isPending}>Tạo</Button>
      </form>
    </Dialog>
  );
}

function SlotDialog({ challenge, slot, onClose }) {
  const update = useMutate(['fun']);
  const remove = useMutate(['fun']);
  const [label, setLabel] = useState(slot.label);
  const letterFilter = challenge.type === 'az' ? (item) => firstLetter(challenge.az_mode === 'author' ? item.creator_author : item.title) === slot.label : undefined;
  const save = (body) => update.mutate({ method: 'patch', path: `/challenge-slots/${slot.id}`, body }, { onSuccess: onClose });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()} title={challenge.type === 'az' ? `Chữ ${slot.label}` : slot.label || `Ô ${slot.position}`} size="sm">
      <div className="flex flex-col gap-3">
        {challenge.type !== 'az' && (
          <label className="text-sm font-medium">Nội dung ô
            <div className="mt-1 flex gap-2">
              <Input value={label} onChange={(event) => setLabel(event.target.value)} maxLength={200} />
              <Button onClick={() => save({ label })} disabled={label === slot.label}>Lưu</Button>
            </div>
          </label>
        )}
        <label className="text-sm font-medium">Sách gắn vào ô này
          <BookSelect value={slot.item_id} filter={letterFilter} onChange={(item_id) => save({ item_id })} className="mt-1" aria-label="Chọn sách cho ô" />
        </label>
        {challenge.type === 'az' && <p className="text-xs text-ink-muted">Chỉ hiện sách có {challenge.az_mode === 'author' ? 'tác giả' : 'tiêu đề'} bắt đầu bằng chữ {slot.label}. Một sách có thể nằm ở nhiều challenge.</p>}
        {challenge.type === 'prompt' && <Button variant="danger" onClick={() => remove.mutate({ method: 'delete', path: `/challenge-slots/${slot.id}` }, { onSuccess: onClose })}><Trash2 size={14} /> Xoá đề bài</Button>}
        {(update.error || remove.error) && <ErrorNote error={update.error ?? remove.error} />}
      </div>
    </Dialog>
  );
}

function ChallengeView({ challenge }) {
  const [slot, setSlot] = useState(null);
  const [newPrompt, setNewPrompt] = useState('');
  const mutate = useMutate(['fun']);
  const grid = challenge.type === 'bingo' ? Math.round(Math.sqrt(challenge.slots.length)) : challenge.type === 'az' ? 7 : 0;
  const open = (s) => setSlot(s.id);
  const active = challenge.slots.find((entry) => entry.id === slot);

  return (
    <section className="rounded-2xl border border-line bg-surface/80 p-5">
      <div className="mb-3 flex flex-wrap items-baseline gap-3">
        <h3 className="font-display text-xl">{challenge.name}</h3>
        <span className="text-sm text-ink-muted">{TYPES[challenge.type]}{challenge.year ? `, ${challenge.year}` : ''} · {challenge.filled}/{challenge.slots.length} ô</span>
        <Button variant="ghost" size="sm" className="ml-auto" onClick={() => window.confirm(`Xoá challenge “${challenge.name}”? Sách không bị xoá.`) && mutate.mutate({ method: 'delete', path: `/challenges/${challenge.id}` })}>
          <Trash2 size={14} /> Xoá
        </Button>
      </div>
      {challenge.type === 'prompt' ? (
        <>
          <ul className="flex flex-col gap-2">
            {challenge.slots.map((s) => (
              <li key={s.id}>
                <button type="button" onClick={() => open(s)} className="flex w-full items-center gap-3 rounded-lg border border-line bg-surface p-2 text-left hover:bg-surface-2">
                  <span className="w-8 shrink-0">{s.item_id ? <Cover src={s.cover_image} title={s.title} /> : <span className="block aspect-[2/3] rounded-sm border border-dashed border-line" />}</span>
                  <span className="flex-1">{s.label}</span>
                  <span className="text-sm text-ink-muted">{s.title ?? 'Chưa chọn sách'}</span>
                </button>
              </li>
            ))}
          </ul>
          <form className="mt-3 flex gap-2" onSubmit={(event) => { event.preventDefault(); if (newPrompt.trim()) mutate.mutate({ method: 'post', path: `/challenges/${challenge.id}/prompts`, body: { label: newPrompt } }, { onSuccess: () => setNewPrompt('') }); }}>
            <Input value={newPrompt} onChange={(event) => setNewPrompt(event.target.value)} placeholder="Thêm đề bài mới" aria-label="Đề bài mới" />
            <Button type="submit"><Plus size={14} /> Thêm</Button>
          </form>
        </>
      ) : (
        <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${grid}, minmax(0, 1fr))` }}>
          {challenge.slots.map((s) => (
            <button key={s.id} type="button" onClick={() => open(s)} title={s.title ?? s.label} className="flex min-h-[88px] flex-col items-center justify-between gap-1 rounded-lg border border-line bg-surface p-1.5 text-center text-xs hover:bg-surface-2">
              {challenge.type === 'az' && <span className="font-display text-lg">{s.label}</span>}
              {s.item_id ? <span className="w-9"><Cover src={s.cover_image} title={s.title} /></span> : null}
              <span className="line-clamp-2 text-ink-muted">{s.item_id ? s.title : challenge.type === 'bingo' ? s.label || '—' : ''}</span>
              {challenge.type === 'bingo' && s.item_id && s.label && <span className="line-clamp-1 text-[10px] text-ink-muted/80">{s.label}</span>}
            </button>
          ))}
        </div>
      )}
      {mutate.error && <ErrorNote error={mutate.error} className="mt-2" />}
      {active && <SlotDialog key={active.id} challenge={challenge} slot={active} onClose={() => setSlot(null)} />}
    </section>
  );
}

export function ChallengesTab() {
  const { data, error, isPending } = useChallenges();
  const [creating, setCreating] = useState(false);
  if (error) return <ErrorNote error={error} />;
  if (isPending) return <p className="text-ink-muted" role="status">Đang tải challenge</p>;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <p className="text-sm text-ink-muted">Một sách có thể gắn vào nhiều challenge, nhưng chỉ một ô trong cùng challenge.</p>
        <Button variant="primary" className="ml-auto" onClick={() => setCreating(true)}><Plus size={16} /> Tạo challenge</Button>
      </div>
      {data.data.length === 0 && <p className="py-10 text-center text-ink-muted">Chưa có challenge nào. Tạo theo prompt, bingo hoặc A–Z.</p>}
      {data.data.map((challenge) => <ChallengeView key={challenge.id} challenge={challenge} />)}
      {creating && <CreateDialog onClose={() => setCreating(false)} />}
    </div>
  );
}
