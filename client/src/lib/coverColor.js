import { useEffect, useState } from 'react';

/**
 * Màu gáy sách lấy theo màu bìa khi sách không có ảnh gáy: thu nhỏ bìa còn 24x36 px, lấy màu trung bình
 * có ưu tiên điểm ảnh đậm màu, rồi chọn chữ sáng/tối cho đủ tương phản. Kết quả được nhớ trong
 * localStorage theo URL ảnh. Ảnh ở trang khác không cho đọc điểm ảnh (CORS) thì giữ màu mặc định.
 */
const CACHE_KEY = 'rt-cover-colors';
const memory = new Map();
let stored = null;

function cache() {
  if (stored) return stored;
  try {
    stored = JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}');
  } catch {
    stored = {};
  }
  return stored;
}

function remember(url, color) {
  memory.set(url, color);
  const all = cache();
  all[url] = color;
  const keys = Object.keys(all);
  if (keys.length > 800) for (const key of keys.slice(0, keys.length - 800)) delete all[key];
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(all));
  } catch {
    // localStorage đầy hoặc bị chặn: chỉ nhớ trong phiên.
  }
}

const hex = (value) => Math.round(value).toString(16).padStart(2, '0');

function luminance(r, g, b) {
  const channel = (value) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function extract(image) {
  const canvas = document.createElement('canvas');
  canvas.width = 24;
  canvas.height = 36;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  let r = 0;
  let g = 0;
  let b = 0;
  let total = 0;
  for (let index = 0; index < data.length; index += 4) {
    if (data[index + 3] < 128) continue;
    const max = Math.max(data[index], data[index + 1], data[index + 2]);
    const min = Math.min(data[index], data[index + 1], data[index + 2]);
    const weight = 1 + ((max - min) / 255) * 4;
    r += data[index] * weight;
    g += data[index + 1] * weight;
    b += data[index + 2] * weight;
    total += weight;
  }
  if (!total) return null;
  [r, g, b] = [r / total, g / total, b / total];
  return { bg: `#${hex(r)}${hex(g)}${hex(b)}`, fg: luminance(r, g, b) > 0.36 ? '#1f2a22' : '#f4f1e8' };
}

export function useCoverColor(url, enabled = true) {
  const [color, setColor] = useState(() => (url ? memory.get(url) ?? cache()[url] ?? null : null));
  useEffect(() => {
    if (!enabled || !url) return undefined;
    const known = memory.get(url) ?? cache()[url];
    if (known !== undefined) {
      setColor(known);
      return undefined;
    }
    let cancelled = false;
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.decoding = 'async';
    image.onload = () => {
      let result = null;
      try {
        result = extract(image);
      } catch {
        result = null;
      }
      remember(url, result);
      if (!cancelled) setColor(result);
    };
    image.onerror = () => {
      memory.set(url, null);
    };
    image.src = url;
    return () => {
      cancelled = true;
    };
  }, [url, enabled]);
  return enabled ? color : null;
}
