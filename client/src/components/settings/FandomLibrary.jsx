import { useQueryClient } from '@tanstack/react-query';
import { Database, Plus, Search, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFandomPairings, useSettings } from '../../hooks/queries.js';
import { api } from '../../lib/api.js';
import { Button } from '../ui/Button.jsx';
import { ChipsInput } from '../ui/ChipsInput.jsx';
import { ErrorNote } from '../ui/ErrorNote.jsx';
import { Input } from '../ui/Input.jsx';

/**
 * Kho fandom & cặp đôi: mỗi fandom một danh sách pairing. Form sửa fanfic chỉ gợi ý pairing của fandom đã chọn,
 * lấy từ kho này cộng với pairing đã có ở các fic cùng fandom. Thay đổi tự lưu.
 */
export function FandomLibrary() {
  const settings = useSettings();
  const bookMap = useFandomPairings();
  const client = useQueryClient();
  const [library, setLibrary] = useState(null);
  const [query, setQuery] = useState('');
  const [newFandom, setNewFandom] = useState('');
  const [error, setError] = useState(null);
  const [state, setState] = useState('idle');
  const timer = useRef(null);

  useEffect(() => {
    if (settings.data && library === null) setLibrary(settings.data.fandom_library ?? []);
  }, [settings.data, library]);

  const save = (next) => {
    setLibrary(next);
    setState('pending');
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        client.setQueryData(['settings'], await api.patch('/settings', { fandom_library: next }));
        setError(null);
        setState('saved');
      } catch (caught) {
        setError(caught);
        setState('idle');
      }
    }, 500);
  };

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (library ?? [])
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry }) => !needle || entry.fandom.toLowerCase().includes(needle) || entry.pairings.some((pairing) => pairing.toLowerCase().includes(needle)));
  }, [library, query]);

  if (library === null) return null;

  const addFandom = () => {
    const name = newFandom.trim();
    if (!name) return;
    if (library.some((entry) => entry.fandom.toLowerCase() === name.toLowerCase())) {
      setError(new Error(`"${name}" đã có trong kho`));
      return;
    }
    save([{ fandom: name, pairings: [] }, ...library]);
    setNewFandom('');
  };

  /** Gom các cặp fandom–pairing từ fic đã nhập vào kho, không xoá gì đã có. */
  const importFromBooks = () => {
    const next = library.map((entry) => ({ ...entry, pairings: [...entry.pairings] }));
    let added = 0;
    for (const [fandom, pairings] of Object.entries(bookMap.data?.data ?? {})) {
      let target = next.find((entry) => entry.fandom.toLowerCase() === fandom.toLowerCase());
      if (!target) {
        target = { fandom, pairings: [] };
        next.push(target);
      }
      for (const pairing of pairings) {
        if (!target.pairings.some((value) => value.toLowerCase() === pairing.toLowerCase())) {
          target.pairings.push(pairing);
          added += 1;
        }
      }
    }
    save(next);
    setError(added ? null : new Error('Không có cặp đôi mới nào từ dữ liệu sách'));
  };

  return (
    <section className="flex flex-col gap-4 border-t border-line pt-6">
      <div>
        <h3 className="font-display text-xl">Kho fandom & cặp đôi</h3>
        <p className="mt-1 max-w-3xl text-sm text-ink-muted">
          Khi sửa fanfic, chọn fandom xong thì ô Ship / pairing chỉ gợi ý cặp đôi của fandom đó, lấy từ kho này và từ các fic đã nhập. Ví dụ Harry Potter: Draco x Harry, Sirius x Remus.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm fandom hoặc cặp đôi" aria-label="Tìm trong kho" className="pl-9" />
        </div>
        <Input
          value={newFandom}
          onChange={(event) => setNewFandom(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && (event.preventDefault(), addFandom())}
          placeholder="Tên fandom mới"
          aria-label="Tên fandom mới"
          className="w-56"
        />
        <Button onClick={addFandom} disabled={!newFandom.trim()}>
          <Plus size={15} /> Thêm fandom
        </Button>
        <Button variant="ghost" onClick={importFromBooks} disabled={!bookMap.data}>
          <Database size={15} /> Thêm từ dữ liệu sách
        </Button>
        <span className="ml-auto text-xs text-ink-muted" role="status">
          {library.length} fandom · {state === 'pending' ? 'Đang lưu' : state === 'saved' ? 'Đã lưu' : ''}
        </span>
      </div>
      <ErrorNote error={error} />
      {library.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-ink-muted">Kho đang trống. Thêm fandom, hoặc bấm "Thêm từ dữ liệu sách" để lấy từ các fic đã nhập.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.map(({ entry, index }) => (
            <li key={`${index}-${entry.fandom}`} className="grid gap-2 rounded-xl border border-line bg-surface/70 p-3 sm:grid-cols-[14rem_1fr_auto] sm:items-start">
              <Input
                defaultValue={entry.fandom}
                onBlur={(event) => {
                  const name = event.target.value.trim();
                  if (!name || name === entry.fandom) {
                    event.target.value = entry.fandom;
                    return;
                  }
                  if (library.some((other, otherIndex) => otherIndex !== index && other.fandom.toLowerCase() === name.toLowerCase())) {
                    setError(new Error(`"${name}" đã có trong kho`));
                    event.target.value = entry.fandom;
                    return;
                  }
                  save(library.map((other, otherIndex) => (otherIndex === index ? { ...other, fandom: name } : other)));
                }}
                aria-label="Tên fandom"
                className="font-medium"
              />
              <ChipsInput
                value={entry.pairings}
                onChange={(pairings) => save(library.map((other, otherIndex) => (otherIndex === index ? { ...other, pairings } : other)))}
                suggestions={bookMap.data?.data?.[entry.fandom] ?? []}
                placeholder="Gõ cặp đôi rồi nhấn Enter"
                aria-label={`Cặp đôi của ${entry.fandom}`}
              />
              <Button variant="ghost" size="icon-sm" onClick={() => save(library.filter((_, otherIndex) => otherIndex !== index))} aria-label={`Xoá fandom ${entry.fandom}`} className="text-danger">
                <Trash2 size={15} />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
