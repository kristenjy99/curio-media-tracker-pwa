import { ZodError } from 'zod';
import { AppError } from '../utils/errors.js';

const SQLITE_ERROR_MAP = {
  SQLITE_CONSTRAINT_UNIQUE: { status: 409, code: 'CONFLICT', message: 'Dữ liệu bị trùng' },
  SQLITE_CONSTRAINT_PRIMARYKEY: { status: 409, code: 'CONFLICT', message: 'Dữ liệu bị trùng' },
  SQLITE_CONSTRAINT_CHECK: { status: 400, code: 'VALIDATION_ERROR', message: 'Dữ liệu vi phạm ràng buộc' },
  SQLITE_CONSTRAINT_NOTNULL: { status: 400, code: 'VALIDATION_ERROR', message: 'Thiếu trường bắt buộc' },
  SQLITE_CONSTRAINT_FOREIGNKEY: { status: 400, code: 'VALIDATION_ERROR', message: 'Tham chiếu không tồn tại' },
  SQLITE_BUSY: { status: 503, code: 'DATABASE_BUSY', message: 'Database đang bị khoá, thử lại sau' },
};

export function notFoundHandler(req, res) {
  res.status(404).json({ error: { code: 'ROUTE_NOT_FOUND', message: `${req.method} ${req.originalUrl} không tồn tại` } });
}

/**
 * Đổi một lỗi bất kỳ thành { status, body } của API. Tách riêng khỏi middleware Express để
 * bộ điều phối route của PWA (server/http/dispatch.js) trả về đúng cùng dạng lỗi.
 */
export function toErrorResponse(error) {
  if (error instanceof ZodError) {
    return {
      status: 400,
      body: {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Dữ liệu đầu vào không hợp lệ',
          details: error.issues.map((issue) => ({ path: issue.path, message: issue.message })),
        },
      },
    };
  }

  if (error instanceof AppError) {
    return {
      status: error.status,
      body: { error: { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) } },
    };
  }

  if (error?.type === 'entity.parse.failed') {
    return { status: 400, body: { error: { code: 'INVALID_JSON', message: 'Body không phải JSON hợp lệ' } } };
  }

  if (error?.type === 'entity.too.large') {
    return { status: 413, body: { error: { code: 'PAYLOAD_TOO_LARGE', message: 'Body vượt quá giới hạn cho phép' } } };
  }

  // Lỗi HTTP 4xx từ middleware (ví dụ express.static chặn đường dẫn ra ngoài thư mục).
  const httpStatus = error?.status ?? error?.statusCode;
  if (Number.isInteger(httpStatus) && httpStatus >= 400 && httpStatus < 500) {
    return { status: httpStatus, body: { error: { code: 'HTTP_ERROR', message: error.expose ? error.message : 'Yêu cầu không hợp lệ' } } };
  }

  const sqlite = error?.code ? SQLITE_ERROR_MAP[error.code] : undefined;
  if (sqlite) {
    return { status: sqlite.status, body: { error: { code: sqlite.code, message: sqlite.message, details: error.message } } };
  }

  console.error('[unhandled]', error);
  return { status: 500, body: { error: { code: 'INTERNAL_ERROR', message: 'Lỗi không xác định ở server' } } };
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(error, req, res, next) {
  const { status, body } = toErrorResponse(error);
  return res.status(status).json(body);
}
