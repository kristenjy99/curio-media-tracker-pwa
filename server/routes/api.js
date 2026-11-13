import { Router } from 'express';
import { mountRouteTable } from '../http/expressAdapter.js';
import { createApiRouteTable } from './routeTable.js';

/**
 * Router Express cho API sách: chỉ là adapter: lấy bảng route khai báo rồi gắn vào Router.
 * Toàn bộ đường dẫn và handler nằm ở ./routeTable.js, dùng chung với bản PWA.
 */
export function createApiRouter(context) {
  return mountRouteTable(Router(), createApiRouteTable(context));
}
