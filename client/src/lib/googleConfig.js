import { BASE_URL } from './api.js';

/**
 * Cấu hình OAuth Google cho đồng bộ Drive (Phiên 5).
 *
 * Client ID được đưa vào lúc build qua biến môi trường VITE_GOOGLE_CLIENT_ID (trên GitHub Actions là
 * repository variable cùng tên). App chạy trong trình duyệt nên KHÔNG có client secret; Client ID là
 * thông tin công khai, việc chặn lạm dụng do danh sách "Authorized JavaScript origins" bên Google lo.
 */
// Giá trị mặc định là Client ID của project media-tracker (công khai, không có secret), để bản Windows
// đăng nhập được mà không cần .env; đặt VITE_GOOGLE_CLIENT_ID thì giá trị đó được dùng thay.
const DEFAULT_CLIENT_ID = '720355510510-s8n7r9aqute0s7vqtipbpbmgo1vvregi.apps.googleusercontent.com';

export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || DEFAULT_CLIENT_ID;

/** drive.file: app chỉ thấy file do chính nó tạo, không đọc được phần còn lại của Drive. */
export const GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

export function isGoogleConfigured() {
  return GOOGLE_CLIENT_ID.length > 0;
}

/** Địa chỉ gốc của app, ví dụ https://<user>.github.io/<repo>/ — dùng làm redirect URI. */
export function googleRedirectUri() {
  return new URL(BASE_URL, globalThis.location?.origin ?? 'http://localhost').href;
}
