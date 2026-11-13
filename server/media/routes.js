import express, { Router } from 'express';
import { mountRouteTable } from '../http/expressAdapter.js';
import { createMediaRouteTable } from './routeTable.js';

/**
 * Router Media, mount ở /api/media. Chỉ là adapter: lấy bảng route khai báo rồi gắn vào Router,
 * cộng thêm phần phục vụ file ảnh (việc của lớp vận chuyển, không phải của handler).
 */
export function createMediaRouter({ db, migration, storagePaths, fileStore, services = {} }) {
  const router = Router();

  // Ảnh bìa nằm trong <storage>/media/uploads, tên file có timestamp nên cache lâu được.
  if (storagePaths?.mediaUploadsDir) {
    router.use(
      '/files',
      express.static(storagePaths.mediaUploadsDir, {
        index: false,
        fallthrough: false,
        maxAge: '7d',
        immutable: true,
        setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff'),
      }),
    );
  }

  return mountRouteTable(router, createMediaRouteTable({ db, migration, storagePaths, fileStore, services }));
}
