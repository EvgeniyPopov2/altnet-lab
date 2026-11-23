import type { LayoutBreakpoint } from "../../layoutResponsive";
type SpacerSize = { size?: unknown; heightByBp?: Partial<Record<LayoutBreakpoint, number>> };
export function spacerHeight(block: SpacerSize, device: LayoutBreakpoint): number {
  const sizes: Record<string, number> = { xs: 8, sm: 16, md: 32, lg: 48, xl: 64 };
  let height = typeof block.size === "string" ? sizes[block.size] ?? 32 : 32;
  for (const bp of (["desktop", "tablet", "mobile"] as const)) {
    const value = block.heightByBp?.[bp];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1000) height = value;
    if (bp === device) break;
  }
  return height;
}
