import { Bold, Columns2, Eye, Heading2, Highlighter, ImagePlus, Italic, Link2, List, ListChecks, PencilLine, Quote } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { imageFilesFrom } from '../../lib/images.js';
import { renderMarkdown } from '../../lib/markdown.js';
import { cn } from '../../lib/utils.js';
import { Button } from '../ui/Button.jsx';
import { Segmented } from '../ui/Segmented.jsx';
import { Spinner } from '../ui/Spinner.jsx';

/**
 * Chèn chữ vào textarea qua execCommand('insertText') để Ctrl+Z hoàn tác được như gõ tay;
 * trình duyệt không hỗ trợ thì ghi thẳng giá trị (mất lịch sử hoàn tác của lần chèn đó).
 */
function insertText(textarea, text, selectStart, selectEnd) {
  textarea.focus();
  const ok = document.execCommand?.('insertText', false, text);
  if (!ok) {
    textarea.setRangeText(text, textarea.selectionStart, textarea.selectionEnd, 'end');
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  }
  if (selectStart !== undefined) textarea.setSelectionRange(selectStart, selectEnd ?? selectStart);
}

function surround(textarea, before, after, placeholder) {
  const { selectionStart: start, selectionEnd: end, value } = textarea;
  const selected = value.slice(start, end) || placeholder;
  insertText(textarea, `${before}${selected}${after}`, start + before.length, start + before.length + selected.length);
}

function prefixLines(textarea, prefix) {
  const { value, selectionStart, selectionEnd } = textarea;
  const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
  const lineEndIndex = value.indexOf('\n', selectionEnd);
  const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex;
  const block = value.slice(lineStart, lineEnd);
  const lines = block.split('\n');
  const allPrefixed = lines.every((line) => line.startsWith(prefix));
  const next = lines.map((line) => (allPrefixed ? line.slice(prefix.length) : `${prefix}${line}`)).join('\n');
  textarea.setSelectionRange(lineStart, lineEnd);
  insertText(textarea, next, lineStart, lineStart + next.length);
}

const VIEW_OPTIONS = [
  { value: 'edit', label: <span className="inline-flex items-center gap-1.5"><PencilLine size={14} /> Soạn</span> },
  { value: 'split', label: <span className="inline-flex items-center gap-1.5"><Columns2 size={14} /> Song song</span> },
  { value: 'preview', label: <span className="inline-flex items-center gap-1.5"><Eye size={14} /> Xem trước</span> },
];

export function MarkdownPreview({ value, className }) {
  const html = useMemo(() => renderMarkdown(value), [value]);
  if (!value.trim()) return <p className={cn('text-sm text-ink-muted', className)}>Chưa có nội dung.</p>;
  // eslint-disable-next-line react/no-danger -- HTML đã được DOMPurify lọc trong renderMarkdown.
  return <div translate="no" className={cn('md-preview', className)} dangerouslySetInnerHTML={{ __html: html }} />;
}

