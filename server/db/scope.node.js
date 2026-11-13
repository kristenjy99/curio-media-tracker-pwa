import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Scope bản Node cho lõi Db (xem ./async.js).
 *
 * Mục đích của scope: nhận biết "đoạn code đang chạy có nằm trong transaction do lớp Db mở hay không".
 * Trên Node, AsyncLocalStorage trả lời đúng câu đó theo từng ngữ cảnh async: chỉ code bên trong
 * callback của transaction thấy store, request khác chạy song song không thấy, nên nó vẫn phải xin
 * mutex và không chen vào transaction của người khác.
 *
 * File này import node:async_hooks nên KHÔNG được nằm trong đồ thị import của bản PWA.
 * Bản trình duyệt dùng ./scope.browser.js.
 */
export function createNodeScope() {
  const storage = new AsyncLocalStorage();
  return {
    getStore: () => storage.getStore(),
    run: (store, fn) => storage.run(store, fn),
  };
}
