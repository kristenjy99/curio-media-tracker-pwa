import express from 'express';
import { validate } from '../middleware/validate.js';

/**
 * Adapter Express cho bảng route khai báo: đọc bảng rồi gắn từng dòng vào một Router.
 * Express chỉ là lớp vận chuyển trên Node; bản PWA dùng server/http/dispatch.js với cùng bảng đó.
 *
 * Thứ tự các dòng trong bảng là thứ tự dò route, nên dòng cụ thể ("/items/facets") phải đứng
 * trước dòng có tham số ("/items/:id") — đúng như khi gọi router.get(...) lần lượt.
 *
 * Mỗi dòng: { method, path, handler, validate?, rawBody? }
 *  - validate: { params, query, body } là schema zod, kết quả gắn vào req.valid
 *  - rawBody: giới hạn kích thước ('15mb'); body đến ở dạng Buffer thay vì JSON
 */
export function mountRouteTable(router, table) {
  for (const route of table) {
    const chain = [];
    if (route.rawBody) chain.push(express.raw({ type: () => true, limit: route.rawBody }));
    if (route.validate) chain.push(validate(route.validate));
    const method = route.method.toLowerCase();
    if (typeof router[method] !== 'function') throw new Error(`Method ${route.method} không hỗ trợ (${route.path})`);
    router[method](route.path, ...chain, route.handler);
  }
  return router;
}
