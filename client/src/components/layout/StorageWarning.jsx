import { useEffect, useState } from 'react';
import { AlertTriangle, AppWindow, RotateCw } from 'lucide-react';
import { onSuperseded, storageInfo } from '../../lib/transport.js';
import { Button } from '../ui/Button.jsx';

// Lỗi do cửa sổ/tab khác đang giữ file database (khớp với LOCKED trong server/platform/browserConnection.js).
const LOCKED = /access handle|NoModificationAllowed|modification is not allowed/i;

/**
 * Cảnh báo về nơi lưu database của bản PWA:
 * - Không mở được OPFS (chế độ ẩn danh, trình duyệt cũ, hoặc một cửa sổ khác vẫn giữ database sau khi đã
 *   chờ): app vẫn chạy nhưng DB nằm trong bộ nhớ, đóng tab là mất, nên phải nói rõ.
 * - Cửa sổ khác vừa lấy quyền giữ database (xem lib/workerTransport.js): cửa sổ này đã ngừng dùng DB,
 *   che toàn bộ giao diện để không ai nhập liệu vào một cửa sổ không còn lưu được.
 *
 * Chỉ mount ở bản PWA (xem AppShell.jsx). Bản Windows thay transport bằng bản luôn trả persistent = true
 * và không bao giờ báo superseded, nên component này không kéo worker vào bản Windows.
 */
export function StorageWarning() {
  const [state, setState] = useState(null);
  const [superseded, setSuperseded] = useState(false);

  useEffect(() => {
    let alive = true;
    storageInfo()
      .then((info) => alive && setState(info))
      .catch((error) => alive && setState({ persistent: false, storageReason: String(error?.message ?? error) }));
    const unsubscribe = onSuperseded(() => alive && setSuperseded(true));
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);

  if (superseded) {
    return (
      <div role="alertdialog" aria-modal="true" aria-labelledby="superseded-title" className="fixed inset-0 z-[100] flex items-center justify-center bg-paper/95 p-6 backdrop-blur-sm">
        <div className="flex max-w-sm flex-col items-center gap-4 text-center">
          <AppWindow size={40} className="text-ink-muted" aria-hidden />
          <h2 id="superseded-title" className="font-display text-2xl">
            App đang được mở ở cửa sổ khác
          </h2>
          <p className="text-sm text-ink-muted">
            Mỗi lần chỉ một cửa sổ được dùng dữ liệu. Cửa sổ này đã dừng để không ghi đè dữ liệu. Những gì đã lưu trước đó vẫn còn nguyên.
          </p>
          <Button variant="primary" onClick={() => window.location.reload()} autoFocus>
            <RotateCw size={16} /> Dùng app ở cửa sổ này
          </Button>
        </div>
      </div>
    );
  }

  if (!state || state.persistent) return null;
  const locked = LOCKED.test(state.storageReason ?? '');

  return (
    <div role="alert" className="flex flex-wrap items-start gap-2 border-b border-amber-400/40 bg-amber-100/70 px-4 py-2 text-sm text-amber-950 dark:bg-amber-900/40 dark:text-amber-100">
      <AlertTriangle size={16} className="mt-0.5 shrink-0" />
      {locked ? (
        <p className="min-w-0 flex-1">
          App đang được mở ở một cửa sổ hoặc tab khác, nên cửa sổ này không mở được dữ liệu và đang chạy tạm trong bộ nhớ: đừng nhập gì ở đây. Đóng các cửa sổ
          app và tab Chrome khác rồi bấm Thử lại. Dữ liệu đã lưu vẫn còn nguyên.
        </p>
      ) : (
        <p className="min-w-0 flex-1">
          Thiết bị này chưa lưu được dữ liệu lâu dài, app đang chạy với database trong bộ nhớ: đóng tab là mất. Thường là do mở ở chế độ ẩn danh
          hoặc app đang được mở ở một tab khác.
          {state.storageReason ? ` Lý do: ${state.storageReason}.` : ''}
        </p>
      )}
      {locked && (
        <Button size="sm" onClick={() => window.location.reload()}>
          <RotateCw size={14} /> Thử lại
        </Button>
      )}
    </div>
  );
}
