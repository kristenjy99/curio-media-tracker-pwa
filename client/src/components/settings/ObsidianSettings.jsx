import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, FolderOpen, Library } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useObsidianVaults, useSyncConfig, useSyncStatus } from '../../hooks/queries.js';
import { CATEGORIES, CATEGORY_LABELS } from '../../lib/labels.js';
import { api, ApiError } from '../../lib/api.js';
import { cn, formatDateTime } from '../../lib/utils.js';
import { useLibraryActions } from '../layout/LibraryActions.jsx';
import { Button } from '../ui/Button.jsx';
import { ErrorNote } from '../ui/ErrorNote.jsx';
import { Field } from '../ui/Field.jsx';
import { Input } from '../ui/Input.jsx';
import { Spinner } from '../ui/Spinner.jsx';
import { Switch } from '../ui/Switch.jsx';
import { useToast } from '../ui/Toast.jsx';
import { FolderPicker } from './FolderPicker.jsx';

const DIRECTIONS = [
  {
    value: 'app_to_obsidian',
    title: 'Một chiều: app sang Obsidian',
    body: 'App là nơi duy nhất nhập và sửa sách. File trong Obsidian chỉ để xem; nếu lỡ sửa, lần sync sau app ghi đè và giữ bản đã sửa thành file .conflict.',
  },
  {
    value: 'two_way',
    title: 'Hai chiều',
    body: 'Nhận cả thay đổi viết trong Obsidian. Sửa ở cả hai nơi thì bên sửa sau thắng, bản thua được giữ thành file .conflict.',
  },
];

function VaultGuide() {
  return (
    <details className="rounded-xl border border-line bg-surface px-4 py-3 text-sm">
      <summary className="cursor-pointer font-medium">Không thấy vault của bạn? Cách tìm đường dẫn vault</summary>
      <div className="mt-3 flex flex-col gap-3 leading-relaxed text-ink-muted">
        <p>
          Vault là thư mục trên máy mà Obsidian đang mở. Mọi note của bạn nằm trong thư mục đó, kèm một thư mục ẩn tên <span className="font-mono">.obsidian</span>.
        </p>
        <ol className="flex list-decimal flex-col gap-2 pl-5">
          <li>Mở Obsidian, chuột phải vào một note bất kỳ ở cột bên trái, chọn “Reveal in File Explorer” (macOS: “Reveal in Finder”). Cửa sổ thư mục chứa note đó sẽ mở ra.</li>
          <li>Đi lên các thư mục cha cho tới thư mục mang đúng tên vault (tên hiện ở góc dưới bên trái Obsidian).</li>
          <li>Bấm vào thanh địa chỉ của File Explorer, copy đường dẫn, ví dụ <span className="font-mono">D:\Obsidian\MyVault</span>, rồi dán vào ô Vault Obsidian bên dưới. Hoặc bấm nút Chọn và mở dần tới thư mục đó.</li>
        </ol>
        <p>Nếu thư mục đúng là vault, app sẽ báo “Đây là vault Obsidian”.</p>
      </div>
    </details>
  );
}

