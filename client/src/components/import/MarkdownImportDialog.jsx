import { CheckCircle2, FileText, FolderOpen, Heart } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useInvalidateLibrary } from '../../hooks/queries.js';
import { api } from '../../lib/api.js';
import { CATEGORIES, CATEGORY_LABELS, STATUSES, STATUS_LABELS } from '../../lib/labels.js';
import { cn, readTextFile } from '../../lib/utils.js';
import { Button } from '../ui/Button.jsx';
import { Dialog } from '../ui/Dialog.jsx';
import { ErrorNote } from '../ui/ErrorNote.jsx';
import { Field } from '../ui/Field.jsx';
import { Select } from '../ui/Input.jsx';
import { Segmented } from '../ui/Segmented.jsx';
import { Spinner } from '../ui/Spinner.jsx';
import { Switch } from '../ui/Switch.jsx';
import { useToast } from '../ui/Toast.jsx';
import { SOURCES, StepIndicator } from './importShared.jsx';

const STEPS = ['Chọn note', 'Xem trước'];

const DETECTED_LABELS = {
  category: 'theo property Category',
  template: 'đoán theo template',
  default: 'thể loại mặc định',
  manual: 'bạn chọn',
};

/** Đọc các file .md đã chọn; bỏ thư mục ẩn của Obsidian (.obsidian, .trash) và file không phải .md. */
async function readMarkdownFiles(fileList) {
  const files = [];
  for (const file of fileList) {
    const relative = file.webkitRelativePath || file.name;
    if (!relative.toLowerCase().endsWith('.md')) continue;
    if (relative.split('/').some((segment) => segment.startsWith('.'))) continue;
    files.push({ path: relative, content: await readTextFile(file) });
  }
  return files;
}

