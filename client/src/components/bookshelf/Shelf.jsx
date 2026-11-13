import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '../ui/Button.jsx';
import { BookSpine } from './BookSpine.jsx';
import { ShelfCat } from './Cat.jsx';
import { resolveFileUrl } from '../../lib/api.js';

const ORNAMENT_HEIGHT = { sm: 72, md: 120, lg: 176 };

function Ornament({ ornament }) {
  return (
    <img
      src={resolveFileUrl(ornament.src)}
      alt=""
      aria-hidden
      draggable={false}
      className="ornament pointer-events-none mx-1 shrink-0 select-none self-end object-contain"
      style={{ height: ORNAMENT_HEIGHT[ornament.size] ?? ORNAMENT_HEIGHT.md, maxWidth: 180 }}
    />
  );
}

/** ornaments: [{ key, src, size, index }] — index là vị trí chen vào giữa các cuốn (0 = trước cuốn đầu). */
export function Shelf({ title, items, onOpen, withCat = false, action, ornaments = [] }) {
  const rowRef = useRef(null);
  const [scroll, setScroll] = useState({ left: false, right: false });

  const measure = useCallback(() => {
    const row = rowRef.current;
    if (!row) return;
    setScroll({ left: row.scrollLeft > 4, right: row.scrollLeft + row.clientWidth < row.scrollWidth - 4 });
  }, []);

  useEffect(() => {
    measure();
    const row = rowRef.current;
    const observer = new ResizeObserver(measure);
    if (row) observer.observe(row);
    return () => observer.disconnect();
  }, [measure, items.length]);

  const page = (direction) => rowRef.current?.scrollBy({ left: direction * rowRef.current.clientWidth * 0.8 });

  return (
    <section className="relative" aria-label={`Tầng kệ ${title}`}>
      <div className="mb-1 flex items-baseline gap-3 px-1">
        <h2 className="font-display text-[1.65rem] font-medium leading-none">{title}</h2>
        <span className="whitespace-nowrap text-sm text-ink-muted">{items.length} cuốn</span>
        <div className="ml-auto flex items-center gap-1">
          {action}
          <Button variant="ghost" size="icon-sm" onClick={() => page(-1)} disabled={!scroll.left} aria-label="Cuộn kệ sang trái">
            <ChevronLeft size={18} />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => page(1)} disabled={!scroll.right} aria-label="Cuộn kệ sang phải">
            <ChevronRight size={18} />
          </Button>
        </div>
      </div>
      <div className="relative">
        <div
          ref={rowRef}
          onScroll={measure}
          className={`shelf-row flex min-h-[262px] items-end gap-[3px] overflow-x-auto px-4 pt-8 ${withCat ? 'pr-36' : ''}`}
        >
          {items.map((item, index) => (
            <Fragment key={item.id}>
              {ornaments.filter((ornament) => ornament.index === index).map((ornament) => (
                <Ornament key={ornament.key} ornament={ornament} />
              ))}
              <BookSpine item={item} onOpen={onOpen} />
            </Fragment>
          ))}
          {ornaments.filter((ornament) => ornament.index >= items.length).map((ornament) => (
            <Ornament key={ornament.key} ornament={ornament} />
          ))}
        </div>
        {withCat && <ShelfCat className="pointer-events-auto absolute bottom-[14px] right-6 w-24" />}
        <div className="shelf-plank relative" />
      </div>
    </section>
  );
}
