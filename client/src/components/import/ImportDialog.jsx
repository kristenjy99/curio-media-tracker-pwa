import { CheckCircle2, FileUp } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { useInvalidateLibrary } from '../../hooks/queries.js';
import { api } from '../../lib/api.js';
import { CATEGORIES, CATEGORY_LABELS, STATUS_LABELS } from '../../lib/labels.js';
import { cn, readTextFile } from '../../lib/utils.js';
import { Button } from '../ui/Button.jsx';
import { Dialog } from '../ui/Dialog.jsx';
import { ErrorNote } from '../ui/ErrorNote.jsx';
import { Field } from '../ui/Field.jsx';
import { Select } from '../ui/Input.jsx';
import { Segmented } from '../ui/Segmented.jsx';
import { Spinner } from '../ui/Spinner.jsx';
import { Switch } from '../ui/Switch.jsx';
import { MarkdownImportDialog } from './MarkdownImportDialog.jsx';
import { SOURCES, StepIndicator } from './importShared.jsx';
import { useToast } from '../ui/Toast.jsx';

export function ImportDialog({ open, onOpenChange }) {
  const [source, setSource] = useState('markdown');
  const props = { open, onOpenChange, source, setSource };
  return source === 'markdown' ? <MarkdownImportDialog {...props} /> : <TableImportDialog {...props} />;
}

