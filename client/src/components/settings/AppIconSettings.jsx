import { useQueryClient } from '@tanstack/react-query';
import { ImagePlus, Monitor, RotateCcw } from 'lucide-react';
import { useRef, useState } from 'react';
import { useSettings } from '../../hooks/queries.js';
import { api, IS_PWA, resolveFileUrl, sendBinary } from '../../lib/api.js';
import { CatMark } from '../bookshelf/Cat.jsx';
import { Button } from '../ui/Button.jsx';
import { ErrorNote } from '../ui/ErrorNote.jsx';

const ICON_SIZE = 256;

/** Thu ảnh về PNG vuông 256×256 (giữ tỉ lệ, nền trong suốt) để dùng làm favicon và file .ico. */
async function squarePng(file) {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = ICON_SIZE;
  canvas.height = ICON_SIZE;
  const context = canvas.getContext('2d');
  const scale = Math.min(ICON_SIZE / bitmap.width, ICON_SIZE / bitmap.height);
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, Math.round((ICON_SIZE - width) / 2), Math.round((ICON_SIZE - height) / 2), width, height);
  bitmap.close?.();
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Không xử lý được ảnh'))), 'image/png'));
}

const SHORTCUT_MESSAGES = {
  updated: 'Đã đổi biểu tượng của lối tắt trên Desktop.',
  renamed: 'Đã đổi tên lối tắt trên Desktop theo tên app và cập nhật biểu tượng.',
  unchanged: 'Lối tắt trên Desktop đã đúng tên và biểu tượng.',
  created: 'Đã tạo lối tắt trên Desktop, tên lối tắt là tên app.',
  missing: 'Chưa có lối tắt của app trên Desktop. Bấm "Tạo lối tắt Desktop" để tạo.',
  conflict: 'Trên Desktop đã có một file khác trùng tên app. Đổi tên hoặc xoá file đó rồi bấm "Tạo lối tắt Desktop".',
  unsupported: 'Máy này không phải Windows nên không đổi được lối tắt Desktop.',
  error: 'Không cập nhật được lối tắt Desktop. Chạy file tao-shortcut-desktop.bat và chụp lại thông báo trong cửa sổ đó.',
};

export function AppIconSettings() {
  const settings = useSettings();
  const queryClient = useQueryClient();
  const fileRef = useRef(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const icon = settings.data?.general?.app_icon;

  async function run(task) {
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const data = await task();
      if (data.general) queryClient.setQueryData(['settings'], (old) => ({ ...old, ...data, shortcut: undefined }));
      if (data.shortcut) setNotice([SHORTCUT_MESSAGES[data.shortcut.status] ?? SHORTCUT_MESSAGES.error, data.shortcut.status === 'error' ? data.shortcut.message : null].filter(Boolean).join(' '));
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function upload(file) {
    if (!file) return;
    run(async () => {
      if (file.type && file.type !== 'image/png') throw new Error('Chỉ nhận file PNG');
      const blob = await squarePng(file);
      return sendBinary('PUT', '/settings/app-icon', blob);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="grid h-16 w-16 place-items-center overflow-hidden rounded-2xl border border-line bg-surface">
        {icon ? <img src={resolveFileUrl(icon)} alt="Biểu tượng hiện tại" className="h-14 w-14 object-contain" /> : <CatMark size={48} />}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={pending}>
          <ImagePlus size={15} /> {icon ? 'Đổi biểu tượng' : 'Chọn file PNG'}
        </Button>
        {icon && (
          <Button variant="ghost" onClick={() => run(() => api.delete('/settings/app-icon'))} disabled={pending}>
            <RotateCcw size={15} /> Dùng biểu tượng mặc định
          </Button>
        )}
        {!IS_PWA && (
          <Button variant="ghost" onClick={() => run(() => api.post('/system/desktop-shortcut'))} disabled={pending}>
            <Monitor size={15} /> Tạo lối tắt Desktop
          </Button>
        )}
      </div>
      <input ref={fileRef} type="file" accept="image/png,.png" className="sr-only" onChange={(event) => upload(event.target.files[0])} aria-label="Chọn file biểu tượng" />
      {notice && <p className="w-full text-sm text-ink-soft">{notice}</p>}
      {error && <ErrorNote error={error} className="w-full" />}
    </div>
  );
}
