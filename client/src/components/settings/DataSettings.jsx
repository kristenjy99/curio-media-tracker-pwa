import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, KeyRound, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { api, ApiError, IS_PWA, requestFile } from '../../lib/api.js';
import { canPickSaveLocation, saveBlobAs } from '../../lib/saveFile.js';
import { Button } from '../ui/Button.jsx';
import { ErrorNote } from '../ui/ErrorNote.jsx';
import { Field } from '../ui/Field.jsx';
import { Input } from '../ui/Input.jsx';
import { Spinner } from '../ui/Spinner.jsx';
import { useToast } from '../ui/Toast.jsx';

const fieldErrors = (error) => (error instanceof ApiError ? error.fieldErrors() : {});

function PasswordForm({ hasPassword, onSaved }) {
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setErrors({});
    setError(null);
    if (next !== repeat) {
      setErrors({ repeat: 'Hai lần nhập không khớp' });
      return;
    }
    setSaving(true);
    try {
      await api.put('/data/password', { ...(hasPassword ? { current_password: current } : {}), new_password: next });
      setCurrent('');
      setNext('');
      setRepeat('');
      toast(hasPassword ? 'Đã đổi mật khẩu' : 'Đã đặt mật khẩu');
      onSaved();
    } catch (err) {
      const fields = fieldErrors(err);
      if (Object.keys(fields).length) setErrors(fields);
      else setError(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex max-w-md flex-col gap-3">
      <h3 className="font-medium">{hasPassword ? 'Đổi mật khẩu xoá dữ liệu' : 'Đặt mật khẩu xoá dữ liệu'}</h3>
      {hasPassword && (
        <Field label="Mật khẩu hiện tại" error={errors.current_password}>
          {(props) => <Input {...props} type="password" autoComplete="current-password" value={current} onChange={(event) => setCurrent(event.target.value)} />}
        </Field>
      )}
      <Field label="Mật khẩu mới" hint="Ít nhất 4 ký tự" error={errors.new_password}>
        {(props) => <Input {...props} type="password" autoComplete="new-password" value={next} onChange={(event) => setNext(event.target.value)} />}
      </Field>
      <Field label="Nhập lại mật khẩu mới" error={errors.repeat}>
        {(props) => <Input {...props} type="password" autoComplete="new-password" value={repeat} onChange={(event) => setRepeat(event.target.value)} />}
      </Field>
      <ErrorNote error={error} />
      <div>
        <Button type="submit" variant="primary" disabled={saving || !next}>
          {saving ? <Spinner /> : <KeyRound size={16} />} {hasPassword ? 'Đổi mật khẩu' : 'Đặt mật khẩu'}
        </Button>
      </div>
    </form>
  );
}

function WipeForm({ status, onDone }) {
  const client = useQueryClient();
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  async function submit(event) {
    event.preventDefault();
    setErrors({});
    setError(null);
    setBusy(true);
    try {
      const response = await api.post('/data/wipe', { password });
      setPassword('');
      setResult(response);
      // Mọi màn hình đang lưu tạm dữ liệu cũ đều phải tải lại.
      await client.invalidateQueries();
      onDone();
    } catch (err) {
      const fields = fieldErrors(err);
      if (Object.keys(fields).length) setErrors(fields);
      else setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-xl border border-danger/40 p-4">
      <h3 className="font-medium text-danger">Làm sạch dữ liệu</h3>
      <div className="text-sm text-ink-muted">
        <p>
          Xoá toàn bộ {status.books} sách và {status.media} media, cùng lượt đọc, ghi chú, nhật ký đọc, mục tiêu, challenge, yêu thích theo tháng, bracket, thứ tự series, ảnh bìa và file đính kèm.
        </p>
        <p className="mt-1">
          Giữ lại: cài đặt giao diện, ngôn ngữ, template, mật khẩu này.
          {IS_PWA ? (
            // Trên điện thoại không có thư mục trên đĩa nên không có bản sao tự động; đường lùi là tự xuất file.
            ' Ở bản điện thoại không có bản sao tự động, nên hãy xuất bản sao dữ liệu ở trên trước khi xoá.'
          ) : (
            <>
              {' '}Cấu hình Obsidian cũng được giữ và file trong vault không bị đụng tới. Trước khi xoá, app chép database và chuyển ảnh/file vào thư mục <code>backups</code> trong thư mục lưu trữ; khi chắc chắn không cần nữa thì tự xoá thư mục đó.
            </>
          )}
        </p>
      </div>
      {!status.has_password ? (
        <p className="text-sm">Đặt mật khẩu ở trên trước thì mới làm sạch dữ liệu được.</p>
      ) : (
        <>
          <Field label="Mật khẩu" error={errors.password} className="max-w-md">
            {(props) => <Input {...props} type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />}
          </Field>
          <ErrorNote error={error} />
          <div>
            <Button type="submit" variant="danger" disabled={busy || !password}>
              {busy ? <Spinner /> : <Trash2 size={16} />} Xoá toàn bộ dữ liệu
            </Button>
          </div>
        </>
      )}
      {result && (
        <p className="rounded-lg bg-surface-2 p-3 text-sm" role="status">
          Đã xoá {result.deleted.books} sách và {result.deleted.media} media.
          {result.backup_dir && (
            <>
              {' '}Bản sao lưu: <code className="break-all">{result.backup_dir}</code>
            </>
          )}
        </p>
      )}
    </form>
  );
}

/**
 * Xuất bản sao database để người dùng tự giữ. Cần mật khẩu xoá dữ liệu vì file này chứa toàn bộ dữ
 * liệu, kể cả ghi chú riêng tư; nơi lưu do người dùng chọn qua hộp thoại của trình duyệt.
 *
 * Hai DB tách nhau (sách và media) nên xuất ra hai file, hỏi nơi lưu lần lượt.
 */
function ExportForm({ hasPassword }) {
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit(event) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      let saved = 0;
      for (const which of ['books', 'media']) {
        const { blob, filename } = await requestFile('POST', '/data/export', { password, db: which });
        const result = await saveBlobAs(blob, filename);
        if (result.saved) saved += 1;
      }
      setPassword('');
      if (saved) toast(canPickSaveLocation() ? `Đã lưu ${saved} file` : `Đã tải ${saved} file về thư mục Tải xuống`);
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  }

  if (!hasPassword) {
    return (
      <section className="rounded-2xl border border-line bg-surface p-5">
        <h2 className="mb-1 flex items-center gap-2 font-display text-xl"><Download size={18} /> Xuất bản sao dữ liệu</h2>
        <p className="text-sm text-ink-muted">Đặt mật khẩu ở trên trước đã; file xuất ra chứa toàn bộ dữ liệu nên cần mật khẩu mới lấy được.</p>
      </section>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-line bg-surface p-5">
      <h2 className="mb-1 flex items-center gap-2 font-display text-xl"><Download size={18} /> Xuất bản sao dữ liệu</h2>
      <p className="mb-4 text-sm text-ink-muted">
        Lấy ra hai file .sqlite (sách và media) để tự giữ hoặc chuyển sang máy khác.
        {canPickSaveLocation() ? ' Trình duyệt sẽ hỏi nơi lưu từng file.' : ' Trình duyệt này chỉ tải được về thư mục Tải xuống; bật "Hỏi nơi lưu mỗi file" trong cài đặt trình duyệt nếu muốn tự chọn.'}
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Mật khẩu" className="max-w-xs grow">
          {(props) => <Input {...props} type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />}
        </Field>
        <Button type="submit" disabled={busy || !password}>
          {busy ? <Spinner size={16} /> : <Download size={15} />} Xuất file
        </Button>
      </div>
      {error && <ErrorNote error={error} className="mt-3" />}
    </form>
  );
}

export function DataSettings() {
  const status = useQuery({ queryKey: ['data-status'], queryFn: () => api.get('/data/status') });
  if (status.isLoading) return <Spinner />;
  if (status.error) return <ErrorNote error={status.error} />;
  return (
    <div className="flex flex-col gap-6">
      <PasswordForm hasPassword={status.data.has_password} onSaved={() => status.refetch()} />
      <ExportForm hasPassword={status.data.has_password} />
      <WipeForm status={status.data} onDone={() => status.refetch()} />
    </div>
  );
}
