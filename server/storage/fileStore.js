/**
 * FileStore: trừu tượng hoá thao tác đọc/ghi file người dùng tải lên (ảnh bìa, ảnh gáy,
 * ảnh trong note, file đính kèm).
 *
 * Mọi đường dẫn truyền vào là đường dẫn TƯƠNG ĐỐI theo gốc của store, dùng dấu "/" (kiểu URL),
 * không phụ thuộc hệ điều hành. Bản Node quy chiếu về <storage>/uploads; bản PWA (Phiên 3) sẽ
 * lưu cùng những đường dẫn đó trong IndexedDB/OPFS mà không cần sửa tầng service.
 *
 * Interface (tất cả trả về Promise):
 *   write(relPath, buffer)   -> ghi file, tự tạo thư mục cha
 *   read(relPath)            -> Buffer, hoặc null nếu không có
 *   exists(relPath)          -> boolean
 *   remove(relPath)          -> xoá một file (không có cũng không báo lỗi)
 *   removeDir(relPath)       -> xoá cả thư mục
 *   resolve(relPath)         -> đường dẫn tuyệt đối trên đĩa, hoặc null nếu vượt ra ngoài gốc
 *                               (bản PWA trả về null vì không có đường dẫn đĩa)
 */

export const FILE_STORE_METHODS = ['write', 'read', 'exists', 'remove', 'removeDir', 'resolve'];

/** Ghép các đoạn thành đường dẫn tương đối kiểu URL, bỏ đoạn rỗng. */
export function joinStorePath(...segments) {
  return segments
    .flatMap((segment) => String(segment ?? '').split('/'))
    .filter((segment) => segment !== '' && segment !== '.')
    .join('/');
}

/** Kiểm tra interface đủ phương thức; dùng khi lắp store của nền tảng khác. */
export function assertFileStore(store) {
  const missing = FILE_STORE_METHODS.filter((method) => typeof store?.[method] !== 'function');
  if (missing.length) throw new Error(`FileStore thiếu phương thức: ${missing.join(', ')}`);
  return store;
}
