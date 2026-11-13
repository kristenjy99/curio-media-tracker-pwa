import { DriveSyncError } from './driveErrors.js';
import { GOOGLE_CLIENT_ID, GOOGLE_DRIVE_SCOPE } from './googleConfig.js';

export { DriveSyncError };

/**
 * Đăng nhập Google bằng token model của Google Identity Services (GIS), dạng popup.
 *
 * - Không chuyển hướng cả trang: bản PWA chỉ giữ được DB ở một tab (opfs-sahpool), chuyển hướng hay
 *   mở tab mới đều có nguy cơ làm tab app mất khoá DB.
 * - Access token sống khoảng 1 giờ, chỉ giữ trong bộ nhớ của trang; không có refresh token, không có
 *   client secret. Hết hạn thì lần bấm sau hiện lại popup (sau lần đồng ý đầu tiên popup tự đóng).
 * - Trình duyệt chỉ cho mở popup trong chính sự kiện bấm nút, nên script GIS phải được nạp trước
 *   (`loadGoogleIdentity` khi mở hộp thoại) và `requestDriveToken` gọi popup ngay, không await gì trước.
 */

const GIS_SRC = 'https://accounts.google.com/gsi/client';

let loading = null;
let tokenClient = null;
let pending = null;
let token = null; // { access_token, expires_at }

export function loadGoogleIdentity() {
  if (globalThis.google?.accounts?.oauth2) return Promise.resolve();
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GIS_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      loading = null;
      script.remove();
      reject(new DriveSyncError('Không tải được thư viện đăng nhập Google. Kiểm tra kết nối mạng rồi thử lại.', 'gis_load'));
    };
    document.head.appendChild(script);
  });
  return loading;
}

export function isGoogleIdentityReady() {
  return Boolean(globalThis.google?.accounts?.oauth2);
}

function settle(error, value) {
  const current = pending;
  pending = null;
  if (!current) return;
  if (error) current.reject(error);
  else current.resolve(value);
}

function popupError(type) {
  if (type === 'popup_failed_to_open') {
    return new DriveSyncError('Trình duyệt chặn cửa sổ đăng nhập Google. Cho phép popup cho trang này rồi bấm lại.', 'popup_blocked');
  }
  if (type === 'popup_closed') {
    return new DriveSyncError(
      'Cửa sổ đăng nhập Google đã đóng trước khi xong. Nếu cửa sổ báo lỗi origin hoặc "access blocked", xem mục Gỡ rối trong hướng dẫn đồng bộ.',
      'popup_closed',
    );
  }
  return new DriveSyncError('Đăng nhập Google không thành công. Thử lại sau ít phút.', 'auth_unknown');
}

function client() {
  if (tokenClient) return tokenClient;
  tokenClient = globalThis.google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: GOOGLE_DRIVE_SCOPE,
    callback: (response) => {
      if (response.error) {
        const denied = response.error === 'access_denied';
        settle(
          new DriveSyncError(
            denied
              ? 'Bạn chưa cho phép app truy cập Google Drive. Bấm Đồng bộ lại và chọn Cho phép. Nếu Google báo app chưa được xác minh, Gmail của bạn phải nằm trong Test users của OAuth consent screen.'
              : `Google từ chối đăng nhập (${response.error}).`,
            response.error,
          ),
        );
        return;
      }
      if (!globalThis.google.accounts.oauth2.hasGrantedAllScopes(response, GOOGLE_DRIVE_SCOPE)) {
        settle(new DriveSyncError('Bạn chưa tích quyền "Xem, sửa, tạo và xoá các tệp Google Drive mà ứng dụng này dùng". Bấm Đồng bộ lại và tích quyền đó.', 'scope_missing'));
        return;
      }
      token = { access_token: response.access_token, expires_at: Date.now() + Number(response.expires_in ?? 3600) * 1000 };
      settle(null, token.access_token);
    },
    error_callback: (error) => settle(popupError(error?.type)),
  });
  return tokenClient;
}

/** Token còn hạn ít nhất 2 phút thì dùng lại, không mở popup. */
export function cachedDriveToken() {
  return token && token.expires_at - Date.now() > 120_000 ? token.access_token : null;
}

export function forgetDriveToken() {
  token = null;
}

/** Gọi trực tiếp trong sự kiện bấm nút. Trả Promise<access_token>. */
export function requestDriveToken() {
  const cached = cachedDriveToken();
  if (cached) return Promise.resolve(cached);
  if (!isGoogleIdentityReady()) {
    // Lần nạp trước có thể đã lỗi (mất mạng): thử nạp lại để lần bấm sau dùng được.
    loadGoogleIdentity().catch(() => {});
    return Promise.reject(new DriveSyncError('Thư viện đăng nhập Google chưa tải xong. Chờ vài giây rồi bấm lại.', 'gis_not_ready'));
  }
  if (pending) pending.reject(new DriveSyncError('Đã huỷ lần đăng nhập trước.', 'superseded'));
  const promise = new Promise((resolve, reject) => {
    pending = { resolve, reject };
  });
  client().requestAccessToken({ prompt: '' });
  return promise;
}
