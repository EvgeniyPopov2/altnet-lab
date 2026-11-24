export const blockFilters = [
  { id: "Brightness", name: "Яркость", min: 0, max: 200, initial: 100, unit: "%", css: "brightness" },
  { id: "Contrast", name: "Контраст", min: 0, max: 200, initial: 100, unit: "%", css: "contrast" },
  { id: "Saturation", name: "Насыщенность", min: 0, max: 200, initial: 100, unit: "%", css: "saturate" },
  { id: "Grayscale", name: "Оттенки серого", min: 0, max: 100, initial: 0, unit: "%", css: "grayscale" },
  { id: "Sepia", name: "Сепия", min: 0, max: 100, initial: 0, unit: "%", css: "sepia" },
  { id: "Hue", name: "Цветовой тон", min: -180, max: 180, initial: 0, unit: "deg", css: "hue-rotate" },
  { id: "Blur", name: "Размытие", min: 0, max: 30, initial: 0, unit: "px", css: "blur" },
] as const;

export const blockFilterKey = (id: string, hover: boolean) => (hover ? "hoverFilter" : "blockFilter") + id;

/** Строит только известные CSS-фильтры из проверенных числовых значений. */
export function blockFilterStyle(style: Record<string, unknown>, hover = false): Record<string, string> {
  const key = (id: string) => blockFilterKey(id, hover);
  if (hover && !["Mode", ...blockFilters.map(item => item.id)].some(id => style[key(id)] !== undefined)) return {};
  const mode = style[key("Mode")] ?? (hover ? style.blockFilterMode : undefined);
  if (mode === "none") return { filter: "none" };
  if (mode !== "on") return {};
  const filters = blockFilters.map(item => {
    const raw = style[key(item.id)] ?? (hover ? style[blockFilterKey(item.id, false)] : undefined);
    const value = typeof raw === "number" && Number.isFinite(raw) ? Math.min(item.max, Math.max(item.min, raw)) : item.initial;
    return item.css + "(" + value + item.unit + ")";
  });
  return { filter: filters.join(" ") };
}

export function filterTransition(style: Record<string, unknown>): Record<string, string> {
  const raw = style.blockFilterDuration;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return {};
  const time = Math.min(5000, Math.max(0, raw));
  const transform = style.transformDuration;
  const transformTime = typeof transform === "number" && Number.isFinite(transform) ? Math.min(5000, Math.max(0, transform)) : undefined;
  return { transition: (transformTime === undefined ? "" : "transform " + transformTime + "ms, transform-origin " + transformTime + "ms, ") + "filter " + time + "ms" };
}
