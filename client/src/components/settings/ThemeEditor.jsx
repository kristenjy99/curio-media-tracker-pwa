import { AlertTriangle, Trash2, Wand2 } from 'lucide-react';
import { useState } from 'react';
import { autoDarkColors, colorsFromPreset, contrastRatio, deriveColors, PRESETS, THEME_COLOR_KEYS, THEME_COLOR_LABELS } from '../../lib/appearance.js';
import { Button } from '../ui/Button.jsx';
import { Dialog } from '../ui/Dialog.jsx';
import { Field } from '../ui/Field.jsx';
import { Input, Select } from '../ui/Input.jsx';
import { Segmented } from '../ui/Segmented.jsx';
import { Spinner } from '../ui/Spinner.jsx';

const HEX = /^#[0-9a-f]{6}$/i;

function ColorRow({ name, value, onChange }) {
  const [text, setText] = useState(value);
  const [synced, setSynced] = useState(value);
  // Giá trị đổi từ bên ngoài (chọn bảng gốc, sinh bản tối) thì cập nhật ô chữ.
  if (synced !== value) {
    setSynced(value);
    setText(value);
  }
  return (
    <div className="flex items-center gap-3">
      <input type="color" value={value} onChange={(event) => onChange(event.target.value)} className="h-9 w-12 shrink-0 cursor-pointer rounded border border-line bg-surface" aria-label={THEME_COLOR_LABELS[name]} />
      <Input
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          if (HEX.test(event.target.value.trim())) onChange(event.target.value.trim().toLowerCase());
        }}
        onBlur={() => setText(value)}
        className="h-9 w-28 font-mono text-xs"
        aria-label={`Mã màu ${THEME_COLOR_LABELS[name]}`}
      />
      <span className="text-sm">{THEME_COLOR_LABELS[name]}</span>
    </div>
  );
}

/** Xem trước nhỏ bằng biến màu đã suy ra: thẻ, chữ, nút chính, nhãn, sao và kệ gỗ. */
function Preview({ colors, label }) {
  const c = deriveColors(colors);
  return (
    <div className="overflow-hidden rounded-xl border" style={{ background: c.paper, borderColor: c.line, color: c.ink }} aria-label={`Xem trước ${label}`}>
      <div className="flex flex-col gap-3 p-4">
        <div className="rounded-lg border p-3" style={{ background: c.surface, borderColor: c.line }}>
          <p className="font-display text-lg leading-tight">Lâu đài bay của pháp sư Howl</p>
          <p className="text-xs" style={{ color: c['ink-muted'] }}>Diana Wynne Jones · Fiction</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-md px-2 py-0.5" style={{ background: c['surface-2'] }}>Fantasy</span>
            <span className="rounded-md px-2 py-0.5" style={{ background: c.sage }}>Đang đọc</span>
            <span style={{ color: c.honey }}>★★★★★</span>
          </div>
        </div>
        <div className="flex gap-2">
          <span className="rounded-lg px-3 py-1.5 text-sm font-medium" style={{ background: c.moss, color: c['on-moss'] }}>Nút chính</span>
          <span className="rounded-lg border px-3 py-1.5 text-sm" style={{ borderColor: c.line, background: c.surface }}>Nút phụ</span>
        </div>
      </div>
      <div className="flex items-end gap-[3px] px-4 pt-2">
        {[c.moss, c.sage, c.honey, c['ink-muted'], c.surface].map((color, index) => (
          <span key={index} className="w-4 rounded-t-sm" style={{ background: color, height: 38 + (index % 3) * 8 }} />
        ))}
      </div>
      <div className="h-3" style={{ background: `linear-gradient(${c['walnut-light']}, ${c.walnut} 40%, ${c['walnut-dark']})` }} />
    </div>
  );
}

function contrastWarnings(colors) {
  const c = deriveColors(colors);
  const warnings = [];
  if (contrastRatio(c.ink, c.paper) < 4.5) warnings.push('Chữ trên nền trang khó đọc');
  if (contrastRatio(c.ink, c.surface) < 4.5) warnings.push('Chữ trên thẻ/khung khó đọc');
  if (contrastRatio(c['on-moss'], c.moss) < 3) warnings.push('Chữ trên nút chính khó đọc');
  return warnings;
}

