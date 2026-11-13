import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, sendBinary, toQuery } from '../lib/api.js';
import { isLocalImage } from '../lib/images.js';

export const useMediaItems = (filters) =>
  useQuery({ queryKey: ['media', 'items', filters], queryFn: () => api.get(`/media/items${toQuery(filters)}`), placeholderData: (previous) => previous });

export const useMediaStats = (year) =>
  useQuery({ queryKey: ['media', 'stats', year ?? 'current'], queryFn: () => api.get(`/media/stats${toQuery({ year })}`), placeholderData: (previous) => previous });

export const useMediaSeries = () => useQuery({ queryKey: ['media', 'series'], queryFn: () => api.get('/media/items/series'), staleTime: 30_000 });

export const useMediaGenres = () => useQuery({ queryKey: ['media', 'genres'], queryFn: () => api.get('/media/items/genres'), staleTime: 30_000 });

export const useMediaCountries = () => useQuery({ queryKey: ['media', 'countries'], queryFn: () => api.get('/media/items/countries'), staleTime: 30_000 });

export function useToggleMediaFavorite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (item) => api.patch(`/media/items/${item.id}`, { is_favorite: !item.is_favorite }),
    onSuccess: () => (queryClient.invalidateQueries({ queryKey: ['media'] }), queryClient.invalidateQueries({ queryKey: ['series'] })),
  });
}

/** Lưu item (tạo hoặc sửa) rồi xử lý ảnh bìa: `cover` là Blob mới, `clearCover` để gỡ ảnh cũ. */
export function useSaveMediaItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data, cover, clearCover }) => {
      let item = id ? await api.patch(`/media/items/${id}`, data) : await api.post('/media/items', data);
      if (cover) {
        item = await sendBinary('PUT', `/media/items/${item.id}/cover`, cover);
      } else if (clearCover && isLocalImage(item.cover_image)) {
        item = await api.delete(`/media/items/${item.id}/cover`);
      }
      return item;
    },
    onSettled: () => (queryClient.invalidateQueries({ queryKey: ['media'] }), queryClient.invalidateQueries({ queryKey: ['series'] })),
  });
}

export function useDeleteMediaItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.delete(`/media/items/${id}`),
    onSuccess: () => (queryClient.invalidateQueries({ queryKey: ['media'] }), queryClient.invalidateQueries({ queryKey: ['series'] })),
  });
}

export const useMediaItem = (id) => useQuery({ queryKey: ['media', 'item', id], queryFn: () => api.get(`/media/items/${id}`), enabled: Boolean(id) });

/** Giá trị đã nhập (diễn viên, hãng, nền tảng, warnings, topics, kênh, ngôn ngữ...) làm danh sách chọn trong form. */
export const useMediaValues = () => useQuery({ queryKey: ['media', 'values'], queryFn: () => api.get('/media/items/values'), staleTime: 30_000 });

export const useMediaNote = (id) => useQuery({ queryKey: ['media', 'note', id], queryFn: () => api.get(`/media/items/${id}/note`), enabled: Boolean(id) });

export function useSaveMediaNote(id) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch) => api.put(`/media/items/${id}/note`, patch),
    onSuccess: (note) => {
      queryClient.setQueryData(['media', 'note', id], note);
      queryClient.invalidateQueries({ queryKey: ['sync-status'] });
    },
  });
}
