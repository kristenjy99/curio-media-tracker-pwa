import { ImagePlus, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { prepareImage } from '../../lib/images.js';
import { cn } from '../../lib/utils.js';
import { Button } from '../ui/Button.jsx';
import { Spinner } from '../ui/Spinner.jsx';
import { resolveFileUrl } from '../../lib/api.js';

/** Chọn ảnh từ máy, xem trước ngay; ảnh chỉ được tải lên khi bấm Lưu. */
export function ImagePicker({ label, hint, value, pending, onPick, onClear, shape = 'cover' }) {
  const inputRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!pending) {
      setPreview(null);
      return undefined;
    }
    const url = URL.createObjectURL(pending);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [pending]);

  const shown = preview ?? value;

  async function pick(file) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      onPick(await prepareImage(file));
    } catch (caught) {
      setError(caught.message);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="flex items-start gap-3">
      <div
        className={cn(
          'flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-dashed border-line bg-surface-2',
          shape === 'cover' ? 'h-28 w-[4.7rem]' : 'h-28 w-8',
        )}
      >
        {shown ? <img src={resolveFileUrl(shown)} alt={`Xem trước ${label.toLowerCase()}`} className="h-full w-full object-cover" /> : <ImagePlus size={16} className="text-ink-muted" aria-hidden />}
      </div>
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-xs text-ink-muted">{hint}</span>
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" onClick={() => inputRef.current?.click()} disabled={busy}>
            {busy ? <Spinner size={14} /> : <ImagePlus size={14} />} {shown ? 'Đổi ảnh' : 'Chọn ảnh'}
          </Button>
          {shown && (
            <Button size="sm" variant="ghost" onClick={onClear}>
              <X size={14} /> Bỏ ảnh
            </Button>
          )}
        </div>
        {error && <span className="text-xs text-danger">{error}</span>}
        <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif" className="sr-only" onChange={(event) => pick(event.target.files[0])} aria-label={`Chọn ${label.toLowerCase()}`} />
      </div>
    </div>
  );
}
