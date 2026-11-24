import { sides } from "./boxDimensions";

export const blockBorderKeys = sides.map(([, side]) => "blockBorder" + side);

export function blockBorderStyle(style: Record<string, unknown>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [, side] of sides) {
    const value = style["blockBorder" + side];
    if (typeof value === "number" && Number.isFinite(value))
      result["border" + side + "Width"] = Math.max(0, Math.min(512, value)) + "px";
  }
  return result;
}
