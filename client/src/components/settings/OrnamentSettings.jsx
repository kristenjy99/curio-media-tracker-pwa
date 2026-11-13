import { useQueryClient } from '@tanstack/react-query';
import { ImagePlus, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { useSettings } from '../../hooks/queries.js';
import { api, resolveFileUrl, sendBinary } from '../../lib/api.js';
import { Button } from '../ui/Button.jsx';
import { ErrorNote } from '../ui/ErrorNote.jsx';
import { Input, Select } from '../ui/Input.jsx';
import { Spinner } from '../ui/Spinner.jsx';

export const ORNAMENT_SIZE_LABELS = { sm: 'Nhỏ', md: 'Vừa', lg: 'Lớn' };

/** Đồ trang trí kệ sách: tải PNG/SVG, bật/tắt từng món, cỡ, số món mỗi tầng kệ. Thay đổi lưu ngay. */
export function OrnamentSettings() {
  const settings = useSettings();
  const client = useQueryClient();
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const ornaments = settings.data?.ornaments ?? { enabled: true, per_shelf: 2, items: [] };
  const store = (data) => client.setQueryData(['settings'], data);

  async function save(patch) {
    setError(null);
    // Cập nhật giao diện trước, lỗi thì tải lại từ server.
    store({ ...settings.data, ornaments: { ...ornaments, ...patch } });
    try {
      store(await api.patch('/settings', { ornaments: patch }));
    } catch (caught) {
      setError(caught);
      client.invalidateQueries({ queryKey: ['settings'] });
    }
  }
  const saveItem = (id, patch) =>
    save({ items: ornaments.items.map(({ id: itemId, name, enabled, size }) => ({ id: itemId, name, enabled, size, ...(itemId === id ? patch : {}) })) });

  async function upload(files) {
    if (!files?.length) return;
    setBusy(true);
    setError(null);
    try {
      for (const file of files) {
        try {
          store(await sendBinary('POST', `/settings/ornaments?name=${encodeURIComponent(file.name)}`, file));
        } catch (caught) {
          throw new Error(`${file.name}: ${caught.message ?? 'Không tải được'}`);
        }
      }
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function remove(id) {
    setError(null);
    try {
      store(await api.delete(`/settings/ornaments/${id}`));
    } catch (caught) {
      setError(caught);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" checked={ornaments.enabled} onChange={(event) => save({ enabled: event.target.checked })} className="h-4 w-4 accent-[var(--moss)]" />
          Hiện đồ trang trí trên kệ
        </label>
        <label className="inline-flex items-center gap-2 text-sm">
          Tối đa mỗi tầng kệ
          <Select value={ornaments.per_shelf} onChange={(event) => save({ per_shelf: Number(event.target.value) })} className="w-20" disabled={!ornaments.enabled}>
            {[0, 1, 2, 3, 4, 5, 6].map((count) => (
              <option key={count} value={count}>
                {count}
              </option>
            ))}
          </Select>
        </label>
        <Button onClick={() => fileRef.current?.click()} disabled={busy} className="ml-auto">
          {busy ? <Spinner /> : <ImagePlus size={15} />} Tải PNG/SVG lên
        </Button>
        <input ref={fileRef} type="file" multiple accept="image/png,image/svg+xml,.svg,.png" className="sr-only" onChange={(event) => upload([...event.target.files])} aria-label="Chọn file trang trí" />
      </div>
      <ErrorNote error={error} />
      {ornaments.items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-ink-muted">
          Chưa có đồ trang trí. Tải lên ảnh PNG nền trong suốt hoặc SVG (chậu cây, đèn, tượng nhỏ...), mỗi file tối đa 3MB.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {ornaments.items.map((item) => (
            <li key={item.id} className="flex gap-3 rounded-xl border border-line bg-surface/70 p-3">
              <div className="flex h-20 w-20 shrink-0 items-end justify-center rounded-lg bg-surface-2 p-1.5">
                <img src={resolveFileUrl(item.src)} alt="" className={`max-h-full max-w-full object-contain ${item.enabled ? '' : 'opacity-40'}`} />
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <Input value={item.name} onChange={(event) => saveItem(item.id, { name: event.target.value })} aria-label="Tên đồ trang trí" className="h-8" />
                <div className="flex items-center gap-2">
                  <label className="inline-flex items-center gap-1.5 text-sm">
                    <input type="checkbox" checked={item.enabled} onChange={(event) => saveItem(item.id, { enabled: event.target.checked })} className="h-4 w-4 accent-[var(--moss)]" />
                    Hiện
                  </label>
                  <Select value={item.size} onChange={(event) => saveItem(item.id, { size: event.target.value })} aria-label={`Cỡ của ${item.name}`} className="h-8 w-24">
                    {Object.entries(ORNAMENT_SIZE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                  <Button variant="ghost" size="icon-sm" onClick={() => remove(item.id)} aria-label={`Xoá ${item.name}`} className="ml-auto text-danger">
                    <Trash2 size={15} />
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
