import { useItems } from '../../hooks/queries.js';
import { Select } from '../ui/Input.jsx';

/** Danh sách thả xuống chọn một sách trong thư viện. filter(item) lọc bớt; groups: [{ label, ids }] đưa nhóm gợi ý lên đầu. */
export function BookSelect({ value, onChange, filter, groups = [], placeholder = 'Chọn sách', ...props }) {
  const { data } = useItems({ sort: 'title', order: 'asc' });
  const items = (data?.data ?? []).filter((item) => !filter || filter(item) || item.id === value);
  const grouped = new Set(groups.flatMap((group) => group.ids));
  const option = (item) => <option key={item.id} value={item.id}>{item.title}{item.creator_author ? ` — ${item.creator_author}` : ''}</option>;
  return (
    <Select value={value ?? ''} onChange={(event) => onChange(event.target.value ? Number(event.target.value) : null)} {...props}>
      <option value="">{placeholder}</option>
      {groups.map((group) => {
        const list = items.filter((item) => group.ids.includes(item.id));
        return list.length ? <optgroup key={group.label} label={group.label}>{list.map(option)}</optgroup> : null;
      })}
      <optgroup label="Tất cả sách">{items.filter((item) => !grouped.has(item.id) || !groups.length).map(option)}</optgroup>
    </Select>
  );
}
