import { CheckCircle2, ChevronDown, FolderOpen } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useSyncStatus } from '../../hooks/queries.js';
import { api } from '../../lib/api.js';
import { SYNC_ACTION_LABELS } from '../../lib/labels.js';
import { formatDateTime } from '../../lib/utils.js';
import { Button } from '../ui/Button.jsx';
import { Dialog } from '../ui/Dialog.jsx';
import { ErrorNote } from '../ui/ErrorNote.jsx';
import { Spinner } from '../ui/Spinner.jsx';
import { useToast } from '../ui/Toast.jsx';

const ORDER = ['create_file', 'move_file', 'write_file', 'recreate_file', 'overwrite_external_edit', 'sync_media', 'trash_file', 'trash_media', 'track_move', 'import_new', 'import_file', 'conflict', 'ignored', 'skip', 'failed'];

function ActionGroups({ report }) {
  const groups = ORDER.map((type) => ({ type, actions: report.actions.filter((action) => (action.error ? 'failed' : action.action) === type) })).filter(
    (group) => group.actions.length,
  );
  if (!groups.length) return <p className="text-sm text-ink-muted">Không có gì cần thay đổi. Vault đã khớp với app.</p>;
  return (
    <ul className="flex flex-col gap-2">
      {groups.map(({ type, actions }) => (
        <li key={type}>
          <details className="group rounded-lg border border-line">
            <summary className="flex cursor-pointer list-none items-center gap-3 px-3 py-2.5 text-sm">
              <span className="w-8 text-right font-semibold tabular-nums">{actions.length}</span>
              <span className="flex-1">{SYNC_ACTION_LABELS[type] ?? type}</span>
              <ChevronDown size={16} className="text-ink-muted transition-transform group-open:rotate-180" aria-hidden />
            </summary>
            <ul className="max-h-48 overflow-y-auto border-t border-line px-3 py-2 text-xs text-ink-muted">
              {actions.map((action) => (
                <li key={`${action.scope ?? 'book'}-${action.path}-${action.item_id ?? ''}`} className="py-0.5">
                  {action.scope === 'media' && <span className="mr-1 rounded bg-surface-2 px-1 text-[10px] font-medium text-ink">Media</span>}
                  {action.action === 'move_file' && action.from ? `${action.from} → ${action.path}` : action.path}
                  {action.action === 'sync_media' && (
                    <span>
                      {' '}
                      ({[action.copy ? `chép ${action.copy} file` : null, action.remove ? `bỏ ${action.remove} file thừa vào .trash` : null].filter(Boolean).join(', ') || 'thiếu file'})
                    </span>
                  )}
                  {action.conflict_path && <span> (bản cũ: {action.conflict_path})</span>}
                  {action.reason && <span className="text-danger"> {action.reason}</span>}
                  {action.error && <span className="text-danger"> {action.error}</span>}
                </li>
              ))}
            </ul>
          </details>
        </li>
      ))}
    </ul>
  );
}

export function SyncDialog({ open, onOpenChange }) {
  const status = useSyncStatus();
  const client = useQueryClient();
  const toast = useToast();
  const [plan, setPlan] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const ready = status.data?.sync_enabled && !status.data?.sync_folder_error;

  useEffect(() => {
    if (!open) {
      setPlan(null);
      setResult(null);
      setError(null);
      return;
    }
    status.refetch().then(({ data }) => {
      if (data?.sync_enabled && !data.sync_folder_error) preview();
    });
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  async function preview() {
    setBusy(true);
    setError(null);
    try {
      setPlan(await api.post('/sync/run?dry_run=true'));
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  }

  async function runSync() {
    setBusy(true);
    setError(null);
    try {
      const report = await api.post('/sync/run');
      setResult(report);
      client.invalidateQueries({ queryKey: ['sync-status'] });
      client.invalidateQueries({ queryKey: ['sync-config'] });
      client.invalidateQueries({ queryKey: ['items'] });
      const changed = report.actions.filter((action) => !['ignored', 'skip'].includes(action.action)).length;
      toast(changed ? `Đã sync ${changed} file sang Obsidian` : 'Vault đã khớp với app, không có gì thay đổi');
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  }

  const pending = plan?.actions.filter((action) => !['ignored', 'skip'].includes(action.action)).length ?? 0;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Sync sang Obsidian"
      description={status.data?.sync_folder ? `Thư mục: ${status.data.sync_folder}` : undefined}
      footer={
        ready &&
        (result ? (
          <Button variant="primary" onClick={() => onOpenChange(false)}>
            Xong
          </Button>
        ) : (
          <>
            <Button onClick={() => onOpenChange(false)}>Đóng</Button>
            <Button variant="primary" onClick={runSync} disabled={busy || !plan || pending === 0}>
              {busy && <Spinner />} Chạy sync
            </Button>
          </>
        ))
      }
    >
      <ErrorNote error={error} className="mb-4" />
      {status.isLoading && <Spinner />}
      {status.data && !ready && (
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-ink-muted">
            {status.data.sync_folder_error ?? 'Sync đang tắt.'} Chọn vault Obsidian và bật sync trong phần Cài đặt.
          </p>
          <Link
            to="/settings/obsidian"
            onClick={() => onOpenChange(false)}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-moss px-4 text-sm font-medium text-on-moss hover:brightness-110"
          >
            <FolderOpen size={16} /> Mở cài đặt Obsidian
          </Link>
        </div>
      )}
      {ready && busy && !plan && !result && (
        <p className="flex items-center gap-2 text-sm text-ink-muted">
          <Spinner /> Đang so sánh app với vault
        </p>
      )}
      {ready && plan && !result && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-ink-muted">
            Xem trước những gì sẽ xảy ra. Chưa có file nào bị đổi cho tới khi bấm Chạy sync.
            {status.data.last_sync_time && ` Lần sync trước: ${formatDateTime(status.data.last_sync_time)}.`}
          </p>
          <ActionGroups report={plan} />
        </div>
      )}
      {result && (
        <div className="flex flex-col gap-4">
          <p className="flex items-center gap-2 font-medium">
            <CheckCircle2 size={18} className="text-moss" /> Sync xong
          </p>
          <ActionGroups report={result} />
        </div>
      )}
    </Dialog>
  );
}
