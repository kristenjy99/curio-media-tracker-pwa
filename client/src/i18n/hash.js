/** Mã ổn định cho một chuỗi nguồn (FNV-1a 32 bit, base36); file dịch dùng mã này thay cho chỉ số. */
export function textId(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}
