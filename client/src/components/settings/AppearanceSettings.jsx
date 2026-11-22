import { AppIconSettings } from './AppIconSettings.jsx';
import { OrnamentSettings } from './OrnamentSettings.jsx';
import { ThemeEditor } from './ThemeEditor.jsx';
import { setUiLanguage, UI_LANGUAGES } from '../../i18n/translator.js';
import { useQueryClient } from '@tanstack/react-query';
import { Check, ImagePlus, Pencil, Plus, RotateCcw, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useSettings } from '../../hooks/queries.js';
import { api, IS_PWA, resolveFileUrl, sendBinary } from '../../lib/api.js';
import { applyAppearance, BODY_FONTS, DEFAULT_APPEARANCE, DISPLAY_FONTS, isCustomTheme, PRESETS, resolvePalette } from '../../lib/appearance.js';
import { prepareImage } from '../../lib/images.js';
import { cn } from '../../lib/utils.js';
import { Button } from '../ui/Button.jsx';
import { Dialog } from '../ui/Dialog.jsx';
import { ErrorNote } from '../ui/ErrorNote.jsx';
import { Input, Select } from '../ui/Input.jsx';
import { Spinner } from '../ui/Spinner.jsx';

const SIZE_LABELS = { 13: 'Rất nhỏ', 14: 'Nhỏ', 15: 'Vừa', 16: 'Hơi lớn', 17: 'Lớn', 18: 'Rất lớn', 19: 'Rất lớn', 20: 'Cực lớn' };

function Section({ title, description, children }) {
  return (
    <section className="flex flex-col gap-3 border-b border-line pb-6 last:border-0">
      <div>
        <h3 className="font-display text-xl">{title}</h3>
        {description && <p className="mt-1 text-sm text-ink-muted">{description}</p>}
      </div>
      {children}
    </section>
  );
}

