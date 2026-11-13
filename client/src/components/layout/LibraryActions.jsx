import { createContext, useContext } from 'react';

/**
 * Mở các hộp thoại dùng chung (thêm/sửa sách, import, sync) từ bất kỳ đâu trong app.
 * openEditBook(id, { onDeleted }) : onDeleted chạy sau khi xoá sách (trang chi tiết dùng để quay về kệ).
 */
export const LibraryActionsContext = createContext({
  openNewBook: () => {},
  openEditBook: () => {},
  openImport: () => {},
  openSync: () => {},
});

export const useLibraryActions = () => useContext(LibraryActionsContext);
