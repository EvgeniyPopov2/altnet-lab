export const transforms = [
  { id: "translateX", name: "Смещение X", min: -1000, max: 1000, step: 1, unit: "px", initial: 0 },
  { id: "translateY", name: "Смещение Y", min: -1000, max: 1000, step: 1, unit: "px", initial: 0 },
  { id: "rotate", name: "Поворот Z", min: -360, max: 360, step: 1, unit: "deg", initial: 0 },
  { id: "rotateX", name: "Поворот X", min: -360, max: 360, step: 1, unit: "deg", initial: 0 },
  { id: "rotateY", name: "Поворот Y", min: -360, max: 360, step: 1, unit: "deg", initial: 0 },
  { id: "scaleX", name: "Масштаб X", min: -10, max: 10, step: 0.01, unit: "", initial: 1 },
  { id: "scaleY", name: "Масштаб Y", min: -10, max: 10, step: 0.01, unit: "", initial: 1 },
  { id: "skewX", name: "Наклон X", min: -89, max: 89, step: 1, unit: "deg", initial: 0 },
  { id: "skewY", name: "Наклон Y", min: -89, max: 89, step: 1, unit: "deg", initial: 0 },
] as const;
export function transformKey(id: string, hover: boolean) {
  return hover ? "hover" + id[0].toUpperCase() + id.slice(1) : id;
}
function finite(n: unknown, min: number, max: number) {
  return typeof n === "number" && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : undefined;
}
export function transformStyle(source: Record<string, unknown>, hover = false): Record<string, string> {
  const css: Record<string, string> = {};
  const read = (key: string) => source[transformKey(key, hover)];
  if (
    hover &&
    !["transformMode", "originX", "originY", ...transforms.map((t) => t.id)].some((k) => read(k) !== undefined)
  )
    return css;
  const parts: string[] = [];
  for (const { id, min, max, unit } of transforms) {
    const n = finite(read(id) ?? (hover ? source[id] : undefined), min, max);
    if (n !== undefined) parts.push(id + "(" + n + unit + ")");
  }
  if (read("transformMode") === "none" || (hover && !read("transformMode") && source.transformMode === "none"))
    css.transform = "none";
  else if (parts.length) css.transform = parts.join(" ");
  const x = finite(read("originX") ?? (hover ? source.originX : undefined), 0, 100);
  const y = finite(read("originY") ?? (hover ? source.originY : undefined), 0, 100);
  if (x !== undefined || y !== undefined) css.transformOrigin = (x ?? 50) + "% " + (y ?? 50) + "%";
  const ms = finite(source.transformDuration, 0, 5000);
  if (!hover && ms !== undefined) css.transition = "transform " + ms + "ms, transform-origin " + ms + "ms";
  return css;
}
