import { api, IS_PWA, requestFile, sendBinary } from './api.js';
import { createDriveClient } from './driveApi.js';
import { DriveSyncError } from './driveErrors.js';
import { forgetDriveToken } from './googleAuth.js';

/**
 * Một lượt đồng bộ Google Drive, chạy trong trình duyệt ở cả bản Windows lẫn bản Android.
 *
 * Trên Drive (thư mục "Media Tracker Sync" ở gốc My Drive):
 *   snapshot.json  — toàn bộ đơn vị dữ liệu (sách, media, challenge, cài đặt...), dấu xoá và bảng
 *                    khoá file -> id file Drive. Định dạng do server/services/driveSync tạo.
 *   files/         — mỗi ảnh/file đính kèm là một file Drive, tên là khoá store
 *                    (books/items/<uid>/cover-<mốc>.webp, media/items/...). Tên có mốc thời gian nên
 *                    một khoá không bao giờ đổi nội dung: chỉ đẩy khoá mới, chỉ tải khoá còn thiếu.
 *
 * Thứ tự: tải snapshot -> server gộp và áp vào DB -> tải ảnh thiếu -> đẩy ảnh mới -> kiểm tra không
 * có máy khác ghi xen vào -> ghi snapshot -> lưu base. Hỏng ở bước nào trước khi lưu base thì lần
 * bấm sau làm lại, không mất dữ liệu.
 */

export const SYNC_FOLDER = 'Media Tracker Sync';
const SNAPSHOT_NAME = 'snapshot.json';
const FILES_FOLDER = 'files';

const fileQuery = (key) => `/drive-sync/file?key=${encodeURIComponent(key)}`;

export async function runDriveSync({ accessToken, mode = 'merge', onProgress = () => {}, fetchImpl }) {
  if (globalThis.navigator?.onLine === false) throw new DriveSyncError('Máy đang không có mạng. Bật mạng rồi đồng bộ lại.', 'offline');
  const drive = createDriveClient(accessToken, fetchImpl);
  try {
    onProgress('Tìm thư mục đồng bộ trên Drive');
    const folder = (await drive.findFolder(SYNC_FOLDER)) ?? (await drive.createFolder(SYNC_FOLDER));
    const snapshotFile = await drive.findFile(SNAPSHOT_NAME, folder.id);
    onProgress('Tải dữ liệu từ Drive');
    const remote = snapshotFile ? await drive.downloadJson(snapshotFile.id) : null;

    onProgress(mode === 'push' ? 'Chuẩn bị ghi đè Drive' : 'Gộp dữ liệu trên máy này');
    const applied = await api.post('/drive-sync/apply', { remote, mode, device: IS_PWA ? 'android' : 'windows' });
    const { snapshot, files } = applied;

    let downloaded = 0;
    for (const { key, id } of files.download) {
      onProgress(`Tải ảnh/file về (${downloaded + 1}/${files.download.length})`);
      try {
        const blob = await drive.downloadBlob(id);
        await sendBinary('PUT', fileQuery(key), blob);
        downloaded += 1;
      } catch (error) {
        // File bị xoá tay trên Drive: bỏ qua, lần đồng bộ sau thử lại; không làm hỏng cả lượt.
        if (error?.code !== 'not_found') throw error;
      }
    }

    let uploaded = 0;
    if (files.upload.length) {
      const filesFolder = (await drive.findFolder(FILES_FOLDER, folder.id)) ?? (await drive.createFolder(FILES_FOLDER, folder.id));
      for (const { key } of files.upload) {
        onProgress(`Đẩy ảnh/file lên (${uploaded + 1}/${files.upload.length})`);
        const { blob } = await requestFile('GET', fileQuery(key));
        const created = await drive.createFile(key, filesFolder.id, blob, { key });
        snapshot.files[key] = { id: created.id, size: Number(created.size ?? blob.size) };
        uploaded += 1;
      }
    }

    onProgress('Ghi dữ liệu lên Drive');
    // Máy khác ghi snapshot trong lúc máy này đang gộp: dừng lại, lần bấm sau sẽ gộp cả phần đó.
    if (snapshotFile) {
      const now = await drive.getMeta(snapshotFile.id);
      if (now.modifiedTime !== snapshotFile.modifiedTime) throw new DriveSyncError('Máy khác vừa đồng bộ trong lúc máy này đang chạy. Bấm Đồng bộ lại.', 'concurrent');
    } else if (await drive.findFile(SNAPSHOT_NAME, folder.id)) {
      throw new DriveSyncError('Máy khác vừa đồng bộ lần đầu trong lúc máy này đang chạy. Bấm Đồng bộ lại.', 'concurrent');
    }
    const blob = new Blob([JSON.stringify(snapshot)], { type: 'application/json' });
    if (snapshotFile) await drive.updateFile(snapshotFile.id, blob);
    else await drive.createFile(SNAPSHOT_NAME, folder.id, blob);

    const base = Object.fromEntries(Object.entries(snapshot.units).map(([key, unit]) => [key, unit.hash]));
    await api.post('/drive-sync/commit', { base });
    return { stats: applied.stats, conflicts: applied.conflicts, backup: applied.backup, files: { downloaded, uploaded }, snapshotBytes: blob.size };
  } catch (error) {
    if (error?.code === 'token_expired') forgetDriveToken();
    throw error;
  }
}
