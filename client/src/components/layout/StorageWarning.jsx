import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { storageInfo } from '../../lib/transport.js';

/**
 * Cảnh báo khi bản PWA không mở được OPFS (chế độ ẩn danh, trình duyệt cũ, hoặc một tab khác đang
 * giữ database). Khi đó app vẫn chạy nhưng DB nằm trong bộ nhớ, nghĩa là đóng tab là mất dữ liệu —
 * phải nói rõ thay vì để người dùng nhập liệu rồi mất.
 *
 * Chỉ mount ở bản PWA (xem AppShell.jsx). storageInfo đến từ lớp vận chuyển, mà bản Windows thay
 * bằng bản luôn trả persistent = true, nên component này không kéo worker vào bản Windows.
 */
export function StorageWarning() {
  const [state, setState] = useState(null);

  useEffect(() => {
    let alive = true;
    storageInfo()
      .then((info) => alive && setState(info))
      .catch((error) => alive && setState({ persistent: false, storageReason: String(error?.message ?? error) }));
    return () => {
      alive = false;
    };
  }, []);

  if (!state || state.persistent) return null;

  return (
    <div className="flex items-start gap-2 border-b border-amber-400/40 bg-amber-100/70 px-4 py-2 text-sm text-amber-950 dark:bg-amber-900/40 dark:text-amber-100">
      <AlertTriangle size={16} className="mt-0.5 shrink-0" />
      <p>
        Thiết bị này chưa lưu được dữ liệu lâu dài, app đang chạy với database trong bộ nhớ: đóng tab là mất. Thường là do mở ở chế độ ẩn danh
        hoặc app đang được mở ở một tab khác.
        {state.storageReason ? ` Lý do: ${state.storageReason}.` : ''}
      </p>
    </div>
  );
}