/** Editor markdown: textarea + thanh công cụ + xem trước. Dán/kéo ảnh vào ô soạn để chèn ảnh. */
export function MarkdownEditor({ value, onChange, onUploadImage, id, label = 'Nội dung note' }) {
  const textareaRef = useRef(null);
  const fileRef = useRef(null);
  const [view, setView] = useState(() => (typeof window !== 'undefined' && window.innerWidth >= 1200 ? 'split' : 'edit'));
  const [uploading, setUploading] = useState(0);
  const [uploadError, setUploadError] = useState(null);

  async function insertImages(files) {
    if (!files.length || !onUploadImage) return;
    setUploadError(null);
    setUploading((count) => count + files.length);
    for (const file of files) {
      try {
        const src = await onUploadImage(file);
        const textarea = textareaRef.current;
        if (textarea) {
          const before = textarea.value.slice(0, textarea.selectionStart);
          const lead = before && !before.endsWith('\n\n') ? (before.endsWith('\n') ? '\n' : '\n\n') : '';
          insertText(textarea, `${lead}![](${src})\n`);
        }
      } catch (error) {
        setUploadError(error.message);
      } finally {
        setUploading((count) => count - 1);
      }
    }
  }

  const run = (action) => () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    if (view === 'preview') setView('edit');
    action(textarea);
  };

  const tools = [
    { label: 'Đậm (Ctrl+B)', icon: Bold, action: (t) => surround(t, '**', '**', 'chữ đậm') },
    { label: 'Nghiêng (Ctrl+I)', icon: Italic, action: (t) => surround(t, '*', '*', 'chữ nghiêng') },
    { label: 'Highlight', icon: Highlighter, action: (t) => surround(t, '==', '==', 'đoạn đánh dấu') },
    { label: 'Tiêu đề', icon: Heading2, action: (t) => prefixLines(t, '## ') },
    { label: 'Danh sách', icon: List, action: (t) => prefixLines(t, '- ') },
    { label: 'Việc cần làm', icon: ListChecks, action: (t) => prefixLines(t, '- [ ] ') },
    { label: 'Trích dẫn', icon: Quote, action: (t) => prefixLines(t, '> ') },
    { label: 'Link', icon: Link2, action: (t) => surround(t, '[', '](https://)', 'chữ hiển thị') },
  ];

  function onKeyDown(event) {
    if (!(event.ctrlKey || event.metaKey)) return;
    const key = event.key.toLowerCase();
    if (key === 'b' || key === 'i') {
      event.preventDefault();
      tools[key === 'b' ? 0 : 1].action(event.currentTarget);
    }
  }

  const showEditor = view !== 'preview';
  const showPreview = view !== 'edit';

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <div role="toolbar" aria-label="Định dạng" className="flex flex-wrap items-center gap-0.5 rounded-lg border border-line bg-surface p-0.5">
          {tools.map((tool) => (
            <Button key={tool.label} variant="ghost" size="icon-sm" onClick={run(tool.action)} title={tool.label} aria-label={tool.label}>
              <tool.icon size={16} />
            </Button>
          ))}
          {onUploadImage && (
            <Button variant="ghost" size="icon-sm" onClick={() => fileRef.current?.click()} title="Chèn ảnh" aria-label="Chèn ảnh" disabled={uploading > 0}>
              {uploading > 0 ? <Spinner size={14} /> : <ImagePlus size={16} />}
            </Button>
          )}
        </div>
        <Segmented size="sm" label="Chế độ xem" value={view} onChange={setView} options={VIEW_OPTIONS} className="ml-auto" />
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
          multiple
          className="sr-only"
          aria-label="Chọn ảnh để chèn vào note"
          onChange={(event) => {
            insertImages([...event.target.files]);
            event.target.value = '';
          }}
        />
      </div>
      <div className={cn('grid gap-3', view === 'split' && 'lg:grid-cols-2')}>
        {showEditor && (
          <textarea
            id={id}
            ref={textareaRef}
            aria-label={label}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={onKeyDown}
            onPaste={(event) => {
              const files = imageFilesFrom(event.clipboardData);
              if (files.length) {
                event.preventDefault();
                insertImages(files);
              }
            }}
            onDrop={(event) => {
              const files = imageFilesFrom(event.dataTransfer);
              if (files.length) {
                event.preventDefault();
                insertImages(files);
              }
            }}
            spellCheck={false}
            placeholder="Viết review, cảm nhận, quote... Hỗ trợ markdown và [[link]] kiểu Obsidian. Dán ảnh bằng Ctrl+V."
            className="min-h-[460px] w-full resize-y rounded-xl border border-line bg-surface px-4 py-3 font-mono text-[13.5px] leading-relaxed text-ink placeholder:text-ink-muted/70 focus:border-moss focus:outline-none focus:ring-2 focus:ring-sage/50"
          />
        )}
        {showPreview && (
          <div className="min-h-[460px] overflow-auto rounded-xl border border-line bg-surface px-6 py-5" aria-label="Xem trước note">
            <MarkdownPreview value={value} />
          </div>
        )}
      </div>
      {uploadError && <p className="text-xs text-danger" role="alert">{uploadError}</p>}
    </div>
  );
}
