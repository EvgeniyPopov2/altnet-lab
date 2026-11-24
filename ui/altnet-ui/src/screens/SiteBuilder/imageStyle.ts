import { cornerStyles } from "./corners";
import { resolveResponsiveStyle } from "./responsiveStyle";

type Device = "desktop" | "tablet" | "mobile";
const borderTypes = ["none", "solid", "double", "dotted", "dashed", "groove"];

export function imageAlignment(byDevice: unknown, device: Device): string | undefined {
  const value = resolveResponsiveStyle({}, byDevice, device).align;
  return typeof value === "string" && ["left", "center", "right"].includes(value) ? value : undefined;
}

export function imageCaptionStyle(byDevice: unknown, device: Device): Record<string, string | number> {
  const source = resolveResponsiveStyle({}, byDevice, device), result: Record<string, string | number> = {};
  const size = source.captionSize, spacing = source.captionSpacing, lineHeight = source.captionLineHeight, weight = source.captionWeight;
  if (typeof size === "number" && Number.isFinite(size)) result.fontSize = `${Math.max(1, Math.min(256, size))}px`;
  if (typeof spacing === "number" && Number.isFinite(spacing)) result.marginTop = `${Math.max(0, Math.min(256, spacing))}px`;
  if (typeof lineHeight === "number" && Number.isFinite(lineHeight)) result.lineHeight = Math.max(.5, Math.min(4, lineHeight));
  if (typeof weight === "number" && Number.isFinite(weight)) result.fontWeight = Math.max(100, Math.min(900, weight));
  if (typeof source.captionColor === "string" && /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(source.captionColor)) result.color = source.captionColor;
  if (typeof source.captionAlign === "string" && ["left", "center", "right", "justify"].includes(source.captionAlign)) result.textAlign = source.captionAlign;
  if (typeof source.captionFont === "string" && ["system-ui", "sans-serif", "serif", "monospace", "Arial", "Georgia", "Verdana", "Tahoma"].includes(source.captionFont)) result.fontFamily = source.captionFont;
  return result;
}

/** Одна и та же проверка значений для холста и опубликованной страницы. */
export function imageStyle(byDevice: unknown, device: Device): Record<string, string | number> {
  const source = resolveResponsiveStyle({}, byDevice, device);
  const result: Record<string, string | number> = {};
  const number = (key: string, min: number, max: number) =>
    typeof source[key] === "number" && Number.isFinite(source[key]) ? Math.max(min, Math.min(max, source[key] as number)) : undefined;
  const width = number("width", 1, 200), maxWidth = number("maxWidth", 1, 200);
  const height = number("height", 0, 1600), opacity = number("opacity", 0, 100);
  if (width !== undefined) result.width = `${width}%`;
  if (maxWidth !== undefined) result.maxWidth = `${maxWidth}%`;
  if (height !== undefined) result.height = `${height}px`;
  if (opacity !== undefined) result.opacity = opacity / 100;
  if (typeof source.fit === "string" && ["contain", "cover", "fill", "none", "scale-down"].includes(source.fit)) result.objectFit = source.fit;
  const borderWidth = number("borderWidth", 0, 32);
  Object.assign(result, cornerStyles(byDevice, device, "normal", 512));
  if (borderWidth !== undefined) { result.borderWidth = `${borderWidth}px`; result.borderStyle = "solid"; }
  if (typeof source.borderType === "string" && borderTypes.includes(source.borderType)) result.borderStyle = source.borderType;
  if (imageAlignment(byDevice, device)) result.display = "inline-block";
  if (typeof source.borderColor === "string" && /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(source.borderColor)) result.borderColor = source.borderColor;
  const filter = imageFilter(source, "");
  if (filter) result.filter = filter;
  const shadow = imageShadow(source, "");
  if (shadow) result.boxShadow = shadow;
  return result;
}

function imageShadow(source: Record<string, unknown>, prefix: string): string | undefined {
  const key = (name: string) => prefix ? `${prefix}${name}` : name[0].toLowerCase() + name.slice(1);
  const mode = source[key("ShadowMode")];
  if (mode === "off") return "none";
  if (mode !== "on") return undefined;
  const numeric = (name: string, fallback: number, min: number, max: number) => {
    const value = source[key(name)];
    return typeof value === "number" && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
  };
  const rawColor = source[key("ShadowColor")];
  const color = typeof rawColor === "string" && /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(rawColor) ? rawColor : "#00000080";
  return `${numeric("ShadowX", 0, -128, 128)}px ${numeric("ShadowY", 4, -128, 128)}px ${numeric("ShadowBlur", 12, 0, 128)}px ${numeric("ShadowSpread", 0, -128, 128)}px ${color}`;
}

function imageFilter(source: Record<string, unknown>, prefix: string): string | undefined {
  const fields = [["Brightness", 0, 200, 100], ["Contrast", 0, 200, 100], ["Saturate", 0, 200, 100], ["Blur", 0, 30, 0]] as const;
  const key = (name: string) => prefix ? `${prefix}${name}` : name[0].toLowerCase() + name.slice(1);
  const valid = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
  if (!fields.some(([name]) => valid(source[key(name)]))) return undefined;
  const values = fields.map(([name, min, max, fallback]) => {
    const selected = source[key(name)], normal = source[name[0].toLowerCase() + name.slice(1)];
    const value = valid(selected) ? selected : prefix && valid(normal) ? normal : fallback;
    return Math.max(min, Math.min(max, value));
  });
  return `brightness(${values[0]}%) contrast(${values[1]}%) saturate(${values[2]}%) blur(${values[3]}px)`;
}

/** Only explicitly configured hover properties override the normal image. */
export function imageHoverStyle(byDevice: unknown, device: Device): Record<string, string | number> {
  const source = resolveResponsiveStyle({}, byDevice, device);
  const result: Record<string, string | number> = {};
  for (const [key, css, max, unit] of [["hoverOpacity", "opacity", 100, ""], ["hoverBorderWidth", "borderWidth", 32, "px"]] as const) {
    const value = source[key];
    if (typeof value === "number" && Number.isFinite(value)) result[css] = unit ? `${Math.max(0, Math.min(max, value))}${unit}` : Math.max(0, Math.min(max, value)) / 100;
  }
  Object.assign(result, cornerStyles(byDevice, device, "hover", 512));
  if (result.borderWidth !== undefined) result.borderStyle = typeof source.borderType === "string" && borderTypes.includes(source.borderType) ? source.borderType : "solid";
  if (typeof source.hoverBorderType === "string" && borderTypes.includes(source.hoverBorderType)) result.borderStyle = source.hoverBorderType;
  if (typeof source.hoverBorderColor === "string" && /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(source.hoverBorderColor)) result.borderColor = source.hoverBorderColor;
  const filter = imageFilter(source, "hover");
  if (filter) result.filter = filter;
  const shadow = imageShadow(source, "hover");
  if (shadow) result.boxShadow = shadow;
  return result;
}

export function imageTransition(byDevice: unknown, device: Device): number | undefined {
  const value = resolveResponsiveStyle({}, byDevice, device).duration;
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(2000, value)) : undefined;
}
