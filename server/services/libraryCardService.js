import { NotFoundError, ValidationError } from '../utils/errors.js';
import { finishAfterStart } from '../validators/libraryCardValidators.js';

/** Lượt đã đọc xong: có ngày xong, hoặc chỉ biết năm đọc (không có ngày nào). */
export const isFinishedCard = (card) => Boolean(card.finish_date) || (Boolean(card.finish_year) && !card.start_date);

/** Lượt đọc rỗng: chưa có bất kỳ dữ liệu nào do người dùng nhập. */
const CARD_USER_FIELDS = ['start_date', 'finish_date', 'finish_year', 'rating', 'review_summary'];
export const isBlankCard = (card) => CARD_USER_FIELDS.every((field) => card?.[field] === null || card?.[field] === undefined);

/**
 * Quy tắc đồng bộ trạng thái item theo lượt đọc MỚI NHẤT:
 * - Lượt mới nhất chưa xong       -> item.status = 'Reading'; nếu là re-read vừa thêm thì reset current_unit = 0.
 * - Lượt mới nhất đã xong         -> item.status = 'Finished'; current_unit = total_units (nếu có).
 *   "Đã xong" gồm cả lượt chỉ biết năm (finish_year, không có ngày).
 * - Xoá lượt mới nhất             -> áp lại quy tắc trên với lượt đứng trước (không reset tiến độ).
 * Lượt cũ hơn được sửa/xoá thì không đụng tới trạng thái item.
 * Người dùng vẫn có thể PATCH item để ghi đè (ví dụ chuyển sang 'DNF').
 */
export function createLibraryCardService({ db, models }) {
  const { items, libraryCards } = models;

  async function requireItem(itemId) {
    const item = await items.findById(itemId);
    if (!item) throw new NotFoundError('Item', itemId);
    return item;
  }

  async function requireCard(cardId) {
    const card = await libraryCards.findById(cardId);
    if (!card) throw new NotFoundError('Library card', cardId);
    return card;
  }

  async function applyStatus(item, card, { resetProgress, keepDnf = false }) {
    // Sách bỏ dở được nhập ngày kết thúc thì vẫn là DNF (không tự chuyển thành Finished).
    if (keepDnf && item.status === 'DNF') return items.touch(item.id);
    if (isFinishedCard(card)) {
      return items.update(item.id, { status: 'Finished', current_unit: item.total_units ?? item.current_unit });
    }
    const patch = { status: 'Reading' };
    if (resetProgress) patch.current_unit = 0;
    return items.update(item.id, patch);
  }

  async function syncItemWithLatestCard(item, card, { isNewCard }) {
    const latest = await libraryCards.findLatestByItem(item.id);
    if (!latest || latest.id !== card.id) {
      await items.touch(item.id);
      return;
    }
    await applyStatus(item, card, { resetProgress: isNewCard && card.read_number > 1, keepDnf: !isNewCard });
  }

  /** Lượt có ngày cụ thể thì không giữ finish_year (năm lấy theo ngày), tránh hai nguồn năm mâu thuẫn. */
  function normalize(card) {
    if (card.start_date || card.finish_date) return { ...card, finish_year: null };
    return card;
  }

  return {
    async listByItem(itemId) {
      await requireItem(itemId);
      return libraryCards.listByItem(itemId);
    },

    /**
     * Tạo lượt đọc mới.
     *
     * Trường hợp riêng: sách được tạo với trạng thái Reading/Finished/DNF sẽ tự có một lượt đọc rỗng
     * (xem itemService.ensureReading). Khi người dùng nhập lượt đọc thật ngay sau đó, họ đang mô tả
     * chính lượt vừa được đánh dấu chứ không khai báo lượt thứ hai. Vì vậy nếu sách chỉ có đúng một
     * lượt và lượt đó rỗng, dữ liệu mới được điền vào lượt đó thay vì chèn lượt mới — nếu không,
     * lượt đọc thật đầu tiên sẽ mang read_number = 2 và bị thống kê đếm thành re-read.
     */
    create(itemId, data) {
      return db.transaction(async () => {
        const item = await requireItem(itemId);
        const existingCards = await libraryCards.listByItem(itemId);
        const reusable = existingCards.length === 1 && isBlankCard(existingCards[0]) ? existingCards[0] : null;
        const normalized = normalize(data);
        const card = reusable
          ? await libraryCards.update(reusable.id, {
              start_date: normalized.start_date ?? null,
              finish_date: normalized.finish_date ?? null,
              finish_year: normalized.finish_year ?? null,
              rating: normalized.rating ?? null,
              review_summary: normalized.review_summary ?? null,
            })
          : await libraryCards.create(itemId, normalized);
        await syncItemWithLatestCard(item, card, { isNewCard: true });
        return card;
      })();
    },

    update(cardId, patch) {
      return db.transaction(async () => {
        const existing = await requireCard(cardId);
        const merged = normalize({ ...existing, ...patch });
        if (!finishAfterStart(merged)) {
          throw new ValidationError('finish_date phải sau hoặc bằng start_date', [
            { path: ['finish_date'], message: 'finish_date < start_date' },
          ]);
        }
        const fullPatch = { ...patch, ...(merged.finish_year !== existing.finish_year ? { finish_year: merged.finish_year } : {}) };
        const card = await libraryCards.update(cardId, fullPatch);
        const finishChanged = ('finish_date' in patch && patch.finish_date !== existing.finish_date) || isFinishedCard(card) !== isFinishedCard(existing);
        if (finishChanged) {
          await syncItemWithLatestCard(await requireItem(card.item_id), card, { isNewCard: false });
        } else {
          await items.touch(card.item_id);
        }
        return card;
      })();
    },

    delete(cardId) {
      return db.transaction(async () => {
        const card = await requireCard(cardId);
        const wasLatest = (await libraryCards.findLatestByItem(card.item_id))?.id === card.id;
        await libraryCards.deleteAndRenumber(card);
        const nextLatest = wasLatest ? await libraryCards.findLatestByItem(card.item_id) : null;
        if (nextLatest) await applyStatus(await requireItem(card.item_id), nextLatest, { resetProgress: false });
        else await items.touch(card.item_id);
      })();
    },
  };
}
