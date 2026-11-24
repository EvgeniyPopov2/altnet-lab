const colorPattern = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** Безопасные CSS-параметры тени одинаковы на холсте и в экспортируемом HTML. */
export function blockShadowStyle(style: Record<string, unknown>): Record<string, string> {
  const mode = style.blockShadow;
  if (mode === "none") return { boxShadow: "none" };
  if (mode !== "outer" && mode !== "inset") return {};
  const number = (value: unknown, min: number, max: number, fallback: number) =>
    typeof value === "number" && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
  const x = number(style.blockShadowX, -256, 256, 0);
  const y = number(style.blockShadowY, -256, 256, 8);
  const blur = number(style.blockShadowBlur, 0, 256, 24);
  const spread = number(style.blockShadowSpread, -256, 256, 0);
  const color = typeof style.blockShadowColor === "string" && colorPattern.test(style.blockShadowColor) ? style.blockShadowColor : "#00000040";
  return { boxShadow: (mode === "inset" ? "inset " : "") + [x, y, blur, spread].map(value => value + "px").join(" ") + " " + color };
}
