import { asRecord, oneOf } from "../../core/records";

export const shapes = {
  wave: "M 8 65 C 48 4 106 4 152 62 S 252 112 312 42",
  arc: "M 8 99 Q 160 -58 312 99",
  circle: "M 161 12 A 51 51 0 1 1 159 12 Z",
  line: "M 8 72 L 312 72",
  oval: "M 160 17 A 144 43 0 1 1 159.9 17 Z",
  spiral: "M 160 60 c 0 -5 9 -5 9 0 c 0 12 -22 12 -22 0 c 0 -23 40 -23 40 0 c 0 36 -64 36 -64 0 c 0 -48 88 -48 88 0",
} as const;
const numberPattern = "[-+]?(?:\\d*\\.\\d+|\\d+\\.?\\d*)(?:[eE][-+]?\\d+)?";
const pathTokens = new RegExp("[MmLlHhVvCcSsQqTtAaZz]|" + numberPattern, "g");
const arity: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };
export function validPath(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    !value.length ||
    value.length > 64000 ||
    !/^\s*[Mm]/.test(value) ||
    !/^[0-9MmLlHhVvCcSsQqTtAaZzEe+\-.,\s]+$/.test(value)
  )
    return false;
  const tokens = value.match(pathTokens) ?? [];
  if (value.replace(pathTokens, "").replace(/[,\s]/g, "") || !tokens.length) return false;
  let i = 0;
  while (i < tokens.length) {
    const command = tokens[i++].toUpperCase(),
      n = arity[command];
    if (n === undefined) return false;
    const at = i;
    while (i < tokens.length && !/^[a-z]$/i.test(tokens[i])) {
      const v = Number(tokens[i]);
      if (!Number.isFinite(v) || Math.abs(v) > 1e7) return false;
      if (command === "A" && [3, 4].includes((i - at) % 7) && tokens[i] !== "0" && tokens[i] !== "1") return false;
      i++;
    }
    if (n === 0 ? i !== at : i === at || (i - at) % n !== 0) return false;
  }
  return true;
}
function parseBox(value: unknown): number[] | undefined {
  if (typeof value !== "string") return;
  const dims = value
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (dims.length === 4 && dims.every((n) => Number.isFinite(n) && Math.abs(n) <= 1e7) && dims[2] > 0 && dims[3] > 0)
    return dims;
}
export function fromSvgFile(svg: string) {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml"),
    root = doc.documentElement;
  const path = root.querySelector("path[d]"),
    d = path?.getAttribute("d");
  if (root.localName !== "svg" || doc.querySelector("parsererror") || !path || !validPath(d))
    throw Error("В SVG нужен контур path с координатами.");
  if (path.closest("[transform]"))
    throw Error("Перед импортом примените преобразования к контуру в векторном редакторе.");
  const explicit = parseBox(root.getAttribute("viewBox"));
  const w = Number(root.getAttribute("width")),
    h = Number(root.getAttribute("height"));
  const box = explicit ?? (w > 0 && h > 0 && w <= 1e7 && h <= 1e7 ? [0, 0, w, h] : undefined);
  if (!box) throw Error("Укажите viewBox или числовые width и height исходного SVG.");
  return { d, viewBox: box.join(" "), shape: "custom" };
}
export function textPathOptions(value: unknown) {
  const data = asRecord(value),
    n = (v: unknown, min: number, max: number, initial: number) =>
      typeof v === "number" && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : initial;
  const color = (v: unknown, initial: string) =>
    typeof v === "string" && /^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(v) ? v : initial;
  const shape =
    typeof data.shape === "string" && Object.hasOwn(shapes, data.shape)
      ? (data.shape as keyof typeof shapes)
      : data.shape === "custom"
        ? "custom"
        : "wave";
  const box = shape === "custom" ? (parseBox(data.viewBox) ?? [0, 0, 320, 120]) : [0, 0, 320, 120];
  const align = oneOf(data.align, ["start", "middle", "end"]) ? data.align : "start";
  return {
    shape,
    d: shape === "custom" ? (validPath(data.d) ? data.d : "") : shapes[shape],
    viewBox: box.join(" "),
    cx: box[0] + box[2] / 2,
    cy: box[1] + box[3] / 2,
    text: typeof data.text === "string" ? data.text : "",
    align,
    direction: oneOf(data.direction, ["rtl", "ltr"]) ? data.direction : "auto",
    start: n(data.start, 0, 100, align === "middle" ? 50 : align === "end" ? 100 : 0),
    size: n(data.size, 0.1, 2000, 320),
    rotate: n(data.rotate, -360, 360, 0),
    unit: oneOf(data.unit, ["px", "%", "em", "rem", "vw"]) ? data.unit : "px",
    fontSize: n(data.fontSize, 1, 300, 24),
    wordSpacing: n(data.wordSpacing, -20, 100, 0),
    showPath: data.showPath === true,
    color: color(data.color, "currentColor"),
    hoverColor: color(data.hoverColor, color(data.color, "currentColor")),
    stroke: color(data.stroke, "#9188ba"),
    hoverStroke: color(data.hoverStroke, color(data.stroke, "#9188ba")),
    strokeWidth: n(data.strokeWidth, 0, 50, 2),
  };
}
