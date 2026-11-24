const hexColor = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** Единый расчёт градиента для холста и экспортируемой страницы. */
export function backgroundStyle(style: Record<string, unknown>): Record<string, string> {
  const type = style.backgroundType;
  if (type === "none") return { backgroundImage: "none" };
  if (type !== "linear" && type !== "radial") return {};
  const color = (value: unknown, fallback: string) => typeof value === "string" && hexColor.test(value) ? value : fallback;
  const number = (value: unknown, min: number, max: number, fallback: number) =>
    typeof value === "number" && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
  const from = color(style.gradientFrom, "#6e59f2");
  const to = color(style.gradientTo, "#d9d1ff");
  const start = number(style.gradientStart, 0, 100, 0);
  const end = number(style.gradientEnd, 0, 100, 100);
  const stops = from + " " + start + "%, " + to + " " + end + "%";
  if (type === "linear") return { backgroundImage: "linear-gradient(" + number(style.gradientAngle, 0, 360, 180) + "deg, " + stops + ")" };
  const x = number(style.gradientX, 0, 100, 50);
  const y = number(style.gradientY, 0, 100, 50);
  return { backgroundImage: "radial-gradient(ellipse at " + x + "% " + y + "%, " + stops + ")" };
}
