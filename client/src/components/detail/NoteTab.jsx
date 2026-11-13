import { Check, CircleAlert, FileText } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNote, useSaveNote, useTemplates } from '../../hooks/queries.js';
import { CATEGORY_LABELS } from '../../lib/labels.js';
import { Button } from '../ui/Button.jsx';
import { ErrorNote } from '../ui/ErrorNote.jsx';
import { Spinner } from '../ui/Spinner.jsx';
import { MarkdownEditor } from './MarkdownEditor.jsx';
import { CharacterSection, MoodboardSection, SectionHeading } from './NoteGallery.jsx';
import { AttachmentSection, PlaylistSection } from './NoteLinks.jsx';
import { useNoteUpload } from './noteApi.js';

const AUTOSAVE_MS = 1200;

function SaveState({ state, savedAt }) {
  if (state === 'saving') return <span className="inline-flex items-center gap-1.5 text-xs text-ink-muted"><Spinner size={12} /> Đang lưu</span>;
  if (state === 'dirty') return <span className="text-xs text-ink-muted">Chưa lưu</span>;
  if (state === 'error') return <span className="inline-flex items-center gap-1.5 text-xs text-danger"><CircleAlert size={13} /> Lưu không được</span>;
  if (!savedAt) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
      <Check size={13} /> Đã lưu {new Date(savedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
    </span>
  );
}

/**
 * Nội dung note tự lưu sau khi ngừng gõ ~1 giây (và khi rời trang). Moodboard, nhân vật, file, playlist
 * lưu ngay mỗi khi thêm/sửa/xoá. Nội dung này chính là phần thân file .md khi sync sang Obsidian.
 */
function NoteBody({ item, note, saveNote, showTemplate, hint }) {
  const templates = useTemplates();
  const uploadNoteFile = useNoteUpload();
  const [draft, setDraft] = useState(note.content_markdown);
  const [state, setState] = useState('saved');
  const [error, setError] = useState(null);
  const [savedAt, setSavedAt] = useState(note.updated_at);
  const pending = useRef(null);
  const timer = useRef(null);

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    if (pending.current === null) return;
    const content = pending.current;
    pending.current = null;
    setState('saving');
    try {
      const saved = await saveNote({ content_markdown: content });
      setSavedAt(saved.updated_at);
      setError(null);
      setState(pending.current === null ? 'saved' : 'dirty');
    } catch (caught) {
      pending.current = pending.current ?? content;
      setError(caught);
      setState('error');
    }
  }, [saveNote]);

  const change = (value) => {
    setDraft(value);
    pending.current = value;
    setState('dirty');
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, AUTOSAVE_MS);
  };

  useEffect(() => {
    const warn = (event) => {
      if (pending.current !== null) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => {
      window.removeEventListener('beforeunload', warn);
      flush();
    };
  }, [flush]);

  const templateBody = showTemplate ? templates.data?.templates?.[item.main_category]?.body_template ?? '' : '';
  const empty = !draft.trim();

  return (
    <section aria-labelledby="note-title">
      <SectionHeading title={<span id="note-title">Note & review</span>} hint={hint}>
        <SaveState state={state} savedAt={savedAt} />
        {state === 'error' && (
          <Button size="sm" onClick={() => { pending.current = draft; flush(); }}>
            Lưu lại
          </Button>
        )}
      </SectionHeading>
      {error && <ErrorNote error={error} className="mb-3" />}
      {empty && templateBody.trim() && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface-2/70 px-4 py-3 text-sm">
          <FileText size={16} className="shrink-0 text-ink-muted" aria-hidden />
          <span className="flex-1">Note đang trống. Khi sync, Obsidian nhận khung mẫu của template {CATEGORY_LABELS[item.main_category]}.</span>
          <Button size="sm" onClick={() => change(templateBody)}>Chèn khung mẫu để viết</Button>
        </div>
      )}
      <MarkdownEditor
        id="note-editor"
        value={draft}
        onChange={change}
        onUploadImage={async (file) => (await uploadNoteFile(item.id, 'inline', file)).src}
      />
    </section>
  );
}

/** useNoteQuery/useSaveNoteMutation mặc định là note của sách; media truyền hook của API media. */
export function NoteTab({ item, useNoteQuery = useNote, useSaveNoteMutation = useSaveNote, showTemplate = true, hint = 'Markdown như trong Obsidian. Nội dung này là phần thân file .md khi sync.' }) {
  const note = useNoteQuery(item.id);
  const save = useSaveNoteMutation(item.id);
  const saveNote = save.mutateAsync;

  if (note.isLoading) {
    return (
      <div className="flex items-center gap-2 py-10 text-ink-muted">
        <Spinner /> Đang mở note
      </div>
    );
  }
  if (note.error) return <ErrorNote error={note.error} />;
  const data = note.data;

  return (
    <div className="flex flex-col gap-12">
      <NoteBody item={item} note={data} saveNote={saveNote} showTemplate={showTemplate} hint={hint} />
      <MoodboardSection itemId={item.id} images={data.moodboard_images} save={saveNote} />
      <CharacterSection itemId={item.id} characters={data.character_images} save={saveNote} />
      <div className="grid gap-12 xl:grid-cols-2">
        <PlaylistSection links={data.playlist_links} save={saveNote} />
        <AttachmentSection itemId={item.id} files={data.attached_files} save={saveNote} />
      </div>
    </div>
  );
}
