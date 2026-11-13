import { useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSettings } from '../../hooks/queries.js';
import { api } from '../../lib/api.js';
import { Button } from '../ui/Button.jsx';
import { ErrorNote } from '../ui/ErrorNote.jsx';
import { Input } from '../ui/Input.jsx';
import { Spinner } from '../ui/Spinner.jsx';
import { useToast } from '../ui/Toast.jsx';

export function LanguageSettings() {
  const settings = useSettings();
  const client = useQueryClient();
  const toast = useToast();
  const [list, setList] = useState(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (settings.data) setList(settings.data.languages);
  }, [settings.data]);

  if (!list) return <Spinner />;
  const dirty = JSON.stringify(list) !== JSON.stringify(settings.data.languages);
  const duplicate = draft.trim() && list.some((entry) => entry.toLowerCase() === draft.trim().toLowerCase());

  const add = () => {
    if (!draft.trim() || duplicate) return;
    setList([...list, draft.trim()]);
    setDraft('');
  };
  const move = (index, direction) => {
    const next = [...list];
    const [item] = next.splice(index, 1);
    next.splice(index + direction, 0, item);
    setList(next);
  };

  async function save() {
    setSaving(true);
    setError(null);
    try {
      client.setQueryData(['settings'], await api.patch('/settings', { languages: list }));
      toast('Đã lưu danh sách ngôn ngữ');
    } catch (caught) {
      setError(caught);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <ErrorNote error={error} />
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          add();
        }}
      >
        <Input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Ví dụ: Tiếng Pháp" aria-label="Ngôn ngữ mới" aria-invalid={duplicate ? true : undefined} />
        <Button type="submit" disabled={!draft.trim() || duplicate}>
          <Plus size={16} /> Thêm
        </Button>
      </form>
      {duplicate && <p className="-mt-2 text-xs text-danger">Ngôn ngữ này đã có trong danh sách.</p>}
      <ul className="flex flex-col divide-y divide-line rounded-xl border border-line bg-surface">
        {list.length === 0 && <li className="px-4 py-3 text-sm text-ink-muted">Danh sách trống. Ô Ngôn ngữ trong form sách sẽ chỉ có lựa chọn “Chưa chọn”.</li>}
        {list.map((language, index) => (
          <li key={language} className="flex items-center gap-2 px-3 py-2">
            <span className="flex-1 text-sm">{language}</span>
            <Button variant="ghost" size="icon-sm" onClick={() => move(index, -1)} disabled={index === 0} aria-label={`Đưa ${language} lên`}>
              <ArrowUp size={15} />
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={() => move(index, 1)} disabled={index === list.length - 1} aria-label={`Đưa ${language} xuống`}>
              <ArrowDown size={15} />
            </Button>
            <Button variant="ghost" size="icon-sm" className="text-danger" onClick={() => setList(list.filter((entry) => entry !== language))} aria-label={`Xoá ${language}`}>
              <Trash2 size={15} />
            </Button>
          </li>
        ))}
      </ul>
      <p className="text-xs text-ink-muted">Xoá một ngôn ngữ khỏi danh sách không đổi các sách đang dùng ngôn ngữ đó.</p>
      <div className="flex gap-2">
        <Button variant="primary" onClick={save} disabled={!dirty || saving}>
          {saving && <Spinner />} Lưu danh sách
        </Button>
        <Button onClick={() => setList(settings.data.languages)} disabled={!dirty}>
          Bỏ thay đổi
        </Button>
      </div>
    </div>
  );
}
