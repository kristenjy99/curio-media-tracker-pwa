import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, FolderOpen } from 'lucide-react';
import { useState } from 'react';
import { useStorage } from '../../hooks/queries.js';
import { api } from '../../lib/api.js';
import { Button } from '../ui/Button.jsx';
import { ErrorNote } from '../ui/ErrorNote.jsx';
import { Spinner } from '../ui/Spinner.jsx';
import { useToast } from '../ui/Toast.jsx';
import { FolderPicker } from './FolderPicker.jsx';

const SOURCE_LABELS = {
  default: 'mặc định, thư mục data trong project',
  config: 'đã chọn trong app',
  env: 'cố định bằng biến môi trường READING_TRACKER_STORAGE',
};

export function StorageSettings() {
  const storage = useStorage();
  const client = useQueryClient();
  const toast = useToast();
  const [picker, setPicker] = useState(false);
  const [target, setTarget] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function inspect(path) {
    setError(null);
    setBusy(true);
    try {
      setTarget(await api.post('/storage/inspect', { path }));
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  }

  async function change(mode) {
    setBusy(true);
    setError(null);
    try {
      const result = await api.put('/storage', { path: target.path, mode });
      await client.invalidateQueries();
      setTarget(null);
      toast(mode === 'copy' ? `Đã chuyển dữ liệu sang ${result.storage.root}. Thư mục cũ vẫn còn nguyên.` : `Đã mở dữ liệu ở ${result.storage.root}`);
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  }

  if (storage.isLoading) return <Spinner />;
  const info = storage.data;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <ErrorNote error={error ?? storage.error} />
      <section className="rounded-xl border border-line bg-surface p-5">
        <h3 className="font-display text-xl">Thư mục đang dùng</h3>
        <p className="mt-2 break-all font-mono text-sm">{info.current?.root}</p>
        <p className="mt-1 text-sm text-ink-muted">Nguồn: {SOURCE_LABELS[info.source]}</p>
        <dl className="mt-4 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
          <dt className="text-ink-muted">Database</dt>
          <dd className="break-all font-mono text-xs leading-6">{info.current?.dbFile}</dd>
          <dt className="text-ink-muted">Ảnh và file đính kèm</dt>
          <dd className="break-all font-mono text-xs leading-6">{info.current?.uploadsDir}</dd>
        </dl>
        <Button className="mt-5" onClick={() => setPicker(true)} disabled={info.locked_by_env}>
          <FolderOpen size={16} /> Đổi thư mục lưu trữ
        </Button>
        {info.locked_by_env && <p className="mt-2 text-sm text-ink-muted">Xoá biến READING_TRACKER_STORAGE trong file .env để đổi được từ app.</p>}
      </section>

      {busy && !target && (
        <p className="flex items-center gap-2 text-sm text-ink-muted">
          <Spinner /> Đang kiểm tra thư mục
        </p>
      )}

      {target && (
        <section className="rounded-xl border border-moss bg-surface p-5">
          <h3 className="font-display text-xl">Thư mục mới</h3>
          <p className="mt-2 break-all font-mono text-sm">{target.path}</p>
          <ul className="mt-3 flex flex-col gap-1 text-sm text-ink-muted">
            <li>{target.exists ? 'Thư mục đã có sẵn' : 'Thư mục chưa có, app sẽ tạo mới'}</li>
            <li>{target.writable ? 'Ghi được' : 'Không có quyền ghi'}</li>
            <li>
              {target.has_database
                ? `Đã có database (schema v${target.database_schema_version ?? '?'})`
                : 'Chưa có database'}
            </li>
          </ul>
          {target.warnings.map((warning) => (
            <p key={warning} className="mt-3 flex items-start gap-2 rounded-lg bg-honey/20 px-3 py-2 text-sm">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {warning}
            </p>
          ))}
          <div className="mt-5 flex flex-wrap gap-2">
            {target.has_database ? (
              <Button variant="primary" onClick={() => change('open')} disabled={busy || target.is_current}>
                {busy && <Spinner />} Mở dữ liệu có sẵn ở đây
              </Button>
            ) : (
              <Button variant="primary" onClick={() => change('copy')} disabled={busy || !target.writable || target.is_current}>
                {busy && <Spinner />} Chuyển dữ liệu sang đây
              </Button>
            )}
            <Button onClick={() => setTarget(null)}>Huỷ</Button>
          </div>
          <p className="mt-3 text-xs text-ink-muted">
            {target.has_database
              ? 'App sẽ dùng database ở thư mục này thay cho database hiện tại. Database hiện tại không bị xoá.'
              : 'App sao chép database, ảnh và file đính kèm sang đây rồi dùng thư mục mới. Thư mục cũ giữ nguyên để bạn tự xoá khi đã yên tâm.'}
          </p>
        </section>
      )}

      <FolderPicker open={picker} onOpenChange={setPicker} initialPath={info.current?.root} title="Chọn thư mục lưu trữ" onPick={inspect} />
    </div>
  );
}
