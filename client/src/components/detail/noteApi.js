import { createContext, useContext } from 'react';
import { uploadNoteFile } from '../../lib/images.js';

/**
 * Hàm tải file cho note (ảnh moodboard, nhân vật, ảnh chèn, file đính kèm). Mặc định là note của sách;
 * trang chi tiết media bọc NoteTab trong provider với hàm tải lên API media.
 */
export const NoteUploadContext = createContext(uploadNoteFile);
export const useNoteUpload = () => useContext(NoteUploadContext);
