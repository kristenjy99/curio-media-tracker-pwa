import { useId, useRef, useState } from 'react';
import { cn } from '../../lib/utils.js';
import { filterSuggestions, handleListKeys, SuggestList, ToggleButton } from './SuggestList.jsx';

/** Ô một giá trị có danh sách thả xuống các giá trị đã nhập; vẫn gõ được giá trị mới. */
export function ComboInput({ value, onChange, suggestions = [], placeholder, id, className, ...aria }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [typing, setTyping] = useState(false);
  const listId = useId();
  const inputRef = useRef(null);
  const text = value ?? '';
  // Mở bằng nút hoặc khi vừa focus thì hiện toàn bộ; đang gõ thì lọc theo chữ đã gõ.
  const options = open ? filterSuggestions(suggestions, typing ? text : '').slice(0, 200) : [];
  const pick = (option) => {
    onChange(option);
    setOpen(false);
    setTyping(false);
    setActive(-1);
  };
  return (
    <div className={cn('relative', className)}>
      <div className="flex h-10 w-full items-center rounded-lg border border-line bg-surface pr-1 focus-within:border-moss focus-within:ring-2 focus-within:ring-sage/50">
        <input
          ref={inputRef}
          id={id}
          {...aria}
          role="combobox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-autocomplete="list"
          autoComplete="off"
          value={text}
          placeholder={placeholder}
          onFocus={() => {
            setTyping(false);
            setOpen(suggestions.length > 0);
          }}
          onChange={(event) => {
            onChange(event.target.value);
            setTyping(true);
            setActive(-1);
            setOpen(suggestions.length > 0);
          }}
          onKeyDown={(event) => handleListKeys(event, { open, setOpen, options, active, setActive, onPick: pick })}
          onBlur={() => {
            setOpen(false);
            // Gõ trùng giá trị có sẵn (khác hoa thường) thì dùng đúng cách viết đã có.
            const same = suggestions.find((entry) => entry.toLowerCase() === text.trim().toLowerCase());
            if (same && same !== text) onChange(same);
          }}
          className="h-full min-w-0 flex-1 bg-transparent px-3 text-sm text-ink placeholder:text-ink-muted/70 focus:outline-none"
        />
        {suggestions.length > 0 && (
          <ToggleButton
            open={open}
            label="Hiện danh sách đã nhập"
            onToggle={() => {
              inputRef.current?.focus();
              setTyping(false);
              setOpen(!open);
            }}
          />
        )}
      </div>
      {open && <SuggestList id={listId} options={options} active={active} onPick={pick} empty="Không có giá trị nào khớp, giữ nguyên chữ đã gõ" />}
    </div>
  );
}
