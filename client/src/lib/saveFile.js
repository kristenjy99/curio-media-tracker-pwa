/**
 * Lưu một file do app tạo ra, để người dùng tự chọn nơi lưu.
 *
 * Trình duyệt có hai mức khả năng và không thể làm hơn:
 *  - Có File System Access API (Chrome/Edge trên máy tính): `showSaveFilePicker` mở hộp thoại chọn
 *    thư mục và tên file, ghi thẳng vào chỗ người dùng chọn.
 *  - Không có (Chrome trên Android, Safari, Firefox): chỉ tải xuống được. File về thư mục Tải xuống;
 *    muốn chọn chỗ khác thì bật "Hỏi nơi lưu mỗi file" trong cài đặt trình duyệt, hoặc di chuyển file
 *    sau. Đây là giới hạn của trình duyệt, không phải của app.
 *
 * Trả về { saved, picked }: `picked` = true khi người dùng được chọn nơi lưu, false khi chỉ tải xuống;
 * `saved` = false khi người dùng bấm huỷ.
 */
export async function saveBlobAs(blob, filename) {
  if (typeof window.showSaveFilePicker === 'function') {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [{ description: 'File SQLite', accept: { 'application/octet-stream': ['.sqlite'] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return { saved: true, picked: true };
    } catch (error) {
      if (error?.name === 'AbortError') return { saved: false, picked: true };
      // Quyền bị chặn hoặc lỗi khác: rơi xuống cách tải xuống bên dưới thay vì báo thất bại.
    }
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  // Thu hồi sau một nhịp để trình duyệt kịp bắt đầu tải.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return { saved: true, picked: false };
}

export const canPickSaveLocation = () => typeof window.showSaveFilePicker === 'function';
