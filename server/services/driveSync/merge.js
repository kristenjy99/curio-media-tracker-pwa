/**
 * Quyết định gộp cho từng đơn vị, hàm thuần (không đụng DB) để test được trực tiếp.
 *
 * Gộp ba chiều: ngoài bản cục bộ (L) và bản trên Drive (R), mỗi máy giữ `base` — hash của từng đơn
 * vị ở lần đồng bộ thành công gần nhất. Nhờ base mới biết bên nào đã đổi kể từ lần trước:
 *  - L và R giống nhau: bỏ qua.
 *  - Chỉ một bên khác base: lấy bên đó.
 *  - Cả hai khác base (sửa ở hai nơi): bên có updated_at mới hơn thắng nguyên khối (quy tắc A).
 *  - Một bên đã xoá, bên kia không sửa gì kể từ base: xoá theo. Bên kia có sửa: so updated_at với
 *    thời điểm xoá. Đây là chỗ giữ cho thứ đã xoá không sống lại.
 *
 * Mốc của bản cục bộ còn tính cả thời điểm xoá những dòng con mà bản bên kia vẫn còn: xoá một log
 * không đổi updated_at của sách, nhưng vẫn là một lần sửa.
 *
 * mode 'push' (Ghi đè Drive bằng máy này): không lấy gì về, đơn vị chỉ có trên Drive bị đánh dấu xoá.
 */
export function planMerge({ local, remote, base = {}, localDeletions, mode = 'merge', now = new Date().toISOString() }) {
  const remoteUnits = remote?.units ?? {};
  const remoteDeletions = remote?.deletions ?? {};
  const pulls = [];
  const deletes = [];
  const conflicts = [];
  const stats = { pushed: 0, pulled: 0, deleted_local: 0, deleted_remote: 0, unchanged: 0 };
  const pushDeletions = {};

  const localTime = (unit, remoteUnit) => {
    let time = unit.updated_at ?? '';
    for (const uid of remoteUnit?.children ?? []) {
      const at = localDeletions.children.get(uid);
      if (at && at > time) time = at;
    }
    return time;
  };
  const conflict = (key, title, winner, reason) => conflicts.push({ key, title, winner, reason });

  const keys = new Set([...local.keys(), ...Object.keys(remoteUnits), ...localDeletions.units.keys(), ...Object.keys(remoteDeletions)]);
  for (const key of [...keys].sort()) {
    const l = local.get(key);
    const r = remoteUnits[key];
    const b = base[key];

    if (mode === 'push') {
      if (l) stats[r && r.hash === l.hash ? 'unchanged' : 'pushed'] += 1;
      else if (r) {
        pushDeletions[key] = now;
        stats.deleted_remote += 1;
      }
      continue;
    }

    if (l && r) {
      if (l.hash === r.hash) stats.unchanged += 1;
      else if (r.hash === b) stats.pushed += 1;
      else if (l.hash === b) {
        pulls.push(key);
        stats.pulled += 1;
      } else {
        const remoteWins = (r.updated_at ?? '') > localTime(l, r);
        conflict(key, l.title ?? r.title, remoteWins ? 'drive' : 'local', 'sửa ở cả hai nơi');
        if (remoteWins) {
          pulls.push(key);
          stats.pulled += 1;
        } else stats.pushed += 1;
      }
    } else if (l) {
      const deletedAt = remoteDeletions[key];
      if (!deletedAt) stats.pushed += 1;
      else if (l.hash === b || deletedAt > localTime(l, null)) {
        if (l.hash !== b) conflict(key, l.title, 'drive', 'đã xoá ở máy kia sau khi máy này sửa');
        deletes.push(key);
        stats.deleted_local += 1;
      } else {
        conflict(key, l.title, 'local', 'máy này sửa sau khi máy kia xoá');
        stats.pushed += 1;
      }
    } else if (r) {
      const deletedAt = localDeletions.units.get(key);
      if (!deletedAt) {
        pulls.push(key);
        stats.pulled += 1;
      } else if (r.hash === b || deletedAt > (r.updated_at ?? '')) {
        if (r.hash !== b) conflict(key, r.title, 'local', 'máy này xoá sau khi máy kia sửa');
        stats.deleted_remote += 1;
      } else {
        conflict(key, r.title, 'drive', 'máy kia sửa sau khi máy này xoá');
        pulls.push(key);
        stats.pulled += 1;
      }
    }
  }
  return { pulls, deletes, conflicts, stats, pushDeletions };
}

/**
 * Dấu xoá ghi lên Drive: hợp của dấu đã có trên Drive và dấu cục bộ, bỏ những khoá hiện vẫn còn
 * đơn vị (đơn vị đã "sống lại" hợp lệ vì bị sửa sau khi xoá).
 */
export function mergeDeletions({ remote, localDeletions, finalKeys, extra = {} }) {
  const result = {};
  const keep = (key, at) => {
    if (finalKeys.has(key)) return;
    if (!result[key] || result[key] < at) result[key] = at;
  };
  for (const [key, at] of Object.entries(remote?.deletions ?? {})) keep(key, at);
  for (const [key, at] of localDeletions.units) keep(key, at);
  for (const [key, at] of Object.entries(extra)) keep(key, at);
  return result;
}
