/**
 * Scope bản trình duyệt cho lõi Db (xem ./async.js).
 *
 * Trình duyệt không có AsyncLocalStorage, nên ở đây dùng một biến đơn: đang-ở-trong-transaction
 * hay không. Biến đơn chỉ đúng khi tại mỗi thời điểm chỉ có MỘT request đang được xử lý — nếu hai
 * request chen nhau thì cả hai đều thấy "đang trong transaction" và câu ghi của request sau sẽ rơi
 * vào transaction của request trước, đúng loại lỗi mà Mutex được dựng để chặn.
 *
 * Điều kiện đó được bảo đảm ở lớp trên, không phải ở đây: worker API xếp hàng message và chỉ nhận
 * request kế tiếp sau khi request hiện tại đã trả lời xong (xem client/src/worker/apiWorker.js).
 * Vì vậy createSerialScope KHÔNG an toàn nếu đem dùng ở nơi gọi handler song song.
 */
export function createSerialScope() {
  let store = null;
  return {
    getStore: () => store,
    async run(next, fn) {
      const previous = store;
      store = next;
      try {
        return await fn();
      } finally {
        store = previous;
      }
    },
  };
}
