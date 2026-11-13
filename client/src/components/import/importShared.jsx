import { cn } from '../../lib/utils.js';

export const SOURCES = [
  { value: 'markdown', label: 'Note Obsidian (.md)', help: 'Chọn file .md hoặc cả thư mục note sách trong vault. App đọc property theo template của từng thể loại; file gốc không bị sửa.' },
  { value: 'goodreads', label: 'Goodreads', help: 'Trên Goodreads: My Books → Import and export → Export Library, tải file CSV về.' },
  { value: 'notion', label: 'Notion', help: 'Trong Notion: mở database sách → ⋯ → Export → Markdown & CSV, giải nén và chọn file .csv.' },
  { value: 'generic', label: 'File khác', help: 'File CSV hoặc JSON tự làm, mỗi dòng (hoặc mỗi object) là một cuốn sách.' },
];

const STEPS = ['Chọn file', 'Ghép cột', 'Xem trước'];

export function StepIndicator({ step, steps = STEPS }) {
  return (
    <ol className="mb-5 flex items-center gap-2 text-sm" aria-label="Các bước import">
      {steps.map((label, index) => (
        <li key={label} className="flex items-center gap-2" aria-current={index === step ? 'step' : undefined}>
          <span
            className={cn(
              'flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold',
              index < step ? 'bg-sage text-ink' : index === step ? 'bg-moss text-on-moss' : 'bg-surface-2 text-ink-muted',
            )}
          >
            {index + 1}
          </span>
          <span className={index === step ? 'font-medium text-ink' : 'text-ink-muted'}>{label}</span>
          {index < steps.length - 1 && <span className="mx-1 h-px w-6 bg-line" aria-hidden />}
        </li>
      ))}
    </ol>
  );
}

