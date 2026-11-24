import { oneOf } from "../../core/records";
export const lengthUnits = ["px", "%", "em", "rem", "vw", "vh"] as const;
export const sides = [
  ["t", "Top", "Сверху"],
  ["r", "Right", "Справа"],
  ["b", "Bottom", "Снизу"],
  ["l", "Left", "Слева"],
] as const;

export function spacingStyle(style: Record<string, unknown>) {
  const result: Record<string, string> = {};
  for (const kind of ["padding", "margin"] as const) {
    const unit = style[kind + "Unit"];
    for (const [key, side] of sides) {
      const value = style[kind[0] + key] ?? (kind === "padding" && (key === "t" || key === "b") ? style.py : undefined);
      if (typeof value !== "number" || !Number.isFinite(value)) continue;
      result[kind + side] =
        Math.max(kind === "padding" ? 0 : -512, Math.min(512, value)) + (oneOf(unit, lengthUnits) ? unit : "px");
    }
  }
  return result;
}
