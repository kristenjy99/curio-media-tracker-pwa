import { useState } from 'react';
import { ImagePicker } from '../components/books/ImagePicker.jsx';
import { Button } from '../components/ui/Button.jsx';
import { ChipsInput } from '../components/ui/ChipsInput.jsx';
import { ComboInput } from '../components/ui/ComboInput.jsx';
import { Dialog } from '../components/ui/Dialog.jsx';
import { Field } from '../components/ui/Field.jsx';
import { Input, Select } from '../components/ui/Input.jsx';
import { Spinner } from '../components/ui/Spinner.jsx';
import { StarInput } from '../components/ui/StarRating.jsx';
import { Switch } from '../components/ui/Switch.jsx';
import { useToast } from '../components/ui/Toast.jsx';
import { useSettings } from '../hooks/queries.js';
import { ApiError } from '../lib/api.js';
import { isLocalImage } from '../lib/images.js';
import { MEDIA_CATEGORIES, MEDIA_STATUSES, MEDIA_STATUS_LABELS } from './mediaConfig.js';
import { useDeleteMediaItem, useMediaCountries, useMediaGenres, useMediaSeries, useMediaValues, useSaveMediaItem } from './queries.js';

const toNumber = (text) => (text === '' ? null : Number(text));

/** "10, 12, ?, 8" -> [10, 12, null, 8]; trả null nếu có giá trị không hợp lệ. */
function parseEpisodes(text) {
  const parts = text.split(/[,;\s]+/).map((part) => part.trim()).filter(Boolean);
  const result = [];
  for (const part of parts) {
    if (part === '?') result.push(null);
    else if (/^\d{1,6}$/.test(part)) result.push(Number(part));
    else return null;
  }
  return result;
}

function SectionTitle({ children }) {
  return <h3 className="border-t border-line pt-4 text-sm font-semibold text-ink-muted sm:col-span-2">{children}</h3>;
}