function DetectedVaults({ current, onUse, busy }) {
  const vaults = useObsidianVaults();
  const list = vaults.data?.vaults ?? [];
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h3 className="font-display text-xl">Vault Obsidian trên máy này</h3>
        <p className="mt-1 text-sm text-ink-muted">App đọc danh sách vault mà Obsidian đã từng mở. Chọn vault muốn sync sách vào.</p>
      </div>
      {vaults.isLoading && <Spinner />}
      {vaults.data && list.length === 0 && (
        <p className="rounded-xl border border-dashed border-line px-4 py-3 text-sm text-ink-muted">
          Không tìm thấy vault nào. Có thể Obsidian chưa được cài trên máy này hoặc chưa mở vault nào. Làm theo hướng dẫn bên dưới để tự chọn thư mục.
        </p>
      )}
      <ul className="flex flex-col gap-2">
        {list.map((vault) => {
          const selected = current === vault.path;
          return (
            <li key={vault.path} className={cn('flex items-start gap-3 rounded-xl border bg-surface p-4', selected ? 'border-moss' : 'border-line')}>
              <Library size={20} className="mt-0.5 shrink-0 text-ink-muted" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {vault.name}
                  {vault.open && <span className="ml-2 text-xs font-normal text-ink-muted">đang mở trong Obsidian</span>}
                </p>
                <p className="mt-0.5 break-all text-xs text-ink-muted">{vault.path}</p>
                {!vault.exists && <p className="mt-1 text-xs text-danger">Thư mục này không còn trên máy.</p>}
              </div>
              {selected ? (
                <span className="flex items-center gap-1 text-sm font-medium text-moss">
                  <CheckCircle2 size={16} /> Đang dùng
                </span>
              ) : (
                <Button size="sm" variant="primary" disabled={!vault.exists || busy} onClick={() => onUse(vault)}>
                  Dùng vault này
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function ObsidianSettings() {
  const config = useSyncConfig();
  const status = useSyncStatus();
  const client = useQueryClient();
  const toast = useToast();
  const { openSync } = useLibraryActions();
  const [form, setForm] = useState(null);
  const [picker, setPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  useEffect(() => {
    if (config.data)
      setForm({
        vault_path: config.data.vault_path ?? '',
        vault_subfolder: config.data.vault_subfolder,
        media_subfolder: config.data.media_subfolder ?? 'Media Tracker',
        sync_direction: config.data.sync_direction,
        sync_enabled: config.data.sync_enabled,
        category_folders: config.data.category_folders,
        folder_names: config.data.folder_names,
      });
  }, [config.data]);

  if (!form) return <Spinner />;

  async function save(patch = {}) {
    const next = { ...form, ...patch };
    setSaving(true);
    setError(null);
    setFieldErrors({});
    try {
      await api.patch('/sync-config', {
        vault_path: next.vault_path.trim() || null,
        vault_subfolder: next.vault_subfolder,
        media_subfolder: next.media_subfolder,
        sync_direction: next.sync_direction,
        sync_enabled: next.sync_enabled,
        category_folders: next.category_folders,
        folder_names: Object.fromEntries(Object.entries(next.folder_names).map(([category, name]) => [category, name.trim()])),
      });
      client.invalidateQueries({ queryKey: ['sync-config'] });
      client.invalidateQueries({ queryKey: ['sync-status'] });
      toast('Đã lưu cài đặt Obsidian');
    } catch (caught) {
      setError(caught);
      if (caught instanceof ApiError) setFieldErrors(caught.fieldErrors());
    } finally {
      setSaving(false);
    }
  }

  async function chooseVault(vault) {
    setForm((current) => ({ ...current, vault_path: vault.path, sync_enabled: true }));
    await save({ vault_path: vault.path, sync_enabled: true });
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <ErrorNote error={error} />
      <DetectedVaults current={config.data?.vault_path} onUse={chooseVault} busy={saving} />
      <VaultGuide />
      <Field
        label="Vault Obsidian"
        hint={config.data?.vault_detected === false ? 'Thư mục này không có .obsidian, có thể chưa phải vault.' : 'Thư mục gốc của vault, nơi có thư mục .obsidian.'}
        error={fieldErrors.vault_path}
      >
        {(props) => (
          <div className="flex gap-2">
            <Input {...props} value={form.vault_path} onChange={(event) => setForm({ ...form, vault_path: event.target.value })} placeholder="D:\Obsidian\MyVault" />
            <Button onClick={() => setPicker(true)}>
              <FolderOpen size={16} /> Chọn
            </Button>
          </div>
        )}
      </Field>
      <Field label="Thư mục sync trong vault" hint="Mỗi sách là một file .md trong thư mục này. Nên để riêng, không trộn với note khác." error={fieldErrors.vault_subfolder}>
        {(props) => <Input {...props} value={form.vault_subfolder} onChange={(event) => setForm({ ...form, vault_subfolder: event.target.value })} className="sm:w-80" />}
      </Field>
      <Field
        label="Thư mục media trong vault"
        hint="Tính từ gốc vault. Media luôn sync một chiều từ app, chia thư mục TV Series, Movies, Animation, YouTube, Short Dramas khi bật chia theo thể loại. Để trống thì không sync media."
        error={fieldErrors.media_subfolder}
      >
        {(props) => <Input {...props} value={form.media_subfolder} onChange={(event) => setForm({ ...form, media_subfolder: event.target.value })} className="sm:w-80" placeholder="Media Tracker" />}
      </Field>
      <fieldset className="flex flex-col gap-3 rounded-xl border border-line p-4">
        <legend className="px-1 text-sm font-medium">Thư mục theo thể loại</legend>
        <label className="flex items-center gap-3 text-sm">
          <Switch checked={form.category_folders} onCheckedChange={(checked) => setForm({ ...form, category_folders: checked })} aria-label="Chia thư mục theo thể loại" />
          Chia sách vào thư mục con theo thể loại
        </label>
        <p className="text-xs leading-relaxed text-ink-muted">
          Ví dụ <span className="font-mono">{form.vault_subfolder || 'Reading Tracker'}/{form.folder_names.Fanfiction}/Tên fic.md</span>. Ở chế độ một chiều, sách đã sync trước đó và sách vừa đổi thể loại sẽ được chuyển vào đúng thư mục ở lần sync tới; tên file giữ nguyên nên link [[...]] trong Obsidian vẫn chạy.
        </p>
        {form.category_folders && (
          <div className="grid gap-3 sm:grid-cols-2">
            {CATEGORIES.map((category) => (
              <label key={category} className="flex flex-col gap-1 text-xs text-ink-muted">
                Thư mục cho {CATEGORY_LABELS[category]}
                <Input
                  value={form.folder_names[category] ?? ''}
                  onChange={(event) => setForm({ ...form, folder_names: { ...form.folder_names, [category]: event.target.value } })}
                  className="h-9"
                  aria-invalid={fieldErrors['folder_names'] ? true : undefined}
                />
              </label>
            ))}
          </div>
        )}
        {fieldErrors['folder_names'] && <p className="text-xs text-danger">{fieldErrors['folder_names']}</p>}
        {Object.keys(fieldErrors).filter((key) => key.startsWith('folder_names.')).map((key) => (
          <p key={key} className="text-xs text-danger">
            {CATEGORY_LABELS[key.split('.')[1]] ?? key}: {fieldErrors[key]}
          </p>
        ))}
      </fieldset>
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Chiều sync</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {DIRECTIONS.map((direction) => (
            <label
              key={direction.value}
              className={cn(
                'flex cursor-pointer flex-col gap-1 rounded-xl border p-4 transition-colors',
                form.sync_direction === direction.value ? 'border-moss bg-surface' : 'border-line hover:border-sage',
              )}
            >
              <span className="flex items-center gap-2 font-medium">
                <input
                  type="radio"
                  name="sync_direction"
                  value={direction.value}
                  checked={form.sync_direction === direction.value}
                  onChange={() => setForm({ ...form, sync_direction: direction.value })}
                  className="accent-[var(--moss)]"
                />
                {direction.title}
              </span>
              <span className="text-sm leading-relaxed text-ink-muted">{direction.body}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className="flex items-center gap-3 text-sm font-medium">
        <Switch checked={form.sync_enabled} onCheckedChange={(checked) => setForm({ ...form, sync_enabled: checked })} aria-label="Bật sync" />
        Bật sync Obsidian
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" onClick={() => save()} disabled={saving}>
          {saving && <Spinner />} Lưu cài đặt
        </Button>
        <Button onClick={openSync} disabled={!status.data?.sync_enabled}>
          Sync ngay
        </Button>
        <span className="text-sm text-ink-muted">
          {status.data?.last_sync_time ? `Lần sync gần nhất: ${formatDateTime(status.data.last_sync_time)}` : 'Chưa sync lần nào'}
        </span>
      </div>
      <FolderPicker
        open={picker}
        onOpenChange={setPicker}
        initialPath={form.vault_path}
        title="Chọn vault Obsidian"
        highlightVault
        onPick={(path) => setForm({ ...form, vault_path: path })}
      />
    </div>
  );
}
