import { asRecord, oneOf } from "../../core/records";
export type LayoutBreakpoint = "desktop" | "tablet" | "mobile";
export type LayoutByBreakpoint = Partial<Record<"tablet" | "mobile", { mode?: "columns" | "stack"; weights?: number[]; gap?: number; gapX?: number; gapY?: number }>>;
type LayoutLike = { layoutPreset?: unknown; layoutByBp?: LayoutByBreakpoint; layoutCells?: unknown[]; layoutGap?: unknown; layoutGapX?: unknown; layoutGapY?: unknown };
const validGap = (value: unknown, fallback: number) => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 128 ? value : fallback;

/** Старое общее расстояние остаётся значением по умолчанию для обеих осей. */
export function resolveGridGaps(block: LayoutLike, device: LayoutBreakpoint): { x: number; y: number } {
  const base = validGap(block.layoutGap, 16);
  let x = validGap(block.layoutGapX, base), y = validGap(block.layoutGapY, base);
  for (const bp of (device === "desktop" ? [] : device === "tablet" ? ["tablet"] : ["tablet", "mobile"]) as Array<"tablet" | "mobile">) {
    const layer = block.layoutByBp?.[bp];
    x = validGap(layer?.gapX, validGap(layer?.gap, x));
    y = validGap(layer?.gapY, validGap(layer?.gap, y));
  }
  return { x, y };
}
export function resolveLayout(block: LayoutLike, device: LayoutBreakpoint): { mode: "columns" | "stack"; weights: number[]; gap: number } {
  const count = Array.isArray(block.layoutCells) ? block.layoutCells.length : 0;
  const base = Array.isArray(block.layoutPreset) ? block.layoutPreset : [];
  const normalize = (values: unknown[], fallback: number[]) => Array.from({ length: count }, (_, index) => {
    const value = Number(values[index]);
    return Number.isInteger(value) && value >= 1 && value <= 16 ? value : fallback[index] || 1;
  });
  const desktop = normalize(base, []);
  const tablet = normalize(Array.isArray(block.layoutByBp?.tablet?.weights) ? block.layoutByBp.tablet.weights : [], desktop);
  const mobile = normalize(Array.isArray(block.layoutByBp?.mobile?.weights) ? block.layoutByBp.mobile.weights : [], tablet);
  const desktopGap = validGap(block.layoutGap, 16);
  const tabletGap = validGap(block.layoutByBp?.tablet?.gap, desktopGap);
  const mobileGap = validGap(block.layoutByBp?.mobile?.gap, tabletGap);
  const mode = device === "desktop" ? "columns" : block.layoutByBp?.[device]?.mode === "columns" ? "columns" : block.layoutByBp?.[device]?.mode === "stack" ? "stack" : device === "mobile" ? "stack" : "columns";
  return { mode, weights: device === "desktop" ? desktop : device === "tablet" ? tablet : mobile, gap: device === "desktop" ? desktopGap : device === "tablet" ? tabletGap : mobileGap };
}

export const flexChoices = {
  direction: ["row", "row-reverse", "column", "column-reverse"],
  justify: ["flex-start", "center", "flex-end", "space-between", "space-around", "space-evenly"],
  align: ["stretch", "flex-start", "center", "flex-end", "baseline"],
  alignContent: ["stretch", "flex-start", "center", "flex-end", "space-between", "space-around", "space-evenly"],
  wrap: ["nowrap", "wrap", "wrap-reverse"],
  sizing: ["ratio", "content", "fixed"],
  contentWidth: ["full", "boxed"],
} as const;
export type FlexSettings = { [K in keyof typeof flexChoices]?: typeof flexChoices[K][number] } & {
  basis?: number; maxWidth?: number; minHeight?: number;
};
export type FlexByBreakpoint = Partial<Record<LayoutBreakpoint, FlexSettings>>;

export function resolveFlexLayout(block: LayoutLike & { flexByBp?: unknown }, device: LayoutBreakpoint) {
  const layout = resolveLayout(block, device);
  const layers = asRecord(block.flexByBp);
  let direction: NonNullable<FlexSettings["direction"]> = layout.mode === "stack" ? "column" : "row";
  const selected: Record<string, unknown> = {};
  for (const bp of ["desktop", "tablet", "mobile"] as const) {
    const source = asRecord(layers[bp]);
    const oldMode = bp !== "desktop" && block.layoutByBp?.[bp]?.mode;
    if (oldMode && bp === device) direction = oldMode === "stack" ? "column" : "row";
    if (oneOf(source.direction, flexChoices.direction)) direction = source.direction;
    for (const key of Object.keys(flexChoices) as Array<keyof typeof flexChoices>) {
      if (oneOf(source[key], flexChoices[key])) selected[key] = source[key];
    }
    for (const key of ["basis", "minHeight", "maxWidth"]) {
      if (typeof source[key] === "number" && Number.isFinite(source[key])) selected[key] = source[key];
    }
    if (bp === device) break;
  }
  const size = (key: string, fallback: number, min: number, max: number) =>
    typeof selected[key] === "number" ? Math.min(max, Math.max(min, selected[key])) : fallback;
  const wrap = oneOf(selected.wrap, flexChoices.wrap) ? selected.wrap : "nowrap";
  const gap = resolveGridGaps(block, device);
  const boxed = selected.contentWidth === "boxed";
  const row = {
    display: "flex", flexDirection: direction, flexWrap: wrap,
    justifyContent: oneOf(selected.justify, flexChoices.justify) ? selected.justify : "flex-start",
    alignItems: oneOf(selected.align, flexChoices.align) ? selected.align : "stretch",
    alignContent: oneOf(selected.alignContent, flexChoices.alignContent) ? selected.alignContent : "stretch",
    columnGap: String(gap.x) + "px", rowGap: String(gap.y) + "px",
    minHeight: String(size("minHeight", 0, 0, 2400)) + "px",
    width: "100%", maxWidth: boxed ? String(size("maxWidth", 1140, 1, 3840)) + "px" : "none",
    marginInline: boxed ? "auto" : "0",
  } as const;
  const basis = size("basis", 180, 1, 3840);
  const cells = layout.weights.map(weight => {
    if (selected.sizing === "content") return "0 1 auto";
    if (selected.sizing === "fixed") return "0 1 " + basis + "px";
    if (direction.startsWith("column")) return "0 1 auto";
    return String(weight) + " 1 " + (wrap === "nowrap" ? "0px" : String(weight * basis) + "px");
  });
  return { row, cells, basis, sizing: selected.sizing ?? "ratio", contentWidth: boxed ? "boxed" : "full" };
}