export function MarkdownImportDialog({ open, onOpenChange, source, setSource }) {
  const toast = useToast();
  const invalidate = useInvalidateLibrary();
  const filesRef = useRef(null);
  const folderRef = useRef(null);
  const [category, setCategory] = useState('Fiction');
  const [files, setFiles] = useState(null);
  const [overrides, setOverrides] = useState({});
  // Trạng thái lạ trong note -> trạng thái của app do người dùng chọn; app nhớ lại sau khi nhập.
  const [statusMap, setStatusMap] = useState({});
  const [preview, setPreview] = useState(null);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [includeInvalid, setIncludeInvalid] = useState(false);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const step = result ? 2 : preview ? 1 : 0;

  const reset = () => {
    setFiles(null);
    setOverrides({});
    setStatusMap({});
    setPreview(null);
    setResult(null);
    setError(null);
  };

  async function run(action) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  }

  const requestPreview = (nextFiles, nextOverrides, nextStatusMap = statusMap) =>
    api.post('/import/markdown/preview', { files: nextFiles, default_category: category, overrides: nextOverrides, status_map: nextStatusMap });

  const mapStatus = (raw, status) =>
    run(async () => {
      const next = { ...statusMap, [raw]: status };
      setStatusMap(next);
      setPreview(await requestPreview(files, overrides, next));
    });

  const pick = (fileList) =>
    run(async () => {
      const read = await readMarkdownFiles([...(fileList ?? [])]);
      if (!read.length) throw new Error('Không có file .md nào trong lựa chọn này.');
      setFiles(read);
      setOverrides({});
      setStatusMap({});
      setPreview(await requestPreview(read, {}, {}));
    });

  const changeCategory = (path, value) =>
    run(async () => {
      const next = { ...overrides, [path]: value };
      setOverrides(next);
      setPreview(await requestPreview(files, next));
    });

  const commit = () =>
    run(async () => {
      const summary = await api.post('/import/markdown/commit', { files, default_category: category, overrides, status_map: statusMap, skip_duplicates: skipDuplicates, include_invalid: includeInvalid });
      setResult(summary);
      invalidate();
      toast(`Đã nhập ${summary.created} cuốn từ Obsidian`);
    });

  const unmapped = preview ? preview.rows.filter((row) => row.unknown_status && !row.errors.length).length : 0;
  const importable = preview
    ? preview.valid - (skipDuplicates ? preview.valid_duplicates : 0) - (includeInvalid ? 0 : unmapped) + (includeInvalid ? preview.invalid - (skipDuplicates ? preview.invalid_duplicates : 0) : 0)
    : 0;

  const footer =
    step === 1 ? (
      <>
        <Button onClick={reset}>Chọn note khác</Button>
        <Button variant="primary" onClick={commit} disabled={busy || importable <= 0}>
          {busy && <Spinner />} Nhập {importable} cuốn
        </Button>
      </>
    ) : step === 2 ? (
      <Button variant="primary" onClick={() => onOpenChange(false)}>
        Xong
      </Button>
    ) : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
      size="lg"
      title="Import sách"
      description="Chép note sách có sẵn trong Obsidian vào kệ. Chỉ đọc file, không sửa file trong vault."
      footer={footer}
    >
      {step < 2 && <StepIndicator step={step} steps={STEPS} />}
      <ErrorNote error={error} className="mb-4" />

      {step === 0 && (
        <div className="flex flex-col gap-5">
          <Field label="Nguồn dữ liệu" hint={SOURCES.find((entry) => entry.value === source).help}>
            {() => <Segmented label="Nguồn dữ liệu" value={source} onChange={setSource} options={SOURCES} />}
          </Field>
          <Field
            label="Thể loại khi không nhận ra được"
            hint="Note có property Category thì dùng Category. Không có thì app đoán theo property đặc trưng (Fandom, Ships → Fanfiction; Volumes → Truyện tranh). Còn lại dùng thể loại này; bạn đổi được từng note ở bước sau."
          >
            {(props) => (
              <Select {...props} value={category} onChange={(event) => setCategory(event.target.value)} className="sm:w-60">
                {CATEGORIES.map((value) => (
                  <option key={value} value={value}>
                    {CATEGORY_LABELS[value]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-line px-6 py-10 text-center">
            <p className="max-w-md text-sm text-ink-muted">
              Tên file thành tên sách. Property được đọc theo{' '}
              <Link to="/settings/template" className="text-moss underline underline-offset-2" onClick={() => onOpenChange(false)}>
                template của từng thể loại
              </Link>
              , phần nội dung note thành ghi chú của sách.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="primary" onClick={() => folderRef.current?.click()} disabled={busy}>
                {busy ? <Spinner /> : <FolderOpen size={16} />} Chọn cả thư mục
              </Button>
              <Button onClick={() => filesRef.current?.click()} disabled={busy}>
                <FileText size={16} /> Chọn từng file .md
              </Button>
            </div>
            <input ref={folderRef} type="file" webkitdirectory="" directory="" multiple className="sr-only" onChange={(event) => pick(event.target.files)} aria-label="Chọn thư mục note" />
            <input ref={filesRef} type="file" accept=".md,text/markdown" multiple className="sr-only" onChange={(event) => pick(event.target.files)} aria-label="Chọn file .md" />
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <span>
              <strong className="font-semibold">{preview.valid}</strong> note đọc được
            </span>
            <span className={preview.invalid ? 'text-danger' : 'text-ink-muted'}>
              <strong className="font-semibold">{preview.invalid}</strong> note lỗi ({includeInvalid ? 'vẫn nhập, để riêng' : 'sẽ bỏ qua'})
            </span>
            <span className="text-ink-muted">
              <strong className="font-semibold">{preview.valid_duplicates}</strong> cuốn đã có trên kệ
            </span>
            {preview.skipped_files > 0 && <span className="text-ink-muted">Bỏ qua {preview.skipped_files} file không phải note</span>}
            <label className="ml-auto flex items-center gap-2">
              <Switch checked={skipDuplicates} onCheckedChange={setSkipDuplicates} aria-label="Bỏ qua sách đã có" />
              Bỏ qua sách đã có
            </label>
          </div>
          {preview.invalid > 0 && (
            <label className="flex items-start gap-2 rounded-xl border border-honey/60 bg-honey/10 p-3 text-sm">
              <Switch checked={includeInvalid} onCheckedChange={setIncludeInvalid} aria-label="Vẫn import mục lỗi" />
              <span>
                Vẫn import {preview.invalid} mục lỗi. Chúng được thêm vào kệ với phần dữ liệu đọc được và gắn nhãn "Cần chỉnh sửa" để bạn sửa lại sau (bộ lọc Cần sửa trên kệ sách).
              </span>
            </label>
          )}
          {preview.unknown_statuses.length > 0 && (
            <div className="rounded-xl border border-honey/60 bg-honey/10 p-4">
              <p className="text-sm font-medium">Có trạng thái app chưa biết. Chọn trạng thái tương ứng; bảng xem trước cập nhật ngay và app nhớ lựa chọn cho các lần import sau.</p>
              <ul className="mt-3 flex flex-col gap-2">
                {preview.unknown_statuses.map((entry) => (
                  <li key={entry.value} className="flex flex-wrap items-center gap-3 text-sm">
                    <span className="min-w-40 font-medium">“{entry.value}”</span>
                    <span className="text-ink-muted">{entry.count} note</span>
                    <Select
                      value=""
                      onChange={(event) => event.target.value && mapStatus(entry.value, event.target.value)}
                      aria-label={`Trạng thái tương ứng với ${entry.value}`}
                      className="h-9 w-44"
                      disabled={busy}
                    >
                      <option value="">Chọn trạng thái</option>
                      {STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {STATUS_LABELS[status]}
                        </option>
                      ))}
                    </Select>
                  </li>
                ))}
              </ul>
              {unmapped > 0 && <p className="mt-2 text-xs text-ink-muted">{unmapped} note chưa ghép trạng thái sẽ không được nhập.</p>}
            </div>
          )}
          <div className="max-h-[50vh] overflow-auto rounded-xl border border-line">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="sticky top-0 border-b border-line bg-surface text-left text-ink-muted">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">Note</th>
                  <th scope="col" className="px-3 py-2 font-medium">Thể loại</th>
                  <th scope="col" className="px-3 py-2 font-medium">Trạng thái</th>
                  <th scope="col" className="px-3 py-2 font-medium">Lượt đọc</th>
                  <th scope="col" className="px-3 py-2 font-medium">Ghi chú</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row) => (
                  <tr key={row.path} className={cn('border-b border-line/60 align-top last:border-0', row.errors.length && 'bg-danger/5')}>
                    <td className="px-3 py-2">
                      <span className="flex items-center gap-1.5 font-medium">
                        {row.title}
                        {row.is_favorite && <Heart size={13} className="shrink-0 text-danger" fill="currentColor" aria-label="Yêu thích" />}
                      </span>
                      <span className="block text-xs text-ink-muted">{row.creator_author}</span>
                      <span className="block break-all text-[11px] text-ink-muted/80">{row.path}</span>
                    </td>
                    <td className="px-3 py-2">
                      <Select value={row.category} onChange={(event) => changeCategory(row.path, event.target.value)} aria-label={`Thể loại của ${row.title}`} className="h-9 w-40" disabled={busy}>
                        {CATEGORIES.map((value) => (
                          <option key={value} value={value}>
                            {CATEGORY_LABELS[value]}
                          </option>
                        ))}
                      </Select>
                      <span className="mt-1 block text-[11px] text-ink-muted">{DETECTED_LABELS[row.detected_by]}</span>
                    </td>
                    <td className="px-3 py-2">
                      {row.unknown_status ? <span className="text-danger">Chưa ghép: “{row.unknown_status}”</span> : row.status ? STATUS_LABELS[row.status] : '–'}
                    </td>
                    <td className="px-3 py-2 tabular-nums">{row.reads}</td>
                    <td className="px-3 py-2 text-xs">
                      {row.errors.length > 0 && <span className="text-danger">{row.errors.join('; ')}</span>}
                      {!row.errors.length && row.duplicate && <span className="text-ink-muted">Đã có trên kệ: {row.duplicate.title}</span>}
                      {!row.errors.length && !row.duplicate && row.duplicate_in_file && <span className="text-ink-muted">Trùng với {row.duplicate_in_file}</span>}
                      {!row.errors.length && !row.duplicate && !row.duplicate_in_file && row.has_note && <span className="text-ink-muted">Có nội dung note</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-ink-muted">
            Ảnh nhúng trong note (ví dụ <span className="font-mono">![[moodboard.jpg]]</span>) được giữ nguyên dạng chữ; ảnh vẫn nằm trong vault.
          </p>
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <CheckCircle2 size={36} className="text-moss" aria-hidden />
          <p className="font-display text-2xl">Đã nhập {result.created} cuốn</p>
          <p className="text-sm text-ink-muted">
            Bỏ qua {result.skipped_duplicates} cuốn đã có, {result.failed} note lỗi.{result.with_issues > 0 && ` ${result.with_issues} cuốn có lỗi đã được nhập và gắn nhãn "Cần chỉnh sửa".`}
          </p>
          {result.failures.length > 0 && (
            <ul className="mt-2 max-h-40 w-full overflow-y-auto rounded-lg bg-surface-2 p-3 text-left text-xs text-ink-muted">
              {result.failures.map((failure) => (
                <li key={failure.path}>
                  {failure.path}: {failure.errors.join('; ')}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Dialog>
  );
}
