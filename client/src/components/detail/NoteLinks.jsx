import { ExternalLink, FileArchive, FileAudio, FileImage, FileText, FileVideo, Link2, Music2, Play, Plus, Square, Trash2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { detectPlatform, embedFor, PLATFORM_LABELS } from '../../lib/embeds.js';
import { formatBytes, isLocalImage } from '../../lib/images.js';
import { useNoteUpload } from './noteApi.js';
import { cn } from '../../lib/utils.js';
import { Button } from '../ui/Button.jsx';
import { ErrorNote } from '../ui/ErrorNote.jsx';
import { Input } from '../ui/Input.jsx';
import { Spinner } from '../ui/Spinner.jsx';
import { SectionHeading } from './NoteGallery.jsx';
import { resolveFileUrl } from '../../lib/api.js';

function fileIcon(file) {
  const type = file.mime_type ?? '';
  if (!isLocalImage(file.src)) return Link2;
  if (type.startsWith('image/')) return FileImage;
  if (type.startsWith('audio/')) return FileAudio;
  if (type.startsWith('video/')) return FileVideo;
  if (type.includes('zip')) return FileArchive;
  return FileText;
}

/** File đính kèm (tải lên app, tối đa 50MB) và link ngoài. */
export function AttachmentSection({ itemId, files, save }) {
  const uploadNoteFile = useNoteUpload();
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(0);
  const [error, setError] = useState(null);
  const [linkForm, setLinkForm] = useState(null);
  const latest = useRef(files);
  latest.current = files;

  async function upload(list) {
    if (!list.length) return;
    setError(null);
    setBusy((count) => count + list.length);
    try {
      const uploaded = [];
      for (const file of list) {
        if (file.size > 50 * 1024 * 1024) throw new Error(`"${file.name}" lớn hơn 50MB`);
        uploaded.push(await uploadNoteFile(itemId, 'attachment', file));
      }
      await save({ attached_files: [...latest.current, ...uploaded] });
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy((count) => count - list.length);
    }
  }

  async function addLink(event) {
    event.preventDefault();
    const url = linkForm.url.trim();
    if (!/^https?:\/\//i.test(url)) {
      setError(new Error('Link phải bắt đầu bằng http:// hoặc https://'));
      return;
    }
    setError(null);
    try {
      await save({ attached_files: [...files, { name: linkForm.name.trim() || url, src: url }] });
      setLinkForm(null);
    } catch (caught) {
      setError(caught);
    }
  }

  return (
    <section aria-labelledby="attachments-title">
      <SectionHeading title={<span id="attachments-title">File và link đính kèm</span>} hint="PDF, ebook, bản dịch, link bài viết... File tải lên được chép sang Obsidian khi sync.">
        <Button size="sm" onClick={() => setLinkForm(linkForm ? null : { name: '', url: '' })}>
          <Link2 size={14} /> Thêm link
        </Button>
        <Button size="sm" variant="primary" onClick={() => fileRef.current?.click()} disabled={busy > 0}>
          {busy > 0 ? <Spinner size={14} /> : <Upload size={14} />} Tải file lên
        </Button>
        <input ref={fileRef} type="file" multiple className="sr-only" aria-label="Chọn file đính kèm" onChange={(event) => { upload([...event.target.files]); event.target.value = ''; }} />
      </SectionHeading>
      {linkForm && (
        <form onSubmit={addLink} className="mb-3 grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
          <Input value={linkForm.name} onChange={(event) => setLinkForm({ ...linkForm, name: event.target.value })} placeholder="Tên hiển thị" aria-label="Tên link" />
          <Input value={linkForm.url} onChange={(event) => setLinkForm({ ...linkForm, url: event.target.value })} placeholder="https://..." aria-label="Địa chỉ link" autoFocus />
          <Button type="submit">Thêm</Button>
        </form>
      )}
      <ErrorNote error={error} className="mb-3" />
      {files.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-sm text-ink-muted">Chưa có file hay link nào.</p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          {files.map((file, index) => {
            const Icon = fileIcon(file);
            const local = isLocalImage(file.src);
            return (
              <li key={`${file.src}-${index}`} className="flex items-center gap-3 px-4 py-2.5">
                <Icon size={18} className="shrink-0 text-ink-muted" aria-hidden />
                <a href={file.src} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-sm font-medium hover:underline">
                  {file.name}
                </a>
                <span className="hidden shrink-0 text-xs text-ink-muted sm:inline">{local ? formatBytes(file.size_bytes) : new URL(file.src).hostname}</span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Xoá ${file.name}`}
                  title="Xoá"
                  onClick={() => save({ attached_files: files.filter((_, i) => i !== index) }).catch(setError)}
                >
                  <Trash2 size={15} />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

const PLATFORM_DOT = {
  spotify: 'bg-[#1db954]',
  youtube: 'bg-[#ff0033]',
  apple_music: 'bg-[#fa2d48]',
  soundcloud: 'bg-[#ff5500]',
  other: 'bg-ink-muted',
};

/**
 * Playlist: danh sách link; bấm "Phát" để mở trình phát nhúng của Spotify/YouTube ngay trong trang.
 * Trình phát chỉ được tải khi bấm phát (cần mạng), để trang không gọi ra ngoài khi chỉ mở xem.
 */
export function PlaylistSection({ links, save }) {
  const [playing, setPlaying] = useState(null);
  const [form, setForm] = useState(null);
  const [error, setError] = useState(null);

  async function add(event) {
    event.preventDefault();
    const url = form.url.trim();
    if (!/^https?:\/\//i.test(url)) {
      setError(new Error('Dán link Spotify hoặc YouTube (bắt đầu bằng https://)'));
      return;
    }
    setError(null);
    try {
      const entry = { url, ...(form.title.trim() ? { title: form.title.trim() } : {}), platform: detectPlatform(url) };
      await save({ playlist_links: [...links, entry] });
      setForm(null);
      if (embedFor(entry)) setPlaying(links.length);
    } catch (caught) {
      setError(caught);
    }
  }

  async function remove(index) {
    try {
      await save({ playlist_links: links.filter((_, i) => i !== index) });
      if (playing === index) setPlaying(null);
      else if (playing !== null && playing > index) setPlaying(playing - 1);
    } catch (caught) {
      setError(caught);
    }
  }

  const current = playing !== null ? links[playing] : null;
  const embed = current ? embedFor(current) : null;

  return (
    <section aria-labelledby="playlist-title">
      <SectionHeading title={<span id="playlist-title">Playlist</span>} hint="Nhạc nghe khi đọc. Cần mạng để phát.">
        <Button size="sm" variant="primary" onClick={() => setForm(form ? null : { url: '', title: '' })}>
          <Plus size={14} /> Thêm playlist
        </Button>
      </SectionHeading>
      {form && (
        <form onSubmit={add} className="mb-3 grid gap-2 sm:grid-cols-[2fr_1fr_auto]">
          <Input value={form.url} onChange={(event) => setForm({ ...form, url: event.target.value })} placeholder="https://open.spotify.com/playlist/... hoặc link YouTube" aria-label="Link playlist" autoFocus />
          <Input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Tên (không bắt buộc)" aria-label="Tên playlist" />
          <Button type="submit">Thêm</Button>
        </form>
      )}
      <ErrorNote error={error} className="mb-3" />
      {links.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-sm text-ink-muted">Chưa có playlist nào.</p>
      ) : (
        <div className="flex flex-col gap-3">
          <ul className="flex flex-wrap gap-2">
            {links.map((link, index) => {
              const platform = link.platform ?? detectPlatform(link.url);
              const canEmbed = Boolean(embedFor(link));
              const active = playing === index;
              return (
                <li key={`${link.url}-${index}`} className={cn('flex items-center gap-1 rounded-full border border-line bg-surface py-1 pl-3 pr-1', active && 'border-moss ring-2 ring-sage/40')}>
                  <span className={cn('h-2 w-2 shrink-0 rounded-full', PLATFORM_DOT[platform])} aria-hidden />
                  <span className="max-w-[16rem] truncate px-1 text-sm">{link.title || PLATFORM_LABELS[platform]}</span>
                  {canEmbed ? (
                    <Button variant="ghost" size="icon-sm" onClick={() => setPlaying(active ? null : index)} aria-label={active ? `Dừng ${link.title || link.url}` : `Phát ${link.title || link.url}`}>
                      {active ? <Square size={13} /> : <Play size={14} />}
                    </Button>
                  ) : (
                    <a href={link.url} target="_blank" rel="noopener noreferrer" className="rounded-lg p-2 hover:bg-surface-2" aria-label={`Mở ${link.url}`}>
                      <ExternalLink size={14} />
                    </a>
                  )}
                  <Button variant="ghost" size="icon-sm" onClick={() => remove(index)} aria-label={`Xoá ${link.title || link.url}`}>
                    <Trash2 size={13} />
                  </Button>
                </li>
              );
            })}
          </ul>
          {embed ? (
            <div className="overflow-hidden rounded-xl border border-line bg-surface-2" style={embed.aspect ? { aspectRatio: embed.aspect, maxWidth: 720 } : undefined}>
              <iframe
                title={`Trình phát ${current.title || PLATFORM_LABELS[current.platform] || ''}`}
                src={resolveFileUrl(embed.src)}
                width="100%"
                height={embed.height ?? '100%'}
                className="block"
                loading="lazy"
                allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
              />
            </div>
          ) : (
            <p className="flex items-center gap-2 text-sm text-ink-muted">
              <Music2 size={15} aria-hidden /> Bấm nút phát cạnh một playlist để nghe ngay tại đây.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