/** Thay đổi áp dụng ngay để xem trước; tự lưu sau khi dừng chỉnh một nhịp ngắn. */
export function AppearanceSettings() {
  const settings = useSettings();
  const client = useQueryClient();
  const fileRef = useRef(null);
  const [draft, setDraft] = useState(null);
  const [state, setState] = useState('idle');
  const [error, setError] = useState(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const saveTimer = useRef(null);
  const nameTimer = useRef(null);
  const [appName, setAppName] = useState(null);
  const [nameError, setNameError] = useState(null);
  const [themeDialog, setThemeDialog] = useState(null);
  const [themeSaving, setThemeSaving] = useState(false);

  useEffect(() => {
    if (settings.data && !draft) setDraft(settings.data.appearance);
    if (settings.data && appName === null) setAppName(settings.data.general.app_name);
  }, [settings.data, draft, appName]);

  if (!draft) return <Spinner />;

  const store = (data) => client.setQueryData(['settings'], data);

  function changeName(value) {
    setAppName(value);
    clearTimeout(nameTimer.current);
    if (!value.trim()) {
      setNameError('Tên app không được trống');
      return;
    }
    setNameError(null);
    setState('pending');
    nameTimer.current = setTimeout(async () => {
      try {
        store(await api.patch('/settings', { general: { app_name: value.trim() } }));
        setState('saved');
      } catch (caught) {
        setNameError(caught.message);
        setState('idle');
      }
    }, 500);
  }

  const themes = settings.data?.themes ?? [];

  /** Lưu danh sách theme; theme mới tạo (hoặc đang sửa theme đang dùng) thì áp ngay. */
  async function saveThemes(nextThemes, useId) {
    setThemeSaving(true);
    setError(null);
    try {
      const data = await api.patch('/settings', { themes: nextThemes, ...(useId ? { appearance: { preset: useId } } : {}) });
      store(data);
      setDraft((current) => ({ ...current, preset: data.appearance.preset }));
      applyAppearance({ ...draft, preset: data.appearance.preset }, data.themes);
      setThemeDialog(null);
      setState('saved');
    } catch (caught) {
      setError(caught);
    } finally {
      setThemeSaving(false);
    }
  }

  function change(patch) {
    const next = { ...draft, ...patch };
    setDraft(next);
    applyAppearance(next, settings.data?.themes ?? []);
    setState('pending');
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        const { background_image: ignored, ...appearance } = next;
        store(await api.patch('/settings', { appearance }));
        setState('saved');
        setError(null);
      } catch (caught) {
        setError(caught);
        setState('idle');
      }
    }, 400);
  }

  async function uploadBackground(file) {
    if (!file) return;
    setState('pending');
    setError(null);
    try {
      const blob = await prepareImage(file, { maxSide: 2400 });
      const data = await sendBinary('PUT', '/settings/background', blob);
      store(data);
      setDraft(data.appearance);
      setState('saved');
    } catch (caught) {
      setError(caught);
      setState('idle');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function removeBackground() {
    const data = await api.delete('/settings/background');
    store(data);
    setDraft(data.appearance);
  }

  async function reset() {
    const data = await api.post('/settings/appearance/reset');
    store(data);
    setDraft(data.appearance);
    applyAppearance(data.appearance, data.themes ?? []);
    setConfirmReset(false);
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex items-center gap-3 text-sm text-ink-muted" aria-live="polite">
        {state === 'pending' && (
          <>
            <Spinner size={14} /> Đang lưu
          </>
        )}
        {state === 'saved' && (
          <>
            <Check size={14} className="text-moss" /> Đã lưu
          </>
        )}
        <Button className="ml-auto" onClick={() => setConfirmReset(true)}>
          <RotateCcw size={15} /> Khôi phục giao diện mặc định
        </Button>
      </div>
      <ErrorNote error={error} />

      <Section
        title="Tên app"
        description={IS_PWA ? 'Hiện ở góc trên bên trái và trên tab trình duyệt.' : 'Hiện ở góc trên bên trái, trên tab trình duyệt và là tên lối tắt trên Desktop (lối tắt tự đổi tên theo).'}
      >
        <div className="flex flex-col gap-1.5">
          <Input value={appName ?? ''} onChange={(event) => changeName(event.target.value)} maxLength={40} className="sm:w-80" aria-label="Tên app" aria-invalid={nameError ? true : undefined} />
          {nameError && <p className="text-xs text-danger">{nameError}</p>}
        </div>
      </Section>

      <Section title="Biểu tượng app" description="Dùng file PNG (nên là ảnh vuông, nền trong suốt). Biểu tượng hiện ở góc trên bên trái, trên tab trình duyệt và trên lối tắt Desktop của Windows.">
        <AppIconSettings />
      </Section>

      <Section title="Ngôn ngữ giao diện" description="Tiếng Việt dùng toàn bộ từ thuần Việt. Nội dung bạn nhập (tên sách, tag, ghi chú) và file Obsidian không bị dịch.">
        <Select
          value={settings.data?.general?.ui_language ?? 'vi'}
          onChange={async (event) => {
            const lang = event.target.value;
            setUiLanguage(lang);
            try {
              store(await api.patch('/settings', { general: { ui_language: lang } }));
            } catch (caught) {
              setError(caught);
            }
          }}
          className="sm:w-80"
          aria-label="Ngôn ngữ giao diện"
        >
          {Object.entries(UI_LANGUAGES).map(([value, label]) => (
            <option key={value} value={value} translate="no">
              {label}
            </option>
          ))}
        </Select>
      </Section>

      <Section title="Màu chủ đề" description="Mỗi bảng màu có cả bản sáng và tối; nút mặt trăng trên thanh trên cùng để đổi sáng/tối. Tạo theme mới để tự chọn màu; bấm biểu tượng bút trên theme để sửa hoặc xoá.">
        <div role="radiogroup" aria-label="Bảng màu" className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {Object.entries(PRESETS).map(([key, preset]) => {
            const active = draft.preset === key;
            return (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => change({ preset: key })}
                className={cn('flex flex-col gap-2 rounded-xl border p-3 text-left text-sm transition-colors', active ? 'border-moss bg-surface' : 'border-line hover:border-sage')}
              >
                <span className="flex gap-1" aria-hidden>
                  {['paper', 'sage', 'moss', 'ink'].map((name) => (
                    <span key={name} className="h-6 w-6 rounded-full border border-black/10" style={{ background: preset.light[name] }} />
                  ))}
                </span>
                <span className="font-medium">{preset.label}</span>
              </button>
            );
          })}
          {themes.map((theme) => {
            const active = draft.preset === theme.id;
            return (
              <div key={theme.id} className={cn('relative flex flex-col gap-2 rounded-xl border p-3 text-left text-sm transition-colors', active ? 'border-moss bg-surface' : 'border-line hover:border-sage')}>
                <button type="button" role="radio" aria-checked={active} onClick={() => change({ preset: theme.id })} className="flex flex-col gap-2 text-left">
                  <span className="flex gap-1" aria-hidden>
                    {['paper', 'sage', 'moss', 'ink'].map((name) => (
                      <span key={name} className="h-6 w-6 rounded-full border border-black/10" style={{ background: theme.light[name] }} />
                    ))}
                  </span>
                  <span className="truncate pr-6 font-medium">{theme.name}</span>
                </button>
                <button type="button" onClick={() => setThemeDialog({ theme })} className="absolute bottom-2.5 right-2 rounded p-1 text-ink-muted hover:bg-surface-2 hover:text-ink" aria-label={`Sửa theme ${theme.name}`}>
                  <Pencil size={14} />
                </button>
              </div>
            );
          })}
          <button
            type="button"
            onClick={() => setThemeDialog({ theme: null })}
            disabled={themes.length >= 30}
            className="flex min-h-[4.6rem] flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-line p-3 text-sm text-ink-muted hover:border-sage hover:text-ink disabled:opacity-50"
          >
            <Plus size={18} /> Tạo theme mới
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="color"
              value={draft.accent ?? resolvePalette(draft.preset, themes).light.moss}
              onChange={(event) => change({ accent: event.target.value })}
              className="h-9 w-12 cursor-pointer rounded border border-line bg-surface"
              aria-label="Màu nhấn tuỳ chỉnh"
            />
            Màu nhấn tuỳ chỉnh (nút chính, mục đang chọn)
          </label>
          {draft.accent && (
            <Button size="sm" variant="ghost" onClick={() => change({ accent: null })}>
              <X size={14} /> Dùng màu của bảng
            </Button>
          )}
        </div>
      </Section>

      {themeDialog && (
        <ThemeEditor
          theme={themeDialog.theme}
          basePreset={isCustomTheme(draft.preset) ? 'moss' : draft.preset}
          saving={themeSaving}
          onCancel={() => setThemeDialog(null)}
          onDelete={() => saveThemes(themes.filter((entry) => entry.id !== themeDialog.theme.id))}
          onSave={(values) => {
            if (themeDialog.theme) {
              const id = themeDialog.theme.id;
              saveThemes(themes.map((entry) => (entry.id === id ? { ...entry, ...values } : entry)), draft.preset === id ? id : undefined);
            } else {
              const id = `custom-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
              saveThemes([...themes, { id, ...values }], id);
            }
          }}
        />
      )}

      <Section title="Font chữ" description="Font tiêu đề dùng cho tên sách, gáy sách và tiêu đề trang; font nội dung dùng cho phần còn lại.">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Font tiêu đề
            <Select value={draft.display_font} onChange={(event) => change({ display_font: event.target.value })}>
              {Object.entries(DISPLAY_FONTS).map(([key, font]) => (
                <option key={key} value={key}>
                  {font.label}
                </option>
              ))}
            </Select>
            <span className="text-2xl font-normal" style={{ fontFamily: DISPLAY_FONTS[draft.display_font].family }}>
              Lâu đài bay của pháp sư Howl
            </span>
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Font nội dung
            <Select value={draft.body_font} onChange={(event) => change({ body_font: event.target.value })}>
              {Object.entries(BODY_FONTS).map(([key, font]) => (
                <option key={key} value={key}>
                  {font.label}
                </option>
              ))}
            </Select>
            <span className="text-base font-normal leading-relaxed" style={{ fontFamily: BODY_FONTS[draft.body_font].family }}>
              Sophie bước qua cánh cửa, và thế giới bên kia hiện ra.
            </span>
          </label>
        </div>
      </Section>

      <Section title="Cỡ chữ" description="Đổi cỡ của toàn bộ giao diện, kể cả kệ sách.">
        <div className="flex items-center gap-4">
          <span className="text-sm text-ink-muted">A</span>
          <input
            type="range"
            min={13}
            max={20}
            step={1}
            value={draft.font_size}
            onChange={(event) => change({ font_size: Number(event.target.value) })}
            className="w-64 accent-[var(--moss)]"
            aria-label="Cỡ chữ"
            aria-valuetext={`${draft.font_size} pixel, ${SIZE_LABELS[draft.font_size]}`}
          />
          <span className="text-lg text-ink-muted">A</span>
          <span className="text-sm tabular-nums">
            {draft.font_size}px, {SIZE_LABELS[draft.font_size]}
            {draft.font_size === DEFAULT_APPEARANCE.font_size && ' (mặc định)'}
          </span>
        </div>
      </Section>

      <Section title="Ảnh nền" description="Ảnh phủ toàn màn hình phía sau kệ sách. Giảm độ đậm nếu chữ khó đọc.">
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex h-28 w-44 items-center justify-center overflow-hidden rounded-lg border border-dashed border-line bg-surface-2">
            {draft.background_image ? (
              <img src={resolveFileUrl(draft.background_image)} alt="Ảnh nền hiện tại" className="h-full w-full object-cover" style={{ opacity: Math.max(draft.background_opacity, 0.15) }} />
            ) : (
              <ImagePlus size={20} className="text-ink-muted" aria-hidden />
            )}
          </div>
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => fileRef.current?.click()}>
                <ImagePlus size={15} /> {draft.background_image ? 'Đổi ảnh nền' : 'Chọn ảnh nền'}
              </Button>
              {draft.background_image && (
                <Button variant="ghost" onClick={removeBackground}>
                  <X size={15} /> Bỏ ảnh nền
                </Button>
              )}
            </div>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Độ đậm của ảnh: {Math.round(draft.background_opacity * 100)}%
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={Math.round(draft.background_opacity * 100)}
                onChange={(event) => change({ background_opacity: Number(event.target.value) / 100 })}
                disabled={!draft.background_image}
                className="w-64 accent-[var(--moss)]"
                aria-label="Độ đậm của ảnh nền"
              />
            </label>
          </div>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif" className="sr-only" onChange={(event) => uploadBackground(event.target.files[0])} aria-label="Chọn ảnh nền" />
        </div>
      </Section>

      <Section title="Đồ trang trí kệ sách" description="Như booknook: các món bật Hiện được đặt ngẫu nhiên giữa các gáy sách trên từng tầng kệ. Bấm nút xúc xắc trên kệ sách để xếp lại.">
        <OrnamentSettings />
      </Section>

      <Dialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        size="sm"
        title="Khôi phục giao diện mặc định?"
        description="Bảng màu Rêu, font Fraunces và Be Vietnam Pro, cỡ chữ 15px, bỏ ảnh nền."
        footer={
          <>
            <Button onClick={() => setConfirmReset(false)}>Giữ như hiện tại</Button>
            <Button variant="primary" onClick={reset}>
              Khôi phục mặc định
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-muted">Ảnh nền đã tải lên sẽ bị xoá.</p>
      </Dialog>
    </div>
  );
}