function TableImportDialog({ open, onOpenChange, source, setSource }) {
  const toast = useToast();
  const invalidate = useInvalidateLibrary();
  const fileRef = useRef(null);
  const [category, setCategory] = useState('Fiction');
  const [file, setFile] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [mapping, setMapping] = useState({});
  const [preview, setPreview] = useState(null);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [includeInvalid, setIncludeInvalid] = useState(false);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const step = result ? 3 : preview ? 2 : analysis ? 1 : 0;

  const reset = () => {
    setFile(null);
    setAnalysis(null);
    setMapping({});
    setPreview(null);
    setResult(null);
    setError(null);
  };

  const payload = () => ({ source, format: file.format, content: file.content, mapping, defaults: { main_category: category }, skip_duplicates: skipDuplicates, include_invalid: includeInvalid });

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

  const pickFile = (picked) =>
    run(async () => {
      if (!picked) return;
      const content = await readTextFile(picked);
      const format = picked.name.toLowerCase().endsWith('.json') ? 'json' : 'csv';
      const analyzed = await api.post('/import/analyze', { source, format, content });
      setFile({ name: picked.name, content, format });
      setAnalysis(analyzed);
      setMapping(analyzed.mapping);
    });

  const goPreview = () => run(async () => setPreview(await api.post('/import/preview', payload())));

  const commit = () =>
    run(async () => {
      const summary = await api.post('/import/commit', payload());
      setResult(summary);
      invalidate();
      toast(`Đã import ${summary.created} cuốn`);
    });

  const sampleFor = useMemo(() => {
    const samples = {};
    for (const header of analysis?.headers ?? []) {
      samples[header] = analysis.sample.map((row) => row[header]).find((value) => value !== undefined && value !== null && String(value).trim() !== '') ?? '';
    }
    return samples;
  }, [analysis]);

  const importable = preview
    ? preview.valid - (skipDuplicates ? preview.valid_duplicates : 0) + (includeInvalid ? preview.invalid - (skipDuplicates ? preview.invalid_duplicates : 0) : 0)
    : 0;

  const footer =
    step === 0 ? null : step === 1 ? (
      <>
        <Button onClick={reset}>Chọn file khác</Button>
        <Button variant="primary" onClick={goPreview} disabled={busy}>
          {busy && <Spinner />} Xem trước
        </Button>
      </>
    ) : step === 2 ? (
      <>
        <Button onClick={() => setPreview(null)}>Sửa ghép cột</Button>
        <Button variant="primary" onClick={commit} disabled={busy || importable <= 0}>
          {busy && <Spinner />} Import {importable} cuốn
        </Button>
      </>
    ) : (
      <Button variant="primary" onClick={() => onOpenChange(false)}>
        Xong
      </Button>
    );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
      size="lg"
      title="Import sách"
      description="Chuyển thư viện từ Goodreads, Notion hoặc file CSV/JSON vào kệ."
      footer={footer}
    >
      {step < 3 && <StepIndicator step={step} />}
      <ErrorNote error={error} className="mb-4" />

      {step === 0 && (
        <div className="flex flex-col gap-5">
          <Field label="Nguồn dữ liệu" hint={SOURCES.find((entry) => entry.value === source).help}>
            {() => <Segmented label="Nguồn dữ liệu" value={source} onChange={setSource} options={SOURCES} />}
          </Field>
          <Field label="Thể loại mặc định" hint="Dùng khi file không ghi thể loại. Kệ Goodreads có tên non-fiction, manga, fanfic sẽ được nhận ra tự động.">
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
          <div
            className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-line px-6 py-10 text-center"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              pickFile(event.dataTransfer.files[0]);
            }}
          >
            <FileUp size={28} className="text-ink-muted" aria-hidden />
            <p className="text-sm text-ink-muted">Kéo file .csv hoặc .json vào đây</p>
            <Button variant="primary" onClick={() => fileRef.current?.click()} disabled={busy}>
              {busy && <Spinner />} Chọn file
            </Button>
            <input ref={fileRef} type="file" accept=".csv,.json,text/csv,application/json" className="sr-only" onChange={(event) => pickFile(event.target.files[0])} aria-label="Chọn file để import" />
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-ink-muted">
            {file.name}: {analysis.total_rows} dòng. App đã đoán sẵn cột nào ghi vào đâu, kiểm tra lại rồi bấm Xem trước. Cột để "Bỏ qua" sẽ không được nhập.
          </p>
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b border-line bg-surface-2/60 text-left text-ink-muted">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">Cột trong file</th>
                  <th scope="col" className="px-3 py-2 font-medium">Ví dụ</th>
                  <th scope="col" className="px-3 py-2 font-medium">Ghi vào</th>
                </tr>
              </thead>
              <tbody>
                {analysis.headers.map((header) => (
                  <tr key={header} className="border-b border-line/60 last:border-0">
                    <td className="px-3 py-2 font-medium">{header}</td>
                    <td className="max-w-[260px] truncate px-3 py-2 text-ink-muted" title={String(sampleFor[header])}>
                      {String(sampleFor[header]) || '–'}
                    </td>
                    <td className="px-3 py-1.5">
                      <Select
                        value={mapping[header] ?? ''}
                        onChange={(event) => setMapping((current) => ({ ...current, [header]: event.target.value || null }))}
                        aria-label={`Cột ${header} ghi vào`}
                        className="h-9"
                      >
                        <option value="">Bỏ qua</option>
                        {analysis.targets.map((target) => (
                          <option key={target.id} value={target.id}>
                            {target.label}
                          </option>
                        ))}
                      </Select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <span>
              <strong className="font-semibold">{preview.valid}</strong> cuốn hợp lệ
            </span>
            <span className={preview.invalid ? 'text-danger' : 'text-ink-muted'}>
              <strong className="font-semibold">{preview.invalid}</strong> dòng lỗi ({includeInvalid ? 'vẫn import, để riêng' : 'sẽ bỏ qua'})
            </span>
            <span className="text-ink-muted">
              <strong className="font-semibold">{preview.duplicates}</strong> cuốn đã có trên kệ
            </span>
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
          <div className="max-h-[48vh] overflow-auto rounded-xl border border-line">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="sticky top-0 border-b border-line bg-surface text-left text-ink-muted">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">Dòng</th>
                  <th scope="col" className="px-3 py-2 font-medium">Sách</th>
                  <th scope="col" className="px-3 py-2 font-medium">Thể loại</th>
                  <th scope="col" className="px-3 py-2 font-medium">Trạng thái</th>
                  <th scope="col" className="px-3 py-2 font-medium">Lượt đọc</th>
                  <th scope="col" className="px-3 py-2 font-medium">Ghi chú</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row) => (
                  <tr key={row.row} className={cn('border-b border-line/60 align-top last:border-0', row.errors.length && 'bg-danger/5')}>
                    <td className="px-3 py-2 tabular-nums text-ink-muted">{row.row}</td>
                    <td className="px-3 py-2">
                      <span className="block font-medium">{row.title || 'Không có tên'}</span>
                      <span className="block text-xs text-ink-muted">{row.creator_author}</span>
                    </td>
                    <td className="px-3 py-2">{CATEGORY_LABELS[row.main_category]}</td>
                    <td className="px-3 py-2">{STATUS_LABELS[row.status]}</td>
                    <td className="px-3 py-2 tabular-nums">{row.reads}</td>
                    <td className="px-3 py-2 text-xs">
                      {row.errors.length > 0 && <span className="text-danger">{row.errors.join('; ')}</span>}
                      {!row.errors.length && row.duplicate && <span className="text-ink-muted">Đã có trên kệ: {row.duplicate.title}</span>}
                      {!row.errors.length && !row.duplicate && row.duplicate_in_file && <span className="text-ink-muted">Trùng dòng {row.duplicate_in_file}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.total > preview.rows.length && <p className="text-xs text-ink-muted">Đang hiện {preview.rows.length} dòng đầu, khi import sẽ xử lý đủ {preview.total} dòng.</p>}
        </div>
      )}

      {step === 3 && (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <CheckCircle2 size={36} className="text-moss" aria-hidden />
          <p className="font-display text-2xl">Đã import {result.created} cuốn</p>
          <p className="text-sm text-ink-muted">
            Bỏ qua {result.skipped_duplicates} cuốn đã có, {result.failed} dòng lỗi.{result.with_issues > 0 && ` ${result.with_issues} cuốn có lỗi đã được import và gắn nhãn "Cần chỉnh sửa".`}
          </p>
          {result.failures.length > 0 && (
            <ul className="mt-2 max-h-40 w-full overflow-y-auto rounded-lg bg-surface-2 p-3 text-left text-xs text-ink-muted">
              {result.failures.map((failure) => (
                <li key={failure.row}>
                  {result.with_issues > 0 && 'Cần sửa: '}Dòng {failure.row} {failure.title ? `(${failure.title})` : ''}: {failure.errors.join('; ')}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Dialog>
  );
}
