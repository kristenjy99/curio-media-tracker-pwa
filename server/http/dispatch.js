import { toErrorResponse } from '../middleware/errorHandler.js';
import { applyValidation } from './validateInput.js';

/**
 * Bộ điều phối route không phụ thuộc Express.
 *
 * Trên Windows, Express nhận request rồi gọi handler (xem ./expressAdapter.js). Trên PWA không có
 * server nào cả: client gọi `dispatch({ method, path, body })` ngay trong trình duyệt và nhận lại
 * `{ status, headers, body }`. Cùng một bảng route, cùng một handler, chỉ khác lớp vận chuyển.
 *
 * Handler giữ nguyên dạng `(req, res)` như khi chạy trên Express. Ở đây `res` là một đối tượng nhỏ
 * chỉ thu lại kết quả (status, headers, body) chứ không gửi gì đi; `req` là object thuần.
 * Nhờ vậy không phải viết lại toàn bộ controller khi thêm nền tảng mới.
 */

/** Đổi "/items/:id/images/:kind" thành bộ so khớp; giữ nguyên thứ tự khai báo khi dò. */
function compile(route) {
  const names = [];
  const pattern = route.path
    .split('/')
    .map((segment) => {
      if (!segment.startsWith(':')) return escapeRegExp(segment);
      names.push(segment.slice(1));
      return '([^/]+)';
    })
    .join('/');
  return { ...route, names, regex: new RegExp(`^${pattern}/?$`), upperMethod: route.method.toUpperCase() };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** `res` tối giản: chỉ ghi nhận kết quả, đủ cho mọi controller hiện có. */
function createCollector() {
  const state = { status: 200, headers: {}, body: undefined, ended: false };
  const res = {
    status(code) {
      state.status = code;
      return res;
    },
    type(value) {
      state.headers['Content-Type'] = value;
      return res;
    },
    location(value) {
      state.headers.Location = value;
      return res;
    },
    set(name, value) {
      state.headers[name] = value;
      return res;
    },
    setHeader(name, value) {
      state.headers[name] = value;
      return res;
    },
    json(value) {
      state.headers['Content-Type'] ??= 'application/json; charset=utf-8';
      state.body = value;
      state.ended = true;
      return res;
    },
    send(value) {
      state.body = value;
      state.ended = true;
      return res;
    },
    end() {
      state.ended = true;
      return res;
    },
  };
  return { res, state };
}

/**
 * Tách URL thành { path, query } theo đúng cách Express đọc query ở chế độ "simple":
 * giá trị là chuỗi, key xuất hiện nhiều lần thành mảng.
 */
export function parseRequestUrl(url) {
  const [rawPath, rawQuery = ''] = String(url).split('?');
  const query = {};
  for (const [key, value] of new URLSearchParams(rawQuery)) {
    if (key in query) query[key] = Array.isArray(query[key]) ? [...query[key], value] : [query[key], value];
    else query[key] = value;
  }
  return { path: rawPath || '/', query };
}

export function createDispatcher(table) {
  const routes = table.map(compile);

  /**
   * Gọi một route. `path` là đường dẫn trong bảng (đã bỏ tiền tố /api), `query` là object đã parse
   * (hoặc dùng parseRequestUrl ở trên). Không bao giờ ném lỗi: lỗi của handler được đổi thành
   * response lỗi giống hệt khi chạy qua Express.
   */
  return async function dispatch({ method, path, query = {}, body, headers = {} } = {}) {
    const upperMethod = String(method ?? 'GET').toUpperCase();
    const { path: cleanPath } = parseRequestUrl(path ?? '/');

    let matchedPath = false;
    for (const route of routes) {
      const match = route.regex.exec(cleanPath);
      if (!match) continue;
      matchedPath = true;
      if (route.upperMethod !== upperMethod) continue;

      const params = {};
      route.names.forEach((name, index) => {
        params[name] = safeDecode(match[index + 1]);
      });

      const req = { method: upperMethod, path: cleanPath, originalUrl: cleanPath, params, query, body, headers };
      const { res, state } = createCollector();
      try {
        if (route.validate) req.valid = applyValidation(route.validate, req);
        await route.handler(req, res);
      } catch (error) {
        const failure = toErrorResponse(error);
        return { status: failure.status, headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: failure.body };
      }
      return { status: state.status, headers: state.headers, body: state.body };
    }

    return {
      status: matchedPath ? 405 : 404,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: {
        error: matchedPath
          ? { code: 'METHOD_NOT_ALLOWED', message: `${upperMethod} ${cleanPath} không được hỗ trợ` }
          : { code: 'ROUTE_NOT_FOUND', message: `${upperMethod} ${cleanPath} không tồn tại` },
      },
    };
  };
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
