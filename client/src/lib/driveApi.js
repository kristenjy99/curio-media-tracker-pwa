import { DriveSyncError } from './driveErrors.js';

/**
 * Lớp gọi Google Drive API v3 bằng fetch, chỉ phần đồng bộ cần. Scope drive.file: app chỉ thấy file
 * do chính nó (cùng OAuth Client) tạo, nên truy vấn theo tên không đụng tới file khác của người dùng.
 * `fetchImpl` truyền vào được để test với fetch giả lập.
 */

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

const quote = (value) => `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

async function toDriveError(response) {
  let reason = '';
  let message = '';
  try {
    const payload = await response.json();
    reason = payload?.error?.errors?.[0]?.reason ?? payload?.error?.status ?? '';
    message = payload?.error?.message ?? '';
  } catch {
    // Không có JSON: dùng status.
  }
  if (response.status === 401) return new DriveSyncError('Phiên đăng nhập Google đã hết hạn. Bấm Đồng bộ lại để đăng nhập.', 'token_expired');
  if (response.status === 403 && /accessNotConfigured|SERVICE_DISABLED/i.test(`${reason} ${message}`)) {
    return new DriveSyncError('Google Drive API chưa được bật trong project Google Cloud. Bật "Google Drive API" rồi thử lại.', 'api_disabled');
  }
  if (response.status === 403 && /rateLimit|userRateLimit/i.test(reason)) {
    return new DriveSyncError('Google Drive đang giới hạn số lần gọi. Chờ một phút rồi đồng bộ lại.', 'rate_limited');
  }
  if (response.status === 403 && /storageQuota/i.test(reason)) return new DriveSyncError('Google Drive đã hết dung lượng.', 'quota');
  if (response.status === 404) return new DriveSyncError('Không tìm thấy file trên Drive (có thể đã bị xoá tay). Đồng bộ lại.', 'not_found');
  return new DriveSyncError(`Google Drive báo lỗi ${response.status}${message ? `: ${message}` : ''}.`, `http_${response.status}`);
}

export function createDriveClient(accessToken, fetchImpl = globalThis.fetch.bind(globalThis)) {
  async function call(url, init = {}) {
    let response;
    try {
      response = await fetchImpl(url, { ...init, headers: { Authorization: `Bearer ${accessToken}`, ...(init.headers ?? {}) } });
    } catch {
      throw new DriveSyncError('Không kết nối được Google Drive. Kiểm tra mạng rồi thử lại.', 'network');
    }
    if (!response.ok) throw await toDriveError(response);
    return response;
  }

  async function list(q, fields = 'files(id,name,modifiedTime,createdTime,size)') {
    const params = new URLSearchParams({ q, fields, orderBy: 'createdTime', pageSize: '10', spaces: 'drive' });
    const response = await call(`${API}/files?${params}`);
    return (await response.json()).files ?? [];
  }

  async function multipart(method, url, metadata, blob) {
    const boundary = `mt${Math.random().toString(36).slice(2)}`;
    const body = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
      `--${boundary}\r\nContent-Type: ${blob.type || 'application/octet-stream'}\r\n\r\n`,
      blob,
      `\r\n--${boundary}--`,
    ]);
    const response = await call(url, { method, headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body });
    return response.json();
  }

  return {
    /** Thư mục cũ nhất cùng tên (hai máy cùng tạo lần đầu thì vẫn chọn chung một thư mục). */
    async findFolder(name, parentId = null) {
      const parent = parentId ? ` and ${quote(parentId)} in parents` : '';
      return (await list(`name = ${quote(name)} and mimeType = '${FOLDER_MIME}' and trashed = false${parent}`))[0] ?? null;
    },
    async createFolder(name, parentId = null) {
      const response = await call(`${API}/files?fields=id,name,createdTime`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, mimeType: FOLDER_MIME, ...(parentId ? { parents: [parentId] } : {}) }),
      });
      return response.json();
    },
    async findFile(name, parentId) {
      return (await list(`name = ${quote(name)} and ${quote(parentId)} in parents and trashed = false`))[0] ?? null;
    },
    async getMeta(id) {
      return (await call(`${API}/files/${encodeURIComponent(id)}?fields=id,modifiedTime,size`)).json();
    },
    async downloadJson(id) {
      const response = await call(`${API}/files/${encodeURIComponent(id)}?alt=media`);
      try {
        return JSON.parse(await response.text());
      } catch {
        throw new DriveSyncError('File snapshot.json trên Drive bị hỏng. Dùng "Ghi đè Drive bằng dữ liệu máy này" để ghi lại.', 'snapshot_corrupt');
      }
    },
    async downloadBlob(id) {
      return (await call(`${API}/files/${encodeURIComponent(id)}?alt=media`)).blob();
    },
    async createFile(name, parentId, blob, appProperties) {
      return multipart('POST', `${UPLOAD}/files?uploadType=multipart&fields=id,size,modifiedTime`, { name, parents: [parentId], ...(appProperties ? { appProperties } : {}) }, blob);
    },
    async updateFile(id, blob) {
      return multipart('PATCH', `${UPLOAD}/files/${encodeURIComponent(id)}?uploadType=multipart&fields=id,size,modifiedTime`, {}, blob);
    },
  };
}
