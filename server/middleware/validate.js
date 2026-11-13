import { applyValidation } from '../http/validateInput.js';

/**
 * Parse req.params / req.query / req.body bằng zod và gắn kết quả vào req.valid.
 * Express 5 không cho ghi đè req.query nên dữ liệu đã chuẩn hoá được để riêng ở req.valid.
 * Phần parse thật nằm ở http/validateInput.js để bộ điều phối route của PWA dùng lại được.
 */
export function validate(schemas = {}) {
  return (req, res, next) => {
    try {
      req.valid = applyValidation(schemas, req);
      next();
    } catch (error) {
      next(error);
    }
  };
}
