import { corners } from "./corners";

export const blockCornerKeys = corners.map(([corner]) => "blockCorner" + corner);

/** Отдельные углы дополняют общий радиус в разрешённом стиле блока. */
export function blockCornerStyle(style: Record<string, unknown>): Record<string, string> {
  const unit = style.blockCornerUnit === "%" ? "%" : "px";
  const result: Record<string, string> = {};
  for (const [corner] of corners) {
    const value = style["blockCorner" + corner];
    if (typeof value === "number" && Number.isFinite(value))
      result["border" + corner + "Radius"] = Math.max(0, Math.min(512, value)) + unit;
  }
  return result;
}
