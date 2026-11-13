/** Font tuỳ chọn (đều có bộ chữ tiếng Việt, đóng gói sẵn nên chạy được khi không có mạng). */
export const DISPLAY_FONTS = {
  fraunces: { label: 'Fraunces', family: "'Fraunces Variable', Georgia, serif" },
  lora: { label: 'Lora', family: "'Lora Variable', Georgia, serif" },
  playfair: { label: 'Playfair Display', family: "'Playfair Display Variable', Georgia, serif" },
  'noto-serif': { label: 'Noto Serif', family: "'Noto Serif Variable', Georgia, serif" },
  'be-vietnam-pro': { label: 'Be Vietnam Pro', family: "'Be Vietnam Pro', system-ui, sans-serif" },
};

export const BODY_FONTS = {
  'be-vietnam-pro': { label: 'Be Vietnam Pro', family: "'Be Vietnam Pro', system-ui, sans-serif" },
  inter: { label: 'Inter', family: "'Inter Variable', system-ui, sans-serif" },
  nunito: { label: 'Nunito', family: "'Nunito Variable', system-ui, sans-serif" },
  lexend: { label: 'Lexend', family: "'Lexend Variable', system-ui, sans-serif" },
  'noto-serif': { label: 'Noto Serif', family: "'Noto Serif Variable', Georgia, serif" },
};

const wood = { walnut: '#7a5434', 'walnut-dark': '#553821', 'walnut-light': '#9a6e48' };
const woodDark = { walnut: '#5e3f27', 'walnut-dark': '#3d2716', 'walnut-light': '#7a5434' };

/** Bảng màu chủ đề, mỗi bảng có bản sáng và tối. Kệ gỗ giữ nguyên ở mọi bảng. */
export const PRESETS = {
  moss: {
    label: 'Rêu',
    light: { paper: '#eef3e8', surface: '#f8faf4', 'surface-2': '#e2eadb', ink: '#23412f', 'ink-muted': '#5b7262', line: '#cbd8c3', sage: '#a9c5a0', moss: '#2f5a3f', 'on-moss': '#f3f7ef', honey: '#e3b862', ...wood },
    dark: { paper: '#16201a', surface: '#1e2a22', 'surface-2': '#26352c', ink: '#e3ecdd', 'ink-muted': '#a1b4a4', line: '#34463a', sage: '#7fa083', moss: '#a9c5a0', 'on-moss': '#16201a', honey: '#e8c172', ...woodDark },
  },
  ocean: {
    label: 'Biển',
    light: { paper: '#eaf1f4', surface: '#f7fafb', 'surface-2': '#dce8ee', ink: '#1d3a4b', 'ink-muted': '#577384', line: '#c4d6df', sage: '#9cc3d5', moss: '#2b5d79', 'on-moss': '#f1f7fa', honey: '#e8b45a', ...wood },
    dark: { paper: '#111b21', surface: '#19252d', 'surface-2': '#21313b', ink: '#e0ebf1', 'ink-muted': '#9bb1be', line: '#2f4350', sage: '#6f9cb3', moss: '#9cc3d5', 'on-moss': '#111b21', honey: '#ebbf6c', ...woodDark },
  },
  rose: {
    label: 'Hồng trà',
    light: { paper: '#f6eeec', surface: '#fcf8f7', 'surface-2': '#eddfdb', ink: '#4a2a30', 'ink-muted': '#80616a', line: '#e0cbc6', sage: '#dcaeab', moss: '#8b4a56', 'on-moss': '#fdf6f5', honey: '#d9a54e', ...wood },
    dark: { paper: '#1f1618', surface: '#2a1e21', 'surface-2': '#35262a', ink: '#f2e4e4', 'ink-muted': '#c0a3a8', line: '#4a353a', sage: '#b07f83', moss: '#e3b3b5', 'on-moss': '#1f1618', honey: '#e6b867', ...woodDark },
  },
  lavender: {
    label: 'Oải hương',
    light: { paper: '#f0eef6', surface: '#f9f8fc', 'surface-2': '#e4e0ef', ink: '#32294b', 'ink-muted': '#6b6388', line: '#d3cde4', sage: '#b9addb', moss: '#5a4a8b', 'on-moss': '#f7f5fc', honey: '#e3b862', ...wood },
    dark: { paper: '#18151f', surface: '#211d2b', 'surface-2': '#2b2638', ink: '#e8e4f3', 'ink-muted': '#aaa2c3', line: '#3b354c', sage: '#8a7fb5', moss: '#c3b8e6', 'on-moss': '#18151f', honey: '#e8c172', ...woodDark },
  },
  slate: {
    label: 'Đá xám',
    light: { paper: '#eef0f1', surface: '#f8f9f9', 'surface-2': '#e0e4e6', ink: '#262d31', 'ink-muted': '#5f6a70', line: '#cdd3d6', sage: '#b3c0c6', moss: '#3d4b53', 'on-moss': '#f4f6f7', honey: '#d9a94e', ...wood },
    dark: { paper: '#15181a', surface: '#1d2124', 'surface-2': '#262b2f', ink: '#e4e8ea', 'ink-muted': '#a2abb0', line: '#353c41', sage: '#7d8b92', moss: '#c3ced3', 'on-moss': '#15181a', honey: '#e3b862', ...woodDark },
  },
};

