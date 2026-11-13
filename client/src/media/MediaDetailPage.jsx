import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CalendarDays, Clapperboard, Heart, Pencil, PlayCircle, RotateCcw, SquarePen, Stamp } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { NoteTab } from '../components/detail/NoteTab.jsx';
import { NoteUploadContext } from '../components/detail/noteApi.js';
import { Button } from '../components/ui/Button.jsx';
import { ErrorNote } from '../components/ui/ErrorNote.jsx';
import { Spinner } from '../components/ui/Spinner.jsx';
import { Stars } from '../components/ui/StarRating.jsx';
import { TabPanel, Tabs } from '../components/ui/Tabs.jsx';
import { useToast } from '../components/ui/Toast.jsx';
import { uploadMediaNoteFile } from '../lib/images.js';
import { cn } from '../lib/utils.js';
import { categoryLabel, MEDIA_STATUS_LABELS } from './mediaConfig.js';
import { MediaFormDialog } from './MediaFormDialog.jsx';
import { useMediaItem, useMediaNote, useSaveMediaNote, useToggleMediaFavorite } from './queries.js';
import { WatchCardTab } from './WatchCardTab.jsx';
import { resolveFileUrl } from '../lib/api.js';

const TABS = ['note', 'card'];
const STATUS_TONE = { Watching: 'bg-honey/25 text-ink', Finished: 'bg-sage/40 text-ink', TBW: 'bg-surface-2 text-ink-muted', DNF: 'bg-danger/10 text-danger' };
const pad = (value) => String(value).padStart(2, '0');

function Poster({ item }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="relative aspect-[2/3] w-44 shrink-0 overflow-hidden rounded-lg bg-surface-2 shadow-[0_22px_40px_-18px_rgb(var(--shadow)/0.55)] sm:w-56 lg:w-64">
      {item.cover_image && !failed ? (
        <img src={resolveFileUrl(item.cover_image)} alt={`Poster ${item.title}`} className="h-full w-full object-cover" onError={() => setFailed(true)} />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-4 text-center text-ink-muted">
          <Clapperboard size={36} aria-hidden />
          <span className="font-display text-xl text-ink">{item.title}</span>
        </div>
      )}
    </div>
  );
}

function Stat({ label, children, className }) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1', className)}>
      <span className="text-xs text-ink-muted">{label}</span>
      <div className="text-lg font-semibold leading-tight">{children}</div>
    </div>
  );
}

/** Các dòng thông tin dưới tiêu đề; Topics chỉ có ở YouTube. */
function infoRows(item) {
  const episodes = item.episodes_per_season.map((count, index) => `S${index + 1}: ${count ?? '?'} tập`);
  return [
    { label: 'Series', text: item.series_name },
    { label: 'Nhãn thể loại', chips: item.genres },
    { label: 'Diễn viên', chips: item.cast_members },
    { label: 'Hãng sản xuất', chips: item.studios },
    { label: 'Nền tảng xem', chips: item.platforms },
    { label: 'Số tập/season', chips: episodes },
    { label: 'Quốc gia', chips: item.countries },
    { label: 'Ngôn ngữ', text: item.language },
    { label: 'Kênh YouTube', text: item.youtube_channel },
    ...(item.category === 'youtube' ? [{ label: 'Topics', chips: item.topics }] : []),
    { label: 'Warnings', chips: item.warnings, tone: 'warning', emptyText: 'Không có warnings' },
  ];
}

