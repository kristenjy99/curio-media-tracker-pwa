import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express from 'express';
import { env } from './config/env.js';
import { closeDatabase, openDatabase } from './db/connection.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { hostGuard } from './middleware/hostGuard.js';
import { createModels } from './models/index.js';
import { createApiRouter } from './routes/api.js';
import { createServices } from './services/index.js';
import { createObsidianSyncService } from './services/obsidian/obsidianSyncService.js';
import { createStorageService } from './services/storageService.js';
import { createNodeFileStore } from './storage/nodeFileStore.js';
import { createDesktopAdapter } from './services/desktopShortcut.js';
import { createMediaRouter } from './media/routes.js';
import { openMediaDatabase } from './media/db/connection.js';

/**
 * Tạo Express app từ một kết nối DB đã mở. Router được bọc trong một "runtime" có thể hoán đổi,
 * nên khi người dùng đổi thư mục lưu trữ, app mở DB mới và chuyển sang ngay mà không cần restart server.
 */
// File đính kèm do người dùng tải lên có thể là HTML/SVG; chỉ ảnh raster, âm thanh, video và PDF được mở
// trong trình duyệt, còn lại luôn tải xuống để không chạy được script trên origin của app.
const INLINE_MEDIA = /\.(jpe?g|png|gif|webp|avif|mp3|m4a|ogg|wav|mp4|webm|pdf)$/i;

function setMediaHeaders(res, filePath) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (!INLINE_MEDIA.test(filePath)) {
    res.setHeader('Content-Disposition', 'attachment');
    res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'");
  }
}

const DEFAULT_CLIENT_DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'client', 'dist');

export function createApp({
  db,
  clientDist = DEFAULT_CLIENT_DIST,
  storagePaths = null,
  clientOrigins = env.clientOrigins,
  allowedHosts,
  writeConfig,
  isEnvLocked,
}) {
  const startedAt = Date.now();
  let current;

  function buildContext(contextDb, paths) {
    const models = createModels(contextDb);
    // FileStore: bản Node ghi vào <storage>/uploads. Không có thư mục lưu trữ (test) thì để null,
    // service tự báo lỗi "chưa có thư mục lưu trữ" khi có ai gọi tới.
    const fileStore = paths?.uploadsDir ? createNodeFileStore(paths.uploadsDir) : null;
    const mediaFileStore = paths?.mediaUploadsDir ? createNodeFileStore(paths.mediaUploadsDir) : null;
    // desktop: phần biểu tượng .ico và lối tắt Desktop, chỉ có trên Windows (bản PWA truyền null).
    const context = { db: contextDb, models, storagePaths: paths, fileStore, mediaFileStore, desktop: createDesktopAdapter(), startedAt };
    // Bản chụp JSON trước mỗi lần đồng bộ Drive (để khôi phục trong app), nằm ngoài uploads nên không bị phục vụ qua /media.
    context.syncBackupStore = paths?.root ? createNodeFileStore(path.join(paths.root, 'backups', 'dong-bo-json')) : null;
    context.services = createServices(context);
    context.services.obsidianSync = createObsidianSyncService(context);
    context.services.storage = createStorageService({
      getDb: () => contextDb,
      storagePaths: paths,
      switchStorage,
      writeConfig,
      isEnvLocked,
    });
    context.router = createApiRouter(context);
    // Media: DB và router riêng, không dùng chung bảng hay model với sách.
    const media = openMediaDatabase(paths?.mediaDbFile ?? ':memory:');
    context.mediaDb = media.db;
    context.mediaMigration = media.migration;
    context.mediaServices = {};
    context.mediaRouter = createMediaRouter({
      db: media.db,
      migration: media.migration,
      storagePaths: paths,
      fileStore: mediaFileStore,
      services: context.mediaServices,
    });
    return context;
  }

  function switchStorage(nextPaths) {
    const { db: nextDb, migration } = openDatabase(nextPaths.dbFile);
    const previous = current;
    current = buildContext(nextDb, nextPaths);
    // Lõi Db tuần tự hoá mọi truy vấn qua Mutex, nên tại thời điểm này không còn query dở dang trên DB cũ.
    closeDatabase(previous.db);
    closeDatabase(previous.mediaDb);
    return migration;
  }

  current = buildContext(db, storagePaths);

  const app = express();
  app.disable('x-powered-by');
  app.set('query parser', 'simple');

  app.use(hostGuard(allowedHosts));
  app.use(
    cors({
      origin(origin, callback) {
        // Request không có Origin (curl, cùng origin) luôn được phép; còn lại phải nằm trong whitelist.
        if (!origin || clientOrigins.includes(origin)) return callback(null, true);
        return callback(null, false);
      },
    }),
  );
  // File CSV/JSON import gửi qua body JSON nên giới hạn rộng hơn mặc định.
  app.use(express.json({ limit: '25mb' }));

  // Ảnh bìa/gáy tải lên nằm trong thư mục lưu trữ hiện tại (đổi theo khi người dùng đổi thư mục).
  const mediaHandlers = new Map();
  app.use('/media', (req, res, next) => {
    const root = current.storagePaths?.uploadsDir;
    // /media, /media/stats, /media/<id> là trang giao diện (SPA); mọi đường dẫn khác dưới /media là file tải lên.
    if (!root || /^\/(stats|\d+)?\/?$/.test(req.path)) return next();
    if (!mediaHandlers.has(root)) {
      mediaHandlers.set(
        root,
        express.static(root, { index: false, fallthrough: false, maxAge: '7d', immutable: true, setHeaders: setMediaHeaders }),
      );
    }
    return mediaHandlers.get(root)(req, res, next);
  });

  app.use('/api/media', (req, res, next) => current.mediaRouter(req, res, next));
  app.use('/api', (req, res, next) => current.router(req, res, next));
  app.use('/api', notFoundHandler);

  // Giao diện đã build (npm run build) được phục vụ cùng cổng với API; mọi route khác trả index.html (SPA).
  if (fs.existsSync(path.join(clientDist, 'index.html'))) {
    app.use(express.static(clientDist, { index: false, maxAge: '1h' }));
    app.use((req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      res.set('Cache-Control', 'no-cache');
      return res.sendFile(path.join(clientDist, 'index.html'));
    });
  }
  app.use(errorHandler);

  return {
    app,
    get context() {
      return current;
    },
    close() {
      closeDatabase(current.db);
      closeDatabase(current.mediaDb);
    },
  };
}