/** Tạo hoặc sửa một theme: 7 màu cho bản sáng và 7 màu cho bản tối, có xem trước và cảnh báo độ tương phản. */
export function ThemeEditor({ theme, basePreset, onCancel, onSave, onDelete, saving }) {
  const isNew = !theme;
  const [name, setName] = useState(theme?.name ?? '');
  const [colors, setColors] = useState(() => (theme ? { light: theme.light, dark: theme.dark } : colorsFromPreset(basePreset)));
  const [mode, setMode] = useState('light');
  const [nameError, setNameError] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const setColor = (key, value) => setColors((current) => ({ ...current, [mode]: { ...current[mode], [key]: value } }));
  const warnings = contrastWarnings(colors[mode]);

  function submit(event) {
    event.preventDefault();
    if (!name.trim()) {
      setNameError('Cần tên theme');
      return;
    }
    onSave({ name: name.trim().slice(0, 40), light: colors.light, dark: colors.dark });
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onCancel()}
      size="lg"
      title={isNew ? 'Tạo theme mới' : `Sửa theme "${theme.name}"`}
      description="Chọn 7 màu cho bản sáng và 7 màu cho bản tối; viền, chữ mờ và chữ trên nút được tự tính từ các màu này."
      footer={
        confirmDelete ? (
          <>
            <span className="mr-auto text-sm">Xoá theme này? Nếu đang dùng, app quay về bảng Rêu.</span>
            <Button onClick={() => setConfirmDelete(false)}>Giữ lại</Button>
            <Button variant="danger" onClick={onDelete} disabled={saving}>
              <Trash2 size={16} /> Xoá
            </Button>
          </>
        ) : (
          <>
            {!isNew && (
              <Button variant="ghost" className="mr-auto text-danger" onClick={() => setConfirmDelete(true)} disabled={saving}>
                <Trash2 size={16} /> Xoá theme
              </Button>
            )}
            <Button onClick={onCancel}>Huỷ</Button>
            <Button variant="primary" type="submit" form="theme-form" disabled={saving}>
              {saving && <Spinner />} {isNew ? 'Tạo và dùng theme' : 'Lưu'}
            </Button>
          </>
        )
      }
    >
      <form id="theme-form" onSubmit={submit} className="grid gap-6 md:grid-cols-[1fr_18rem]">
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tên theme" error={nameError}>
              {(props) => <Input {...props} value={name} maxLength={40} onChange={(event) => { setName(event.target.value); setNameError(null); }} placeholder="Ví dụ: Cà phê sữa" />}
            </Field>
            <Field label="Lấy màu từ bảng có sẵn" hint="Ghi đè cả bản sáng và bản tối">
              {(props) => (
                <Select {...props} value="" onChange={(event) => event.target.value && setColors(colorsFromPreset(event.target.value))}>
                  <option value="">Chọn bảng</option>
                  {Object.entries(PRESETS).map(([key, preset]) => (
                    <option key={key} value={key}>
                      {preset.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              label="Chế độ đang sửa"
              value={mode}
              onChange={setMode}
              options={[
                { value: 'light', label: 'Bản sáng' },
                { value: 'dark', label: 'Bản tối' },
              ]}
            />
            {mode === 'dark' && (
              <Button size="sm" variant="ghost" onClick={() => setColors((current) => ({ ...current, dark: autoDarkColors(current.light) }))}>
                <Wand2 size={14} /> Sinh bản tối từ bản sáng
              </Button>
            )}
          </div>
          <div className="flex flex-col gap-2.5">
            {THEME_COLOR_KEYS.map((key) => (
              <ColorRow key={`${mode}-${key}`} name={key} value={colors[mode][key]} onChange={(value) => setColor(key, value)} />
            ))}
          </div>
          {warnings.length > 0 && (
            <p className="flex items-start gap-2 rounded-lg bg-honey/20 px-3 py-2 text-sm" role="status">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>{warnings.join('; ')} ({mode === 'light' ? 'bản sáng' : 'bản tối'}). Vẫn lưu được, nhưng nên tăng chênh lệch sáng tối giữa hai màu.</span>
            </p>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-sm text-ink-muted">Xem trước {mode === 'light' ? 'bản sáng' : 'bản tối'}</span>
          <Preview colors={colors[mode]} label={mode === 'light' ? 'bản sáng' : 'bản tối'} />
        </div>
      </form>
    </Dialog>
  );
}