export const DEFAULT_APPEARANCE = {
  preset: 'moss',
  accent: null,
  display_font: 'fraunces',
  body_font: 'be-vietnam-pro',
  font_size: 15,
  background_image: null,
  background_opacity: 0.25,
};

const CACHE_KEY = 'rt-appearance';

/** 7 màu người dùng chọn cho mỗi chế độ của theme tự tạo; các màu còn lại suy ra từ đây. */
export const THEME_COLOR_KEYS = ['paper', 'surface', 'ink', 'moss', 'sage', 'honey', 'walnut'];
export const THEME_COLOR_LABELS = {
  paper: 'Nền trang',
  surface: 'Thẻ, khung, ô nhập',
  ink: 'Chữ',
  moss: 'Màu chủ đạo (nút chính, mục đang chọn)',
  sage: 'Màu phụ (viền chọn, nền nhạt)',
  honey: 'Màu điểm (sao đánh giá, nhấn)',
  walnut: 'Gỗ kệ sách',
};

const toRgb = (hex) => [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16));
const toHex = (rgb) => `#${rgb.map((value) => Math.round(Math.min(255, Math.max(0, value))).toString(16).padStart(2, '0')).join('')}`;
/** Trộn hai màu hex: amount = phần của màu b (0..1). */
export const mixHex = (a, b, amount) => {
  const [ra, rb] = [toRgb(a), toRgb(b)];
  return toHex(ra.map((value, index) => value + (rb[index] - value) * amount));
};
const luminance = (hex) => {
  const [r, g, b] = toRgb(hex).map((value) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
/** Tỉ lệ tương phản WCAG giữa hai màu (1..21). */
export const contrastRatio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/** Từ 7 màu chính ra đủ biến màu mà giao diện dùng. */
export function deriveColors(colors) {
  const { paper, surface, ink, moss, sage, honey, walnut } = colors;
  const onMoss = [surface, paper, ink, '#ffffff', '#111111'].reduce((best, candidate) => (contrastRatio(candidate, moss) > contrastRatio(best, moss) ? candidate : best));
  return {
    paper,
    surface,
    'surface-2': mixHex(surface, ink, 0.08),
    ink,
    'ink-muted': mixHex(ink, paper, 0.38),
    line: mixHex(paper, ink, 0.16),
    sage,
    moss,
    'on-moss': onMoss,
    honey,
    walnut,
    'walnut-dark': mixHex(walnut, '#000000', 0.3),
    'walnut-light': mixHex(walnut, '#ffffff', 0.2),
  };
}

/** Bản tối gợi ý từ bản sáng: nền tối ngả theo màu chữ, chữ sáng ngả theo màu nền. */
export function autoDarkColors(light) {
  const paper = mixHex(light.ink, '#000000', 0.55);
  return {
    paper,
    surface: mixHex(paper, '#ffffff', 0.05),
    ink: mixHex(light.paper, '#ffffff', 0.3),
    moss: light.sage,
    sage: mixHex(light.moss, paper, 0.35),
    honey: light.honey,
    walnut: mixHex(light.walnut, '#000000', 0.22),
  };
}

/** 7 màu chính lấy từ một bảng có sẵn, làm điểm xuất phát khi tạo theme mới. */
export function colorsFromPreset(key) {
  const preset = PRESETS[key] ?? PRESETS.moss;
  const pick = (mode) => Object.fromEntries(THEME_COLOR_KEYS.map((name) => [name, preset[mode][name]]));
  return { light: pick('light'), dark: pick('dark') };
}

export const isCustomTheme = (preset) => typeof preset === 'string' && preset.startsWith('custom-');
let knownThemes = [];

/** Bảng màu đầy đủ { light, dark } của bảng có sẵn hoặc theme tự tạo; theme không còn thì dùng Rêu. */
export function resolvePalette(presetKey, themes = knownThemes) {
  if (isCustomTheme(presetKey)) {
    const theme = themes.find((entry) => entry.id === presetKey);
    if (theme) return { light: deriveColors(theme.light), dark: deriveColors(theme.dark) };
  }
  return PRESETS[presetKey] ?? PRESETS.moss;
}

function block(selector, vars) {
  return `${selector}{${Object.entries(vars)
    .map(([name, value]) => `--${name}:${value};`)
    .join('')}}`;
}

/** Ghi bảng màu + font + cỡ chữ vào một thẻ <style> để mọi thành phần dùng biến CSS đổi theo ngay. */
export function applyAppearance(input, themes) {
  if (themes) knownThemes = themes;
  const appearance = { ...DEFAULT_APPEARANCE, ...(input ?? {}) };
  const preset = resolvePalette(appearance.preset);
  const light = { ...preset.light };
  const dark = { ...preset.dark };
  if (appearance.accent) {
    light.moss = appearance.accent;
    light.sage = `color-mix(in srgb, ${appearance.accent} 40%, ${light.paper})`;
    dark.moss = `color-mix(in srgb, ${appearance.accent} 55%, white)`;
    dark.sage = `color-mix(in srgb, ${appearance.accent} 60%, ${dark.paper})`;
  }
  const fonts = {
    'app-font-display': (DISPLAY_FONTS[appearance.display_font] ?? DISPLAY_FONTS.fraunces).family,
    'app-font-sans': (BODY_FONTS[appearance.body_font] ?? BODY_FONTS['be-vietnam-pro']).family,
  };
  let style = document.getElementById('rt-appearance');
  if (!style) {
    style = document.createElement('style');
    style.id = 'rt-appearance';
    document.head.appendChild(style);
  }
  // Selector html:root / html.dark mạnh hơn :root / .dark trong styles.css nên luôn thắng, bất kể thứ tự nạp CSS.
  style.textContent = `${block('html:root', { ...light, ...fonts })}${block('html.dark', dark)}html:root{font-size:${appearance.font_size}px}`;
  try {
    // Theme tự tạo được lưu kèm để lần mở sau áp đúng màu ngay, trước khi tải xong cài đặt.
    const theme = isCustomTheme(appearance.preset) ? knownThemes.find((entry) => entry.id === appearance.preset) : null;
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ...appearance, ...(theme ? { _theme: theme } : {}) }));
  } catch {
    // không lưu được bản tạm thì lần mở sau chỉ hơi chậm áp giao diện
  }
  return appearance;
}

/** Áp bản giao diện đã lưu tạm trong trình duyệt trước khi tải xong cài đặt từ server, tránh nháy màu. */
export function applyCachedAppearance() {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null');
    if (cached) {
      const { _theme: theme, ...appearance } = cached;
      applyAppearance(appearance, theme ? [theme] : undefined);
    }
  } catch {
    // bỏ qua bản tạm hỏng
  }
}
