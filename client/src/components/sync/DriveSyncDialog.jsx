import { CheckCircle2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { runDriveSync, SYNC_FOLDER } from '../../lib/driveSync.js';
import { isGoogleConfigured } from '../../lib/googleConfig.js';
import { loadGoogleIdentity, requestDriveToken } from '../../lib/googleAuth.js';
import { formatDateTime } from '../../lib/utils.js';
import { Button } from '../ui/Button.jsx';
import { Dialog } from '../ui/Dialog.jsx';
import { ErrorNote } from '../ui/ErrorNote.jsx';
import { Spinner } from '../ui/Spinner.jsx';
import { useToast } from '../ui/Toast.jsx';

const STAT_LABELS = [
  ['pulled', 'Lấy về máy này'],
  ['pushed', 'Đẩy lên Drive'],
  ['deleted_local', 'Xoá trên máy này (đã xoá ở máy kia)'],
  ['deleted_remote', 'Xoá trên Drive (đã xoá ở máy này)'],
];

function Result({ result }) {
  const { stats, conflicts, files } = result;
  const changed = stats.pulled + stats.pushed + stats.deleted_local + stats.deleted_remote + files.downloaded + files.uploaded;
  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="flex items-center gap-2 font-medium">
        <CheckCircle2 size={18} className="text-moss" /> {changed ? 'Đồng bộ xong.' : 'Hai bên đã khớp, không có gì thay đổi.'}
      </p>
      <ul className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        {STAT_LABELS.map(([key, label]) => (
          <li key={key} className="contents">
            <span className="text-right font-semibold tabular-nums">{stats[key]}</span>
            <span>{label}</span>
          </li>
        ))}
        <li className="contents">
          <span className="text-right font-semibold tabular-nums">{files.downloaded}</span>
          <span>Ảnh/file tải về</span>
        </li>
        <li className="contents">
          <span className="text-right font-semibold tabular-nums">{files.uploaded}</span>
          <span>Ảnh/file đẩy lên</span>
        </li>
      </ul>
      <p className="text-xs text-ink-muted">Đơn vị là cả quyển sách hoặc cả một phim (cùng lượt đọc/xem, log, ghi chú), một challenge, một bracket hoặc một mục cài đặt.</p>
      {conflicts.length > 0 && (
        <div className="rounded-lg border border-line px-3 py-2">
          <p className="font-medium">{conflicts.length} mục bị sửa ở cả hai nơi, đã giữ bản mới hơn:</p>
          <ul className="mt-1 max-h-40 overflow-y-auto text-xs text-ink-muted">
            {conflicts.map((conflict) => (
              <li key={conflict.key} className="py-0.5">
                {conflict.title ?? conflict.key}: giữ bản {conflict.winner === 'local' ? 'của máy này' : 'trên Drive'} ({conflict.reason})
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Hai bước bấm cho thao tác khó hoàn tác, thay cho hộp thoại confirm của trình duyệt. */
function ConfirmButton({ children, confirmText, onConfirm, disabled }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return undefined;
    const timer = setTimeout(() => setArmed(false), 6000);
    return () => clearTimeout(timer);
  }, [armed]);
  return armed ? (
    <Button
      variant="danger"
      size="sm"
      disabled={disabled}
      onClick={() => {
        setArmed(false);
        onConfirm();
      }}
    >
      {confirmText}
    </Button>
  ) : (
    <Button size="sm" disabled={disabled} onClick={() => setArmed(true)}>
      {children}
    </Button>
  );
}

export function DriveSyncDialog({ open, onOpenChange }) {
  const client = useQueryClient();
  const toast = useToast();
  const status = useQuery({ queryKey: ['drive-sync-status'], queryFn: () => api.get('/drive-sync/status'), enabled: open });
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const configured = isGoogleConfigured();

  useEffect(() => {
    if (!open) {
      setResult(null);
      setError(null);
      setProgress('');
      return;
    }
    // Nạp sẵn thư viện đăng nhập: popup chỉ mở được ngay trong sự kiện bấm nút.
    if (configured) loadGoogleIdentity().catch(setError);
  }, [open, configured]);

  function afterChange() {
    client.invalidateQueries();
  }

  // Không async ở đầu hàm: requestDriveToken phải chạy ngay trong sự kiện bấm để popup không bị chặn.
  function start(mode) {
    setError(null);
    setResult(null);
    setBusy(true);
    setProgress('Đăng nhập Google');
    requestDriveToken()
      .then((accessToken) => runDriveSync({ accessToken, mode, onProgress: setProgress }))
      .then((outcome) => {
        setResult(outcome);
        afterChange();
        toast(mode === 'push' ? 'Đã ghi đè Drive bằng dữ liệu máy này' : 'Đồng bộ Drive xong');
      })
      .catch(setError)
      .finally(() => {
        setBusy(false);
        setProgress('');
        status.refetch();
      });
  }

  async function restore(id) {
    setError(null);
    setResult(null);
    setBusy(true);
    setProgress('Khôi phục bản chụp');
    try {
      const outcome = await api.post('/drive-sync/restore', { id });
      afterChange();
      toast(`Đã khôi phục: ${outcome.pulled} mục đặt lại, ${outcome.deleted} mục bỏ đi`);
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
      setProgress('');
      status.refetch();
    }
  }

  const data = status.data;
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !busy && onOpenChange(next)}
      title="Đồng bộ Google Drive"
      description={`Gộp dữ liệu giữa máy tính và điện thoại qua thư mục "${SYNC_FOLDER}" trên Drive của bạn.`}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)} disabled={busy}>
            Đóng
          </Button>
          <Button variant="primary" onClick={() => start('merge')} disabled={busy || !configured}>
            {busy && <Spinner />} Đồng bộ ngay
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {!configured && <ErrorNote error={{ message: 'Bản app này chưa có Google Client ID nên không đăng nhập được.' }} />}
        <ErrorNote error={error} />
        {busy && (
          <p className="flex items-center gap-2 text-sm" aria-live="polite">
            <Spinner /> {progress}…
          </p>
        )}
        {result && <Result result={result} />}
        {!busy && !result && (
          <p className="text-sm text-ink-muted">
            {data?.last_sync_at ? `Lần đồng bộ gần nhất: ${formatDateTime(data.last_sync_at)}.` : 'Máy này chưa đồng bộ lần nào.'} Bấm Đồng bộ ngay để đăng nhập Google (lần đầu sẽ hỏi quyền) và gộp hai bên. Cùng một mục sửa ở hai nơi thì bản sửa sau thắng nguyên khối.
          </p>
        )}

        <details className="rounded-lg border border-line text-sm">
          <summary className="cursor-pointer px-3 py-2 font-medium">Khôi phục và ghi đè</summary>
          <div className="flex flex-col gap-3 border-t border-line px-3 py-3">
            <p className="text-ink-muted">
              Trước mỗi lần đồng bộ có lấy dữ liệu về, app chụp lại dữ liệu của máy này (giữ 5 bản gần nhất). Khôi phục chỉ đặt lại dữ liệu trên máy này; muốn Drive và máy kia cũng theo thì bấm thêm Ghi đè Drive.
            </p>
            {data?.backups?.length ? (
              <ul className="flex flex-col gap-2">
                {data.backups.map((entry) => (
                  <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      {formatDateTime(entry.created_at)} <span className="text-ink-muted">({entry.reason}, {entry.units} mục)</span>
                    </span>
                    <ConfirmButton disabled={busy} confirmText="Bấm lần nữa để khôi phục" onConfirm={() => restore(entry.id)}>
                      Khôi phục
                    </ConfirmButton>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-ink-muted">Chưa có bản chụp nào.</p>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
              <span className="text-ink-muted">Ghi đè Drive bằng dữ liệu máy này: mục chỉ có trên Drive bị đánh dấu xoá, máy kia xoá theo ở lần đồng bộ sau (trừ mục máy kia sửa sau thời điểm ghi đè).</span>
              <ConfirmButton disabled={busy || !configured} confirmText="Bấm lần nữa để ghi đè Drive" onConfirm={() => start('push')}>
                Ghi đè Drive
              </ConfirmButton>
            </div>
          </div>
        </details>
      </div>
    </Dialog>
  );
}
