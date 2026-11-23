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
