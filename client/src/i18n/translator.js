import { textId } from './hash.js';
import sources from './source.json';

/**
 * Dịch giao diện ngay trên DOM: chữ trong các text node và thuộc tính placeholder/aria-label/title/alt được thay
 * theo bảng dịch của ngôn ngữ đang chọn. Chuỗi nguồn là tiếng Việt trong mã; chuỗi có {0}, {1}... là mẫu có
 * phần thay đổi (số, tên). Vùng có translate="no" (nội dung người dùng viết như note markdown) không bị dịch.
 * Khi đổi lại tiếng Việt, mọi chữ trở về chuỗi nguồn.
 */
export const UI_LANGUAGES = { vi: 'Tiếng Việt', en: 'English', zh: '中文', ja: '日本語' };
const LOADERS = {
  vi: () => import('./locales/vi.tsv?raw'),
  en: () => import('./locales/en.tsv?raw'),
  zh: () => import('./locales/zh.tsv?raw'),
  ja: () => import('./locales/ja.tsv?raw'),
};
const ATTRS = ['placeholder', 'aria-label', 'title', 'alt', 'aria-valuetext'];
const SKIP = 'script,style,textarea,code,pre,[translate="no"],[contenteditable="true"]';
const CACHE_KEY = 'rt-ui-language';
const LETTER = /[A-Za-zÀ-ỹ一-鿿぀-ヿ]/;

const byId = new Map(sources.map((text) => [textId(text), text]));
let exact = null;
let patterns = [];
let current = 'vi';
let observer = null;
const textState = new WeakMap();
const attrState = new WeakMap();

function parse(raw) {
  const map = new Map();
  for (const line of raw.split(/\r?\n/)) {
    const tab = line.indexOf('\t');
    if (tab < 1) continue;
    const source = byId.get(line.slice(0, tab).trim());
    const target = line.slice(tab + 1).replace(/\\n/g, '\n');
    if (source && target) map.set(source, target);
  }
  return map;
}

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function buildPatterns(map) {
  const list = [];
  for (const [source, target] of map) {
    if (!/\{\d+\}/.test(source)) continue;
    const parts = source.split(/(\{\d+\})/);
    const order = [];
    const regex = parts.map((part) => {
      const slot = part.match(/^\{(\d+)\}$/);
      if (slot) {
        order.push(Number(slot[1]));
        return '([\\s\\S]+?)';
      }
      return escapeRegex(part);
    });
    const literal = parts.filter((part) => !/^\{\d+\}$/.test(part)).join('');
    if (literal.replace(/\s/g, '').length < 2) continue;
    // Mẫu có chữ cố định quá ngắn (ví dụ "Mở {0}", "Tổng {0}") dễ trùng nội dung người dùng gõ:
    // với chữ hiển thị chỉ áp khi phần thay đổi là số.
    const short = (literal.match(/[A-Za-zÀ-ỹ]/g) ?? []).length < 8;
    list.push({ regex: new RegExp(`^${regex.join('')}$`), order, target, short, anchor: parts.find((part) => part && !/^\{\d+\}$/.test(part)) ?? '', weight: literal.length });
  }
  return list.sort((a, b) => b.weight - a.weight);
}

/** Dịch một chuỗi; giữ khoảng trắng đầu/cuối. Không có trong bảng thì trả nguyên. */
const NUMERIC = /^[\d\s.,/:%+−–-]+$/;

export function translate(text, { attribute = false } = {}) {
  // attribute: 'lenient' cho aria-label/placeholder (ít khi chứa nguyên văn nội dung người dùng); title vẫn xét chặt như chữ hiển thị.
  if (!exact || !text || !LETTER.test(text)) return text;
  const match = text.match(/^(\s*)([\s\S]*?)(\s*)$/);
  const core = match[2];
  const hit = exact.get(core);
  if (hit !== undefined) return match[1] + hit + match[3];
  for (const pattern of patterns) {
    if (pattern.anchor && !core.includes(pattern.anchor)) continue;
    const found = core.match(pattern.regex);
    if (!found) continue;
    // Phần thay đổi phải là số hoặc là một từ có trong bảng dịch (ví dụ đơn vị "trang").
    if (pattern.short && attribute !== 'lenient' && !found.slice(1).every((value) => NUMERIC.test(value) || exact.has(value.trim()))) continue;
    let out = pattern.target;
    pattern.order.forEach((slot, index) => {
      const value = found[index + 1];
      out = out.split(`{${slot}}`).join(exact.get(value.trim()) ?? value);
    });
    return match[1] + out + match[3];
  }
  return text;
}

function skipped(element) {
  return !element || element.closest?.(SKIP);
}

function translateTextNode(node) {
  const value = node.nodeValue;
  const state = textState.get(node);
  const source = state && value === state.out ? state.source : value;
  if (skipped(node.parentElement)) return;
  const out = translate(source);
  textState.set(node, { source, out });
  if (out !== value) node.nodeValue = out;
}

function translateAttributes(element) {
  // Ô nhập vẫn được dịch placeholder/aria-label; chỉ bỏ qua vùng translate="no".
  if (element.closest?.('[translate="no"]')) return;
  let states = attrState.get(element);
  for (const name of ATTRS) {
    if (!element.hasAttribute(name)) continue;
    const value = element.getAttribute(name);
    const state = states?.[name];
    const source = state && value === state.out ? state.source : value;
    const out = translate(source, { attribute: name === 'title' ? false : 'lenient' });
    if (!states) attrState.set(element, (states = {}));
    states[name] = { source, out };
    if (out !== value) element.setAttribute(name, out);
  }
}

function walk(root) {
  if (root.nodeType === Node.TEXT_NODE) {
    translateTextNode(root);
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  translateAttributes(root);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeType === Node.TEXT_NODE) translateTextNode(node);
    else translateAttributes(node);
  }
}

function start() {
  if (observer) return;
  observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'characterData') translateTextNode(record.target);
      else if (record.type === 'attributes') translateAttributes(record.target);
      else record.addedNodes.forEach(walk);
    }
  });
  observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}

/** Đổi ngôn ngữ giao diện; dịch lại toàn bộ trang hiện tại. */
export async function setUiLanguage(language) {
  const lang = LOADERS[language] ? language : 'vi';
  try {
    localStorage.setItem(CACHE_KEY, lang);
  } catch {
    // không lưu được thì lần mở sau dùng tiếng Việt cho tới khi tải xong cài đặt
  }
  if (lang === current && exact) return;
  const raw = (await LOADERS[lang]()).default;
  exact = parse(raw);
  patterns = buildPatterns(exact);
  current = lang;
  document.documentElement.lang = { vi: 'vi', en: 'en', zh: 'zh-Hans', ja: 'ja' }[lang];
  start();
  walk(document.documentElement);
}

/** Áp ngôn ngữ đã lưu trong trình duyệt ngay khi mở app, trước khi tải xong cài đặt. */
export function applyCachedUiLanguage() {
  let lang = 'vi';
  try {
    lang = localStorage.getItem(CACHE_KEY) || 'vi';
  } catch {
    lang = 'vi';
  }
  return setUiLanguage(lang);
}

export const currentUiLanguage = () => current;