function InfoRows({ item }) {
  return (
    <dl className="grid max-w-2xl grid-cols-[7.5rem_1fr] gap-x-4 gap-y-2.5 text-sm">
      {infoRows(item).map((row) => (
        <div key={row.label} className="contents">
          <dt className="pt-0.5 text-ink-muted">{row.label}</dt>
          <dd className="min-w-0">
            {row.chips ? (
              row.chips.length ? (
                <ul className="flex flex-wrap gap-1.5">
                  {row.chips.map((chip) => (
                    <li key={chip} className={cn('rounded-md px-2 py-0.5', row.tone === 'warning' ? 'border border-danger/40 bg-danger/10 font-medium text-danger' : 'bg-surface-2')}>
                      {row.tone === 'warning' && <span aria-hidden>⚠ </span>}
                      {chip}
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="text-ink-muted">{row.emptyText ?? 'Chưa có'}</span>
              )
            ) : (
              <span className="text-base">{row.text || <span className="text-sm text-ink-muted">Chưa có</span>}</span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function lastWatched(cards) {
  const card = cards.at(-1);
  if (!card) return null;
  const year = card.finish_year ?? card.start_year;
  const month = card.finish_year ? card.finish_month : card.start_month;
  return month ? `${pad(month)}/${year}` : String(year);
}

function MediaHeader({ item, onEdit, onToggleFavorite, favoriteBusy }) {
  const progress = item.progress_total ? Math.min(100, Math.round((item.progress_current / item.progress_total) * 100)) : null;
  const cards = item.watch_cards ?? [];
  return (
    <section className="flex flex-col-reverse gap-8 md:flex-row md:items-start md:justify-between">
      <div className="flex min-w-0 flex-1 flex-col gap-5">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded-full border border-line px-2.5 py-0.5">{categoryLabel(item.category)}</span>
          <span className={cn('rounded-full px-2.5 py-0.5 font-medium', STATUS_TONE[item.status])}>{MEDIA_STATUS_LABELS[item.status]}</span>
        </div>
        <h1 className="font-display text-4xl font-medium leading-[1.05] tracking-tight [overflow-wrap:anywhere] sm:text-5xl lg:text-6xl">{item.title}</h1>
        <InfoRows item={item} />
        <div className="grid max-w-2xl grid-cols-2 gap-x-6 gap-y-5 rounded-2xl border border-line bg-surface/80 p-5 sm:grid-cols-4">
          <Stat label="Tiến độ" className="col-span-2">
            <span className="tabular-nums">{progress !== null ? `${progress}%` : `${item.progress_current} tập`}</span>
            {progress !== null && (
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Tiến độ xem">
                <div className="h-full rounded-full bg-moss" style={{ width: `${progress}%` }} />
              </div>
            )}
            <span className="mt-1.5 block text-xs font-normal text-ink-muted">
              {item.progress_total ? `Tập ${item.progress_current} / ${item.progress_total}` : 'Chưa có tổng số tập'}
              {item.season_current || item.season_total ? ' · ' : ''}
              {item.season_current || item.season_total ? <span>{`Season ${item.season_current ?? '?'}${item.season_total ? `/${item.season_total}` : ''}`}</span> : null}
            </span>
          </Stat>
          <Stat label="Lượt xem">
            <span className="inline-flex items-center gap-1.5 tabular-nums">
              <RotateCcw size={16} className="text-ink-muted" aria-hidden />
              {cards.length}
            </span>
          </Stat>
          <Stat label="Xem gần nhất">
            <span className="inline-flex items-center gap-1.5 tabular-nums">
              <CalendarDays size={16} className="text-ink-muted" aria-hidden />
              {lastWatched(cards) ?? 'Chưa có'}
            </span>
          </Stat>
          <Stat label="Đánh giá chung" className="col-span-2 sm:col-span-4">
            {item.rating ? <Stars value={item.rating} size={18} /> : <span className="text-base font-normal text-ink-muted">Chưa chấm</span>}
          </Stat>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant={item.is_favorite ? 'primary' : 'secondary'} onClick={onToggleFavorite} disabled={favoriteBusy} aria-pressed={item.is_favorite}>
            <Heart size={16} fill={item.is_favorite ? 'currentColor' : 'none'} /> {item.is_favorite ? 'Đang yêu thích' : 'Yêu thích'}
          </Button>
          <Button onClick={onEdit}>
            <Pencil size={16} /> Sửa thông tin
          </Button>
          {item.trailer_url && (
            <a href={item.trailer_url} target="_blank" rel="noreferrer noopener" className="inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium text-ink hover:bg-surface-2">
              <PlayCircle size={16} /> Xem trailer
            </a>
          )}
        </div>
      </div>
      <div className="flex justify-center md:justify-end">
        <Poster item={item} />
      </div>
    </section>
  );
}

export function MediaDetailPage() {
  const { id: rawId } = useParams();
  const id = Number(rawId);
  const valid = Number.isInteger(id) && id > 0;
  const location = useLocation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = TABS.includes(params.get('tab')) ? params.get('tab') : 'note';
  const item = useMediaItem(valid ? id : null);
  const client = useQueryClient();
  const favorite = useToggleMediaFavorite();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const backTo = location.state?.from ?? '/media';

  useEffect(() => {
    if (item.data?.title) document.title = item.data.title;
  }, [item.data?.title]);
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [id]);

  const setTab = (next) =>
    setParams(
      (current) => {
        const copy = new URLSearchParams(current);
        if (next === 'note') copy.delete('tab');
        else copy.set('tab', next);
        return copy;
      },
      { replace: true, state: location.state },
    );

  if (!valid || item.error?.status === 404) {
    return (
      <div className="py-16 text-center">
        <p className="font-display text-3xl">Không tìm thấy media này</p>
        <p className="mt-2 text-ink-muted">Media có thể đã bị xoá.</p>
        <Link to="/media" className="mt-5 inline-block text-moss underline-offset-4 hover:underline">
          Về danh sách media
        </Link>
      </div>
    );
  }
  if (item.isLoading) {
    return (
      <div className="flex items-center gap-2 py-16 text-ink-muted">
        <Spinner /> Đang mở media
      </div>
    );
  }
  if (item.error) return <ErrorNote error={item.error} />;
  const media = item.data;
  const refresh = () => {
    client.invalidateQueries({ queryKey: ['media'] });
    client.invalidateQueries({ queryKey: ['series'] });
    client.invalidateQueries({ queryKey: ['sync-status'] });
  };

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Button variant="ghost" size="sm" onClick={() => navigate(backTo)} className="-ml-2">
          <ArrowLeft size={16} /> Danh sách media
        </Button>
      </div>
      <MediaHeader
        item={media}
        onEdit={() => setEditing(true)}
        favoriteBusy={favorite.isPending}
        onToggleFavorite={() =>
          favorite.mutate(media, {
            onSuccess: () => toast(media.is_favorite ? 'Đã bỏ khỏi yêu thích' : 'Đã thêm vào yêu thích'),
            onError: (error) => toast(error.message, { tone: 'error' }),
          })
        }
      />
      <Tabs
        value={tab}
        onValueChange={setTab}
        label="Nội dung media"
        tabs={[
          { value: 'note', label: 'Note & Review', icon: <SquarePen size={16} aria-hidden /> },
          { value: 'card', label: 'Thẻ lượt xem', icon: <Stamp size={16} aria-hidden />, badge: media.watch_cards.length },
        ]}
      >
        <TabPanel value="note">
          <NoteUploadContext.Provider value={uploadMediaNoteFile}>
            <NoteTab item={media} useNoteQuery={useMediaNote} useSaveNoteMutation={useSaveMediaNote} showTemplate={false} hint="Markdown như trong Obsidian. Nội dung này là phần thân file .md của media khi sync." />
          </NoteUploadContext.Provider>
        </TabPanel>
        <TabPanel value="card">
          <WatchCardTab item={media} onChanged={refresh} />
        </TabPanel>
      </Tabs>
      {editing && (
        <MediaFormDialog
          open
          item={media}
          onOpenChange={(open) => {
            if (!open) setEditing(false);
          }}
          onDeleted={() => navigate(backTo, { replace: true })}
        />
      )}
    </div>
  );
}