/** Thêm hoặc sửa một media. Trường chi tiết theo category sẽ bổ sung ở bước sau. */
export function MediaFormDialog({ open, onOpenChange, item, defaultCategory, onDeleted }) {
  const toast = useToast();
  const save = useSaveMediaItem();
  const remove = useDeleteMediaItem();
  const series = useMediaSeries();
  const genres = useMediaGenres();
  const countries = useMediaCountries();
  const values = useMediaValues();
  const settings = useSettings();
  const suggest = (key) => values.data?.[key] ?? [];
  const languageOptions = [...new Set([...(settings.data?.languages ?? []), ...suggest('language')])];
  const [form, setForm] = useState(() => ({
    title: item?.title ?? '',
    category: item?.category ?? defaultCategory ?? 'tv_series',
    status: item?.status ?? 'TBW',
    rating: item?.rating ?? null,
    progress_current: item?.progress_current ?? 0,
    progress_total: item?.progress_total ?? null,
    genres: item?.genres ?? [],
    countries: item?.countries ?? [],
    is_favorite: item?.is_favorite ?? false,
    series_name: item?.series_name ?? '',
    season_current: item?.season_current ?? null,
    season_total: item?.season_total ?? null,
    start_year: item?.start_year ?? null,
    finish_year: item?.finish_year ?? null,
    youtube_channel: item?.youtube_channel ?? '',
    cast_members: item?.cast_members ?? [],
    studios: item?.studios ?? [],
    platforms: item?.platforms ?? [],
    episodes_text: (item?.episodes_per_season ?? []).map((count) => count ?? '?').join(', '),
    language: item?.language ?? '',
    trailer_url: item?.trailer_url ?? '',
    warnings: item?.warnings ?? [],
    topics: item?.topics ?? [],
    cover_url: item?.cover_image && !isLocalImage(item.cover_image) ? item.cover_image : '',
  }));
  const [cover, setCover] = useState(null);
  const [clearCover, setClearCover] = useState(false);
  const [errors, setErrors] = useState({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const busy = save.isPending || remove.isPending;
  const set = (key) => (value) => setForm((current) => ({ ...current, [key]: value }));
  // Đổi trạng thái thì điền sẵn năm hiện tại vào ô năm tương ứng nếu còn trống (vẫn sửa hoặc xoá được).
  const setStatus = (event) => {
    const status = event.target.value;
    const year = new Date().getFullYear();
    setForm((current) => ({
      ...current,
      status,
      start_year: status === 'Watching' && current.start_year === null ? year : current.start_year,
      finish_year: (status === 'Finished' || status === 'DNF') && current.finish_year === null ? year : current.finish_year,
    }));
  };
  const setInput = (key, parse = (v) => v) => (event) => set(key)(parse(event.target.value));

  async function submit(event) {
    event.preventDefault();
    setErrors({});
    const episodes = parseEpisodes(form.episodes_text);
    if (episodes === null) {
      setErrors({ episodes_per_season: 'Nhập số tập của từng season, cách nhau bằng dấu phẩy; chưa biết thì ghi ?' });
      return;
    }
    try {
      const { episodes_text: ignored, cover_url: coverUrl, ...rest } = form;
      const data = {
        ...rest,
        title: form.title.trim(),
        progress_current: form.progress_current || 0,
        episodes_per_season: episodes,
        youtube_channel: form.youtube_channel.trim() || null,
        language: form.language.trim() || null,
        trailer_url: form.trailer_url.trim() || null,
        // Topics chỉ dùng cho YouTube; đổi sang category khác thì giữ nguyên giá trị cũ.
        topics: form.topics,
      };
      // Link ảnh chỉ gửi khi không chọn ảnh từ máy và ảnh hiện tại không phải file đã tải lên.
      if (!cover && !(isLocalImage(item?.cover_image) && !clearCover)) data.cover_image = coverUrl.trim() || null;
      const saved = await save.mutateAsync({ id: item?.id, data, cover, clearCover });
      toast(item ? `Đã lưu "${saved.title}"` : `Đã thêm "${saved.title}"`);
      onOpenChange(false);
    } catch (caught) {
      if (caught instanceof ApiError && caught.fieldErrors && Object.keys(caught.fieldErrors()).length) setErrors(caught.fieldErrors());
      else toast(caught.message, { tone: 'error' });
    }
  }

  async function doDelete() {
    try {
      await remove.mutateAsync(item.id);
      toast(`Đã xoá "${item.title}"`);
      onOpenChange(false);
      onDeleted?.();
    } catch (caught) {
      toast(caught.message, { tone: 'error' });
    }
  }

  const localCover = clearCover ? null : isLocalImage(item?.cover_image) ? item.cover_image : null;
  const shownCover = localCover ?? (form.cover_url.trim() || null);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={item ? 'Sửa media' : 'Thêm media'}
      footer={
        <>
          {item &&
            (confirmDelete ? (
              <span className="mr-auto flex items-center gap-2 text-sm">
                Xoá "{item.title}"?
                <Button size="sm" variant="danger" onClick={doDelete} disabled={busy}>
                  Xoá
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
                  Không
                </Button>
              </span>
            ) : (
              <Button variant="ghost" className="mr-auto text-danger" onClick={() => setConfirmDelete(true)} disabled={busy}>
                Xoá
              </Button>
            ))}
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Hủy
          </Button>
          <Button variant="primary" type="submit" form="media-form" disabled={busy}>
            {save.isPending && <Spinner size={14} />} Lưu
          </Button>
        </>
      }
    >
      <form id="media-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Tên" required error={errors.title} className="sm:col-span-2">
          {(props) => <Input {...props} value={form.title} onChange={setInput('title')} autoFocus />}
        </Field>
        <Field label="Thể loại (genres)" hint="Gõ rồi nhấn Enter hoặc dấu phẩy để thêm" error={errors.genres} className="sm:col-span-2">
          {(props) => <ChipsInput {...props} value={form.genres} onChange={set('genres')} suggestions={genres.data?.genres ?? []} placeholder="Drama, Crime, Thriller..." />}
        </Field>
        <Field label="Quốc gia" hint="Gõ rồi nhấn Enter, có thể nhập nhiều nước" error={errors.countries}>
          {(props) => <ChipsInput {...props} value={form.countries} onChange={set('countries')} suggestions={countries.data?.countries ?? []} placeholder="Hàn Quốc, Mỹ..." />}
        </Field>
        <label className="flex h-10 items-center gap-3 self-end text-sm font-medium">
          <Switch checked={form.is_favorite} onCheckedChange={set('is_favorite')} aria-label="Yêu thích" />
          Yêu thích
        </label>
        <Field label="Series" hint="Ví dụ 9-1-1. Dùng chung tên để gom các season" error={errors.series_name} className="sm:col-span-2">
          {(props) => <ComboInput {...props} value={form.series_name} onChange={set('series_name')} suggestions={series.data?.series ?? []} placeholder="Chọn hoặc gõ mới" />}
        </Field>
        <Field label="Season hiện tại" error={errors.season_current}>
          {(props) => <Input {...props} type="number" min={0} value={form.season_current ?? ''} onChange={setInput('season_current', toNumber)} />}
        </Field>
        <Field label="Tổng số season" hint="Để trống nếu chưa biết" error={errors.season_total}>
          {(props) => <Input {...props} type="number" min={0} value={form.season_total ?? ''} onChange={setInput('season_total', toNumber)} />}
        </Field>
        <Field label="Category" error={errors.category}>
          {(props) => (
            <Select {...props} value={form.category} onChange={setInput('category')}>
              {MEDIA_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Trạng thái" error={errors.status}>
          {(props) => (
            <Select {...props} value={form.status} onChange={setStatus}>
              {MEDIA_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {MEDIA_STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Năm bắt đầu xem" hint="Có thẻ lượt xem thì tự lấy theo các lượt" error={errors.start_year}>
          {(props) => <Input {...props} type="number" min={1900} max={3000} value={form.start_year ?? ''} onChange={setInput('start_year', toNumber)} />}
        </Field>
        <Field label="Năm xem xong" hint="Có thẻ lượt xem thì tự lấy theo các lượt" error={errors.finish_year}>
          {(props) => <Input {...props} type="number" min={1900} max={3000} value={form.finish_year ?? ''} onChange={setInput('finish_year', toNumber)} />}
        </Field>
        <Field label="Số tập đã xem" error={errors.progress_current}>
          {(props) => <Input {...props} type="number" min={0} value={form.progress_current} onChange={setInput('progress_current', (v) => toNumber(v) ?? 0)} />}
        </Field>
        <Field label="Tổng số tập" hint="Để trống nếu chưa biết" error={errors.progress_total}>
          {(props) => <Input {...props} type="number" min={0} value={form.progress_total ?? ''} onChange={setInput('progress_total', toNumber)} />}
        </Field>
        <Field label="Đánh giá" error={errors.rating}>
          {(props) => <StarInput {...props} value={form.rating} onChange={set('rating')} />}
        </Field>
        <SectionTitle>Thông tin thêm</SectionTitle>
        <Field label="Diễn viên" error={errors.cast_members} className="sm:col-span-2">
          {(props) => <ChipsInput {...props} value={form.cast_members} onChange={set('cast_members')} suggestions={suggest('cast_members')} placeholder="Chọn hoặc gõ rồi nhấn Enter" />}
        </Field>
        <Field label="Hãng sản xuất" error={errors.studios}>
          {(props) => <ChipsInput {...props} value={form.studios} onChange={set('studios')} suggestions={suggest('studios')} placeholder="HBO, Studio Ghibli..." />}
        </Field>
        <Field label="Nền tảng xem" error={errors.platforms}>
          {(props) => <ChipsInput {...props} value={form.platforms} onChange={set('platforms')} suggestions={suggest('platforms')} placeholder="Netflix, Disney+..." />}
        </Field>
        <Field label="Số tập mỗi season" hint="Theo thứ tự season 1, 2, ...; ví dụ 10, 12, ? (chưa biết ghi ?)" error={errors.episodes_per_season}>
          {(props) => <Input {...props} value={form.episodes_text} onChange={setInput('episodes_text')} placeholder="10, 12, 8" />}
        </Field>
        <Field label="Ngôn ngữ" error={errors.language}>
          {(props) => <ComboInput {...props} value={form.language} onChange={set('language')} suggestions={languageOptions} placeholder="Chọn hoặc gõ mới" />}
        </Field>
        <Field label="Kênh YouTube" error={errors.youtube_channel}>
          {(props) => <ComboInput {...props} value={form.youtube_channel} onChange={set('youtube_channel')} suggestions={suggest('youtube_channel')} placeholder="Tên kênh" />}
        </Field>
        <Field label="Link trailer" error={errors.trailer_url}>
          {(props) => <Input {...props} type="url" value={form.trailer_url} onChange={setInput('trailer_url')} placeholder="https://www.youtube.com/watch?v=..." />}
        </Field>
        {form.category === 'youtube' && (
          <Field label="Topics" error={errors.topics} className="sm:col-span-2">
            {(props) => <ChipsInput {...props} value={form.topics} onChange={set('topics')} suggestions={suggest('topics')} placeholder="Chọn hoặc gõ rồi nhấn Enter" />}
          </Field>
        )}
        <Field label="Warnings" error={errors.warnings} className="sm:col-span-2">
          {(props) => <ChipsInput {...props} value={form.warnings} onChange={set('warnings')} suggestions={suggest('warnings')} placeholder="Chọn hoặc gõ rồi nhấn Enter" />}
        </Field>
        <ImagePicker
          label="Poster"
          hint="Ảnh dọc tỉ lệ 2:3 hiển thị đẹp nhất"
          value={shownCover}
          pending={cover}
          onPick={(blob) => {
            setCover(blob);
            setClearCover(false);
          }}
          onClear={() => {
            setCover(null);
            setClearCover(true);
            set('cover_url')('');
          }}
        />
        {!cover && !localCover && (
          <Field label="Hoặc dán link ảnh" error={errors.cover_image} className="sm:col-span-2">
            {(props) => <Input {...props} value={form.cover_url} onChange={setInput('cover_url')} placeholder="https://... (ví dụ link poster trên IMDb, MyDramaList)" />}
          </Field>
        )}
      </form>
    </Dialog>
  );
}
