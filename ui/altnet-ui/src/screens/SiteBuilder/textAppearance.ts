import { oneOf } from "../../core/records";

export const blendModes = [
  "normal",
  "multiply",
  "screen",
  "overlay",
  "darken",
  "lighten",
  "color-dodge",
  "color-burn",
  "hard-light",
  "soft-light",
  "difference",
  "exclusion",
  "hue",
  "saturation",
  "color",
  "luminosity",
] as const;

export function textAppearance(source: Record<string, unknown>) {
  const normal: Record<string, string> = {};
  const hover: Record<string, string> = {};
  const color = (value: unknown) =>
    typeof value === "string" && /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value) ? value : undefined;
  const number = (value: unknown, min: number, max: number) =>
    typeof value === "number" && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : undefined;
  if (oneOf(source.fontStyle, ["normal", "italic", "oblique"])) normal["font-style"] = source.fontStyle;
  if (oneOf(source.textTransform, ["none", "uppercase", "lowercase", "capitalize"]))
    normal["text-transform"] = source.textTransform;
  if (oneOf(source.decoration, ["none", "underline", "overline", "line-through"]))
    normal["text-decoration-line"] = source.decoration;
  for (const [key, css] of [
    ["letterSpacing", "letter-spacing"],
    ["wordSpacing", "word-spacing"],
  ] as const) {
    const n = number(source[key], -32, 100);
    if (n !== undefined) normal[css] = n + "px";
  }
  if (oneOf(source.blend, blendModes)) normal["mix-blend-mode"] = source.blend;
  const stroke = number(source.strokeWidth, 0, 20);
  if (stroke !== undefined) normal["-webkit-text-stroke-width"] = stroke + "px";
  const strokeColor = color(source.strokeColor);
  if (strokeColor) normal["-webkit-text-stroke-color"] = strokeColor;
  if (source.textShadow === "off") normal["text-shadow"] = "none";
  if (source.textShadow === "on") {
    const x = number(source.textShadowX, -128, 128) ?? 0,
      y = number(source.textShadowY, -128, 128) ?? 2;
    const blur = number(source.textShadowBlur, 0, 128) ?? 4;
    normal["text-shadow"] = [x + "px", y + "px", blur + "px", color(source.textShadowColor) ?? "#00000080"].join(" ");
  }
  const hoverColor = color(source.textHoverColor);
  if (hoverColor) hover.color = hoverColor;
  return { normal, hover };
}
