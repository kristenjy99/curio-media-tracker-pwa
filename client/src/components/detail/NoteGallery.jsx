import { ArrowLeft, ArrowRight, ImagePlus, Link2, Pencil, Plus, Trash2, UserRound, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { imageFilesFrom, prepareImage } from '../../lib/images.js';
import { useNoteUpload } from './noteApi.js';
import { cn } from '../../lib/utils.js';
import { Button } from '../ui/Button.jsx';
import { Dialog } from '../ui/Dialog.jsx';
import { ErrorNote } from '../ui/ErrorNote.jsx';
import { Field } from '../ui/Field.jsx';
import { Input, Textarea } from '../ui/Input.jsx';
import { Spinner } from '../ui/Spinner.jsx';
import { resolveFileUrl } from '../../lib/api.js';

const IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,image/avif';

export function SectionHeading({ title, hint, children }) {
  return (
    <div className="mb-3 flex flex-wrap items-end gap-x-4 gap-y-2">
      <div className="min-w-0">
        <h3 className="font-display text-2xl font-medium leading-tight">{title}</h3>
        {hint && <p className="mt-0.5 text-sm text-ink-muted">{hint}</p>}
      </div>
      <div className="ml-auto flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

const move = (list, index, delta) => {
  const target = index + delta;
  if (target < 0 || target >= list.length) return list;
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
};

function Lightbox({ image, onClose }) {
  if (!image) return null;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()} size="xl" title={image.caption || 'Ảnh moodboard'}>
      <img src={resolveFileUrl(image.src)} alt={image.caption || ''} className="mx-auto max-h-[72vh] w-auto rounded-lg object-contain" />
    </Dialog>
  );
}

/** Moodboard: lưới ảnh có chú thích. Thêm bằng nút, kéo thả, dán (Ctrl+V) khi vùng moodboard đang được chọn, hoặc link. */
export function MoodboardSection({ itemId, images, save }) {
  const uploadNoteFile = useNoteUpload();
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(0);
  const [error, setError] = useState(null);
  const [linkMode, setLinkMode] = useState(false);
  const [link, setLink] = useState('');
  const [editing, setEditing] = useState(null);
  const [caption, setCaption] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [zoom, setZoom] = useState(null);
  const latest = useRef(images);
  latest.current = images;

  async function addFiles(files) {
    if (!files.length) return;
    setError(null);
    setBusy((count) => count + files.length);
    try {
      const uploaded = [];
      for (const file of files) uploaded.push(await uploadNoteFile(itemId, 'moodboard', file));
      await save({ moodboard_images: [...latest.current, ...uploaded.map((file) => ({ src: file.src }))] });
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy((count) => count - files.length);
    }
  }

  async function update(next) {
    setError(null);
    try {
      await save({ moodboard_images: next });
    } catch (caught) {
      setError(caught);
    }
  }

  async function addLink(event) {
    event.preventDefault();
    const url = link.trim();
    if (!/^https?:\/\//i.test(url)) {
      setError(new Error('Link ảnh phải bắt đầu bằng http:// hoặc https://'));
      return;
    }
    await update([...images, { src: url }]);
    setLink('');
    setLinkMode(false);
  }

  return (
    <section aria-labelledby="moodboard-title">
      <SectionHeading title={<span id="moodboard-title">Moodboard</span>} hint="Bấm vào khung bên dưới rồi Ctrl+V để dán ảnh, hoặc kéo thả ảnh vào.">
        <Button size="sm" onClick={() => setLinkMode((open) => !open)}>
          <Link2 size={14} /> Thêm bằng link
        </Button>
        <Button size="sm" variant="primary" onClick={() => fileRef.current?.click()} disabled={busy > 0}>
          {busy > 0 ? <Spinner size={14} /> : <ImagePlus size={14} />} Thêm ảnh
        </Button>
        <input ref={fileRef} type="file" accept={IMAGE_ACCEPT} multiple className="sr-only" aria-label="Chọn ảnh moodboard" onChange={(event) => { addFiles([...event.target.files]); event.target.value = ''; }} />
      </SectionHeading>
      {linkMode && (
        <form onSubmit={addLink} className="mb-3 flex gap-2">
          <Input value={link} onChange={(event) => setLink(event.target.value)} placeholder="https://... link ảnh" aria-label="Link ảnh moodboard" autoFocus />
          <Button type="submit">Thêm</Button>
        </form>
      )}
      <ErrorNote error={error} className="mb-3" />
      <div
        tabIndex={0}
        role="group"
        aria-label="Vùng moodboard, dán ảnh bằng Ctrl+V"
        onPaste={(event) => {
          const files = imageFilesFrom(event.clipboardData);
          if (files.length) {
            event.preventDefault();
            addFiles(files);
          }
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          addFiles(imageFilesFrom(event.dataTransfer));
        }}
        className={cn(
          'rounded-2xl border border-dashed border-line p-3 transition-colors focus-visible:border-moss',
          dragOver && 'border-moss bg-sage/15',
        )}
      >
        {images.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-sm text-ink-muted">
            <ImagePlus size={22} aria-hidden />
            Chưa có ảnh. Dán, kéo thả hoặc bấm "Thêm ảnh".
          </div>
        ) : (
          <ul className="columns-2 gap-3 sm:columns-3 xl:columns-4">
            {images.map((image, index) => (
              <li key={`${image.src}-${index}`} className="group relative mb-3 break-inside-avoid overflow-hidden rounded-xl bg-surface-2">
                <button type="button" onClick={() => setZoom(image)} className="block w-full" aria-label={`Xem lớn ${image.caption || `ảnh ${index + 1}`}`}>
                  <img src={resolveFileUrl(image.src)} alt={image.caption || ''} loading="lazy" className="block w-full object-cover" />
                </button>
                {editing === index ? (
                  <form
                    className="flex gap-1 p-2"
                    onSubmit={async (event) => {
                      event.preventDefault();
                      await update(images.map((entry, i) => (i === index ? { ...entry, caption: caption.trim() || undefined } : entry)));
                      setEditing(null);
                    }}
                  >
                    <Input value={caption} onChange={(event) => setCaption(event.target.value)} className="h-8" aria-label="Chú thích ảnh" autoFocus />
                    <Button type="submit" size="sm">Lưu</Button>
                  </form>
                ) : (
                  image.caption && <p className="px-3 py-2 text-xs leading-snug text-ink-muted">{image.caption}</p>
                )}
                <div className="absolute right-1.5 top-1.5 flex gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                  {[
                    { label: 'Chuyển sang trái', icon: ArrowLeft, onClick: () => update(move(images, index, -1)), disabled: index === 0 },
                    { label: 'Chuyển sang phải', icon: ArrowRight, onClick: () => update(move(images, index, 1)), disabled: index === images.length - 1 },
                    { label: 'Sửa chú thích', icon: Pencil, onClick: () => { setEditing(index); setCaption(image.caption ?? ''); } },
                    { label: 'Xoá ảnh', icon: Trash2, onClick: () => update(images.filter((_, i) => i !== index)) },
                  ].map((action) => (
                    <button
                      key={action.label}
                      type="button"
                      onClick={action.onClick}
                      disabled={action.disabled}
                      aria-label={action.label}
                      title={action.label}
                      className="rounded-md bg-surface/90 p-1.5 text-ink shadow-sm hover:bg-surface disabled:opacity-40"
                    >
                      <action.icon size={14} />
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <Lightbox image={zoom} onClose={() => setZoom(null)} />
    </section>
  );
}

function CharacterDialog({ itemId, initial, onCancel, onSubmit, onDelete }) {
  const uploadNoteFile = useNoteUpload();
  const [name, setName] = useState(initial?.name ?? '');
  const [caption, setCaption] = useState(initial?.caption ?? '');
  const [src, setSrc] = useState(initial?.src ?? null);
  const [pending, setPending] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [nameError, setNameError] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => {
    if (!pending) return setPreview(null);
    const url = URL.createObjectURL(pending);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [pending]);

  async function pick(file) {
    if (!file) return;
    try {
      setPending(await prepareImage(file));
    } catch (caught) {
      setError(caught);
    }
  }

  async function submit(event) {
    event.preventDefault();
    if (!name.trim()) {
      setNameError('Cần tên nhân vật');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      let finalSrc = src;
      if (pending) finalSrc = (await uploadNoteFile(itemId, 'character', new File([pending], 'character', { type: pending.type }))).src;
      await onSubmit({ name: name.trim(), src: finalSrc ?? null, caption: caption.trim() || undefined });
    } catch (caught) {
      setError(caught);
      setBusy(false);
    }
  }

  const shown = preview ?? src;
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onCancel()}
      title={initial ? 'Sửa nhân vật' : 'Thêm nhân vật'}
      footer={
        <>
          {onDelete && (
            <Button variant="ghost" className="mr-auto text-danger" onClick={onDelete} disabled={busy}>
              <Trash2 size={16} /> Xoá nhân vật
            </Button>
          )}
          <Button onClick={onCancel}>Huỷ</Button>
          <Button variant="primary" type="submit" form="character-form" disabled={busy}>
            {busy && <Spinner />} Lưu
          </Button>
        </>
      }
    >
      <form
        id="character-form"
        onSubmit={submit}
        className="grid gap-5 sm:grid-cols-[10rem_1fr]"
        onPaste={(event) => {
          const files = imageFilesFrom(event.clipboardData);
          if (files.length && event.target.tagName !== 'TEXTAREA' && event.target.tagName !== 'INPUT') {
            event.preventDefault();
            pick(files[0]);
          }
        }}
      >
        <div className="flex flex-col gap-2">
          <div className="flex aspect-[3/4] items-center justify-center overflow-hidden rounded-xl border border-dashed border-line bg-surface-2">
            {shown ? <img src={resolveFileUrl(shown)} alt="" className="h-full w-full object-cover" /> : <UserRound size={28} className="text-ink-muted" aria-hidden />}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" onClick={() => fileRef.current?.click()}>
              <ImagePlus size={14} /> {shown ? 'Đổi ảnh' : 'Chọn ảnh'}
            </Button>
            {shown && (
              <Button size="sm" variant="ghost" onClick={() => { setPending(null); setSrc(null); }}>
                <X size={14} /> Bỏ ảnh
              </Button>
            )}
          </div>
          <input ref={fileRef} type="file" accept={IMAGE_ACCEPT} className="sr-only" aria-label="Chọn ảnh nhân vật" onChange={(event) => { pick(event.target.files[0]); event.target.value = ''; }} />
        </div>
        <div className="flex flex-col gap-4">
          <ErrorNote error={error} />
          <Field label="Tên nhân vật" required error={nameError}>
            {(props) => <Input {...props} value={name} onChange={(event) => { setName(event.target.value); setNameError(null); }} autoFocus />}
          </Field>
          <Field label="Chú thích" hint="Tính cách, vai trò, lý do thích...">
            {(props) => <Textarea {...props} value={caption} onChange={(event) => setCaption(event.target.value)} rows={5} />}
          </Field>
        </div>
      </form>
    </Dialog>
  );
}

/** Gallery nhân vật: thẻ ảnh dọc + tên + chú thích. */
export function CharacterSection({ itemId, characters, save }) {
  const [dialog, setDialog] = useState(null);
  const [error, setError] = useState(null);

  async function commit(next) {
    setError(null);
    await save({ character_images: next });
    setDialog(null);
  }

  return (
    <section aria-labelledby="characters-title">
      <SectionHeading title={<span id="characters-title">Nhân vật</span>} hint="Ảnh, tên và chú thích cho từng nhân vật.">
        <Button size="sm" variant="primary" onClick={() => setDialog({ index: null })}>
          <Plus size={14} /> Thêm nhân vật
        </Button>
      </SectionHeading>
      <ErrorNote error={error} className="mb-3" />
      {characters.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line px-4 py-8 text-center text-sm text-ink-muted">Chưa có nhân vật nào.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {characters.map((character, index) => (
            <li key={`${character.name}-${index}`}>
              <button
                type="button"
                onClick={() => setDialog({ index })}
                className="group flex w-full flex-col overflow-hidden rounded-xl border border-line bg-surface text-left transition-shadow hover:shadow-md"
                aria-label={`Sửa nhân vật ${character.name}`}
              >
                <div className="flex aspect-[3/4] w-full items-center justify-center overflow-hidden bg-surface-2">
                  {character.src ? (
                    <img src={resolveFileUrl(character.src)} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
                  ) : (
                    <span className="font-display text-4xl text-ink-muted" aria-hidden>{character.name.slice(0, 1)}</span>
                  )}
                </div>
                <div className="flex flex-col gap-1 p-3">
                  <span className="font-display text-lg leading-tight">{character.name}</span>
                  {character.caption && <span className="line-clamp-3 text-xs leading-snug text-ink-muted">{character.caption}</span>}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
      {dialog && (
        <CharacterDialog
          itemId={itemId}
          initial={dialog.index === null ? null : characters[dialog.index]}
          onCancel={() => setDialog(null)}
          onSubmit={(entry) =>
            commit(dialog.index === null ? [...characters, entry] : characters.map((current, i) => (i === dialog.index ? entry : current)))
          }
          onDelete={dialog.index === null ? undefined : () => commit(characters.filter((_, i) => i !== dialog.index)).catch(setError)}
        />
      )}
    </section>
  );
}
