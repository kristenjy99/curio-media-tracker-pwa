import { useQuery } from '@tanstack/react-query';
import { ChevronUp, Folder, HardDrive, House } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api, toQuery } from '../../lib/api.js';
import { Button } from '../ui/Button.jsx';
import { Dialog } from '../ui/Dialog.jsx';
import { ErrorNote } from '../ui/ErrorNote.jsx';
import { Input } from '../ui/Input.jsx';
import { Spinner } from '../ui/Spinner.jsx';

/** Hộp thoại chọn thư mục trên máy (trình duyệt không cho web lấy đường dẫn thật nên server liệt kê giúp). */
export function FolderPicker({ open, onOpenChange, initialPath, title, onPick, highlightVault = false }) {
  const [current, setCurrent] = useState(initialPath || null);
  const [typed, setTyped] = useState(initialPath || '');
  useEffect(() => {
    if (open) {
      setCurrent(initialPath || null);
      setTyped(initialPath || '');
    }
  }, [open, initialPath]);

  const listing = useQuery({
    queryKey: ['fs-dirs', current],
    queryFn: () => api.get(`/fs/dirs${toQuery({ path: current })}`),
    enabled: open,
  });
  const data = listing.data;
  const go = (next) => {
    setCurrent(next);
    setTyped(next ?? '');
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description="Mở dần từng thư mục, hoặc dán đường dẫn đầy đủ vào ô bên dưới."
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Huỷ</Button>
          <Button
            variant="primary"
            disabled={!data?.path}
            onClick={() => {
              onPick(data.path);
              onOpenChange(false);
            }}
          >
            Chọn thư mục này
          </Button>
        </>
      }
    >
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (typed.trim()) setCurrent(typed.trim());
        }}
      >
        <Input value={typed} onChange={(event) => setTyped(event.target.value)} placeholder="D:\Obsidian\Vault" aria-label="Đường dẫn thư mục" />
        <Button type="submit">Mở</Button>
      </form>
      <div className="mt-3 flex items-center gap-1">
        <Button variant="ghost" size="sm" onClick={() => go(data?.parent ?? null)} disabled={!data?.path}>
          <ChevronUp size={15} /> Lên một cấp
        </Button>
        <Button variant="ghost" size="sm" onClick={() => go(data?.home)} disabled={!data?.home}>
          <House size={15} /> Thư mục người dùng
        </Button>
        <Button variant="ghost" size="sm" onClick={() => go(null)}>
          <HardDrive size={15} /> Ổ đĩa
        </Button>
      </div>
      <ErrorNote error={listing.error} className="mt-3" />
      {data?.path && (
        <p className="mt-3 break-all rounded-lg bg-surface-2 px-3 py-2 text-sm">
          {data.path}
          {highlightVault && data.is_obsidian_vault && <span className="ml-2 font-medium text-moss">Đây là vault Obsidian</span>}
        </p>
      )}
      <ul className="mt-2 max-h-[45vh] overflow-y-auto rounded-lg border border-line">
        {listing.isLoading && (
          <li className="flex items-center gap-2 px-3 py-3 text-sm text-ink-muted">
            <Spinner /> Đang đọc thư mục
          </li>
        )}
        {data && data.dirs.length === 0 && <li className="px-3 py-3 text-sm text-ink-muted">Không có thư mục con.</li>}
        {data?.dirs.map((dir) => (
          <li key={dir.path}>
            <button type="button" onClick={() => go(dir.path)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-2">
              {data.path ? <Folder size={16} className="text-ink-muted" /> : <HardDrive size={16} className="text-ink-muted" />}
              {dir.name}
            </button>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
