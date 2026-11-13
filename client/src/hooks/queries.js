import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, categoryPath, toQuery } from '../lib/api.js';

export const useItems = (filters) =>
  useQuery({ queryKey: ['items', filters], queryFn: () => api.get(`/items${toQuery({ ...filters, limit: 5000 })}`), placeholderData: (previous) => previous });

export const useItem = (id) => useQuery({ queryKey: ['item', id], queryFn: () => api.get(`/items/${id}`), enabled: Boolean(id) });

export const useFacets = () => useQuery({ queryKey: ['facets'], queryFn: () => api.get('/items/facets') });

/** Pairing kèm số sách; có fandom thì chỉ tính sách có đủ các fandom đó. */
export const usePairings = (fandoms = []) =>
  useQuery({
    queryKey: ['facets', 'pairings', [...fandoms].map((entry) => entry.toLowerCase()).sort()],
    queryFn: () => api.get(`/items/pairings${toQuery({ fandom: fandoms })}`),
    placeholderData: (previous) => previous,
  });

/** Tag kèm số sách trong một thể loại chính; không có thể loại thì toàn thư viện. */
export const useTags = (category) =>
  useQuery({ queryKey: ['facets', 'tags', category ?? 'all'], queryFn: () => api.get(`/items/tags${toQuery({ category })}`), placeholderData: (previous) => previous });

/** { fandom: [pairing] } lấy từ các sách đã nhập. */
export const useFandomPairings = () => useQuery({ queryKey: ['facets', 'fandom-pairings'], queryFn: () => api.get('/items/fandom-pairings'), staleTime: 30_000 });

/** Gợi ý fandom (kho + sách) và pairing; đã chọn fandom thì chỉ còn pairing của các fandom đó. */
export function pairingOptions({ fandoms, library = [], bookMap = {}, allPairings = [], allFandoms = [] }) {
  const unique = (list) => list.filter((value, index) => list.findIndex((other) => other.toLowerCase() === value.toLowerCase()) === index);
  const fandomList = unique([...allFandoms, ...library.map((entry) => entry.fandom)]);
  if (!fandoms.length) return { fandoms: fandomList, pairings: unique([...allPairings, ...library.flatMap((entry) => entry.pairings)]), filtered: false };
  const wanted = new Set(fandoms.map((name) => name.toLowerCase()));
  const fromLibrary = library.filter((entry) => wanted.has(entry.fandom.toLowerCase())).flatMap((entry) => entry.pairings);
  const fromBooks = Object.entries(bookMap).filter(([name]) => wanted.has(name.toLowerCase())).flatMap(([, list]) => list);
  return { fandoms: fandomList, pairings: unique([...fromLibrary, ...fromBooks]), filtered: true };
}

export const useAuthors = () => useQuery({ queryKey: ['series', 'authors'], queryFn: () => api.get('/authors') });

export const useSeries = () => useQuery({ queryKey: ['series'], queryFn: () => api.get('/series') });

export const useTemplates = () => useQuery({ queryKey: ['templates'], queryFn: () => api.get('/templates'), staleTime: 60_000 });

export const useSyncConfig = () => useQuery({ queryKey: ['sync-config'], queryFn: () => api.get('/sync-config') });

export const useSyncStatus = () => useQuery({ queryKey: ['sync-status'], queryFn: () => api.get('/sync/status') });

export const useObsidianVaults = () => useQuery({ queryKey: ['obsidian-vaults'], queryFn: () => api.get('/obsidian/vaults') });

export const useDashboard = (year) =>
  useQuery({ queryKey: ['dashboard', year ?? 'current'], queryFn: () => api.get(`/dashboard${toQuery({ year })}`), placeholderData: (previous) => previous });

export const useSettings = () => useQuery({ queryKey: ['settings'], queryFn: () => api.get('/settings'), staleTime: 60_000 });

export const useStorage = () => useQuery({ queryKey: ['storage'], queryFn: () => api.get('/storage') });

/** Sau mọi thay đổi dữ liệu sách: làm mới danh sách, bộ lọc và trạng thái sync. */
export function useInvalidateLibrary() {
  const client = useQueryClient();
  return () => {
    client.invalidateQueries({ queryKey: ['items'] });
    client.invalidateQueries({ queryKey: ['item'] });
    client.invalidateQueries({ queryKey: ['facets'] });
    client.invalidateQueries({ queryKey: ['series'] });
    client.invalidateQueries({ queryKey: ['sync-status'] });
    client.invalidateQueries({ queryKey: ['dashboard'] });
    client.invalidateQueries({ queryKey: ['readings'] });
    client.invalidateQueries({ queryKey: ['goals'] });
    client.invalidateQueries({ queryKey: ['fun'] });
  };
}

export function useSaveTemplate() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ category, template }) => api.put(`/templates/${categoryPath(category)}`, template),
    onSuccess: () => client.invalidateQueries({ queryKey: ['templates'] }),
  });
}

export const useNote = (itemId) =>
  useQuery({ queryKey: ['note', itemId], queryFn: () => api.get(`/items/${itemId}/note`), enabled: Boolean(itemId) });

export const useReadingLogs = (itemId) =>
  useQuery({
    queryKey: ['reading-logs', itemId],
    queryFn: () => api.get(`/reading-logs${toQuery({ item_id: itemId, limit: 5000 })}`),
    enabled: Boolean(itemId),
  });

/**
 * Lưu một phần note (chỉ các trường gửi lên). Cache được cập nhật ngay bằng kết quả server trả về,
 * nên các phần khác của tab Note không bị tải lại.
 */
export function useSaveNote(itemId) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (patch) => api.put(`/items/${itemId}/note`, patch),
    onSuccess: (note) => {
      client.setQueryData(['note', itemId], note);
      client.invalidateQueries({ queryKey: ['sync-status'] });
    },
  });
}

export const useReadings = (year) => useQuery({ queryKey: ['readings', year ?? 'current'], queryFn: () => api.get(`/readings${toQuery({ year })}`), placeholderData: (previous) => previous });
export const useGoals = (year) => useQuery({ queryKey: ['goals', year], queryFn: () => api.get(`/goals${toQuery({ year })}`) });
export const useChallenges = () => useQuery({ queryKey: ['fun', 'challenges'], queryFn: () => api.get('/challenges') });
export const useFavorites = (year) => useQuery({ queryKey: ['fun', 'favorites', year], queryFn: () => api.get(`/favorites/${year}`) });
export const useBrackets = (year) => useQuery({ queryKey: ['fun', 'brackets', year], queryFn: () => api.get(`/brackets${toQuery({ year })}`) });
export const useBracketCandidates = (year) => useQuery({ queryKey: ['fun', 'candidates', year], queryFn: () => api.get(`/brackets/candidates/${year}`) });

/** Gọi API ghi dữ liệu rồi làm mới các nhóm cache nêu tên: mutate({ method: 'put', path, body }). */
export function useMutate(keys = []) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ method, path, body }) => api[method](path, body),
    onSuccess: () => keys.forEach((key) => client.invalidateQueries({ queryKey: [key] })),
  });
}
