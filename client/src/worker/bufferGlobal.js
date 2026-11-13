import { Buffer } from 'buffer';

/**
 * Tầng service dùng chung đọc/ghi dữ liệu nhị phân bằng `Buffer` toàn cục của Node: Buffer.isBuffer,
 * .subarray().toString('latin1'), .equals(), Buffer.alloc, png.readUInt32BE... Trình duyệt không có
 * Buffer, nên worker nạp bản polyfill vào globalThis trước khi import bất cứ thứ gì của server/.
 *
 * Phải import file này ĐẦU TIÊN trong worker: ESM đánh giá các module theo thứ tự import, và tuy
 * mọi chỗ dùng Buffer đều nằm trong thân hàm (không phải lúc nạp module), thứ tự này giữ cho điều đó
 * không phụ thuộc vào việc rà soát lại từng file sau này.
 */
if (!globalThis.Buffer) globalThis.Buffer = Buffer;

export { Buffer };
