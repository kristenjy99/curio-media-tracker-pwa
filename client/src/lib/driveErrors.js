/** Lỗi của luồng đồng bộ Drive, message đã viết sẵn cho người dùng. File không import gì để test chạy được trên Node. */
export class DriveSyncError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'DriveSyncError';
    this.code = code;
  }
}
