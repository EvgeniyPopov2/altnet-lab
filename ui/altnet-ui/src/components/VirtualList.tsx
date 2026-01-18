import React from "react";

export type VirtualListProps<T> = {
  items: readonly T[];
  itemHeight: number; // фиксированная высота строки в px
  overscan?: number; // сколько элементов дорисовывать сверху/снизу
  className?: string;
  style?: React.CSSProperties;

  // Рендер строки. Важно: внутри желательно использовать "h-full", чтобы строка укладывалась в itemHeight.
  renderItem: (item: T, index: number) => React.ReactNode;

  // Ключ строки
  getKey?: (item: T, index: number) => React.Key;

  // Что показывать при пустом списке
  empty?: React.ReactNode;
};

export function VirtualList<T>(props: VirtualListProps<T>) {
  const {
    items,
    itemHeight,
    overscan = 8,
    className,
    style,
    renderItem,
    getKey,
    empty,
  } = props;

  const viewportRef = React.useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = React.useState(0);
  const [viewportH, setViewportH] = React.useState(0);

  React.useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const read = () => setViewportH(el.clientHeight);

    read();

    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(() => read());
      ro.observe(el);
      return () => ro.disconnect();
    }

    const onResize = () => read();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const total = items.length;

  if (total === 0) {
    return (
      <div
        ref={viewportRef}
        className={className}
        style={{ ...style, overflowY: "auto", overflowX: "hidden" }}
      >
        {empty ?? null}
      </div>
    );
  }

  const totalHeight = total * itemHeight;

  const start = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const end = Math.min(
    total,
    Math.ceil((scrollTop + viewportH) / itemHeight) + overscan,
  );

  const visible = items.slice(start, end);

  return (
    <div
      ref={viewportRef}
      className={className}
      style={{ ...style, overflowY: "auto", overflowX: "hidden" }}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
    >
      <div style={{ height: totalHeight, position: "relative" }}>
        {visible.map((item, i) => {
          const index = start + i;
          const key = getKey ? getKey(item, index) : index;

          return (
            <div
              key={key}
              style={{
                position: "absolute",
                top: index * itemHeight,
                left: 0,
                right: 0,
                height: itemHeight,
              }}
            >
              {renderItem(item, index)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
