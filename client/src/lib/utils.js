import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const cn = (...inputs) => twMerge(clsx(inputs));

export function hashString(text) {
  let hash = 0;
  for (const char of String(text)) hash = (hash * 31 + char.codePointAt(0)) | 0;
  return Math.abs(hash);
}

/** Màu gáy sách: cố định theo tiêu đề để mỗi cuốn luôn mang cùng một màu. */
const SPINE_COLORS = [
  { bg: '#3f6b4e', fg: '#eef3e8' },
  { bg: '#9dbf96', fg: '#1f3a29' },
  { bg: '#6e7f3e', fg: '#f4f1df' },
  { bg: '#4e7a78', fg: '#eef5f3' },
  { bg: '#d9a94e', fg: '#3b2a10' },
  { bg: '#6b4a45', fg: '#f3e9e4' },
  { bg: '#e8e4d2', fg: '#3a4a3f' },
  { bg: '#2c4a52', fg: '#e4eef0' },
  { bg: '#b9cfa8', fg: '#2b4232' },
  { bg: '#8a5a3c', fg: '#f6ece2' },
];

export const spineColor = (title) => SPINE_COLORS[hashString(title) % SPINE_COLORS.length];

export function formatDate(value) {
  if (!value) return '';
  const [year, month, day] = value.slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}

export function formatDateTime(value) {
  if (!value) return '';
  return new Date(value).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
}

export const formatNumber = (value) => (value === null || value === undefined ? '' : Number(value).toLocaleString('vi-VN'));

export function readTextFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file, 'utf-8');
  });
}

/** Ngày hôm nay theo giờ máy, dạng YYYY-MM-DD (không dùng toISOString vì lệch múi giờ). */
export function todayIso(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Đơn vị tiến độ viết thường, dùng trong câu: "Đang ở trang 120 / 300". */
export const UNIT_WORDS = {
  pages: 'trang',
  chapters: 'chương',
  volumes: 'volume',
  words: 'chữ',
  minutes: 'phút',
  percent: '%',
};

export function formatMinutes(minutes) {
  if (!minutes) return '0 phút';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} phút`;
  return rest ? `${hours} giờ ${rest} phút` : `${hours} giờ`;
}

/** Chữ cái đầu để xếp A–Z (bỏ dấu, Đ → D); khớp với cách server kiểm tra. */
export function firstLetter(text) {
  const clean = String(text ?? '').trim().replace(/[đĐ]/g, 'D').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const match = clean.match(/[A-Za-z]/);
  return match ? match[0].toUpperCase() : null;
}

export const MONTH_NAMES = ['Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6', 'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'];
