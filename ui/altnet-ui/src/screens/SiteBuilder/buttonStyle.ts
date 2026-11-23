import { resolveResponsiveStyle } from "./responsiveStyle";

type Device = "desktop" | "tablet" | "mobile";
const colors = ["color", "bg", "borderColor"] as const;
const numbers = ["borderWidth", "radius", "paddingX", "paddingY"] as const;
export type ButtonStyle = { normal: Record<string, string>; hover: Record<string, string>; active: Record<string, string>; duration?: number; iconSize?: number; iconGap?: number };
const property: Record<string, string> = {
  color: "color", bg: "background-color", borderColor: "border-color",
  borderWidth: "border-width", radius: "border-radius",
  paddingX: "padding-inline", paddingY: "padding-block",
};

/** Проверка общая для редактора и CSS экспортированной страницы. */
export function buttonStyle(byDevice: unknown, device: Device): ButtonStyle {
  const source = resolveResponsiveStyle({}, byDevice, device);
  const normal: Record<string, string> = {}, hover: Record<string, string> = {}, active: Record<string, string> = {};
  for (const [prefix, target] of [["", normal], ["hover", hover], ["active", active]] as const) {
    const key = (name: string) => prefix ? `${prefix}${name[0].toUpperCase()}${name.slice(1)}` : name;
    const hex = (value: unknown): value is string => typeof value === "string" && /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value);
    const bounded = (value: unknown, min: number, max: number, fallback: number) => typeof value === "number" && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
    for (const key of colors) {
      const name = prefix ? prefix + key[0].toUpperCase() + key.slice(1) : key;
      const raw = source[name];
      if (typeof raw === "string" && /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(raw)) target[property[key]] = raw;
    }
    for (const key of numbers) {
      const name = prefix ? prefix + key[0].toUpperCase() + key.slice(1) : key;
      const raw = source[name];
      if (typeof raw === "number" && Number.isFinite(raw)) target[property[key]] = `${Math.max(0, Math.min(key === "borderWidth" ? 32 : 256, raw))}px`;
    }
    const layers = byDevice && typeof byDevice === "object" ? byDevice as Record<string, any> : {};
    const sideNames = ["Top", "Right", "Bottom", "Left"] as const;
    const keyFor = (name: string) => prefix ? `${prefix}${name}` : name[0].toLowerCase() + name.slice(1);
    const devices = device === "desktop" ? ["desktop"] : device === "tablet" ? ["desktop", "tablet"] : ["desktop", "tablet", "mobile"];
    const sideUsed = devices.some(bp => sideNames.some(side => typeof layers[bp]?.[keyFor(`Padding${side}`)] === "number" && Number.isFinite(layers[bp][keyFor(`Padding${side}`)])));
    if (sideUsed) {
      const sides: Record<string, number> = {};
      const number = (raw: unknown) => typeof raw === "number" && Number.isFinite(raw) ? Math.max(0, Math.min(256, raw)) : undefined;
      for (const bp of devices) {
        const layer = layers[bp];
        if (!layer || typeof layer !== "object" || Array.isArray(layer)) continue;
        const x = number(layer[keyFor("PaddingX")]), y = number(layer[keyFor("PaddingY")]);
        if (x !== undefined) { sides.Right = x; sides.Left = x; }
        if (y !== undefined) { sides.Top = y; sides.Bottom = y; }
        for (const side of sideNames) {
          const value = number(layer[keyFor(`Padding${side}`)]);
          if (value !== undefined) sides[side] = value;
        }
      }
      delete target["padding-inline"]; delete target["padding-block"];
      for (const side of sideNames) if (sides[side] !== undefined) target[`padding-${side.toLowerCase()}`] = `${sides[side]}px`;
    }
    const background = source[key("backgroundType")];
    const start = source[key("gradientStart")], end = source[key("gradientEnd")];
    if (background === "solid") target["background-image"] = "none";
    if (background === "gradient" && hex(start) && hex(end)) {
      const angle = bounded(source[key("gradientAngle")], 0, 360, 135);
      target["background-image"] = `linear-gradient(${angle}deg,${start},${end})`;
    }
    const shadow = source[key("shadowMode")];
    if (shadow === "off") target["box-shadow"] = "none";
    if (shadow === "on") {
      const x = bounded(source[key("shadowX")], -128, 128, 0), y = bounded(source[key("shadowY")], -128, 128, 4);
      const blur = bounded(source[key("shadowBlur")], 0, 128, 12), spread = bounded(source[key("shadowSpread")], -128, 128, 0);
      const rawColor = source[key("shadowColor")], color = hex(rawColor) ? rawColor : "#00000040";
      target["box-shadow"] = `${x}px ${y}px ${blur}px ${spread}px ${color}`;
    }
  }
  const duration = typeof source.duration === "number" && Number.isFinite(source.duration) ? Math.max(0, Math.min(2000, source.duration)) : undefined;
  const iconSize = typeof source.iconSize === "number" && Number.isFinite(source.iconSize) ? Math.max(8, Math.min(128, source.iconSize)) : undefined;
  const iconGap = typeof source.iconGap === "number" && Number.isFinite(source.iconGap) ? Math.max(0, Math.min(128, source.iconGap)) : undefined;
  return { normal, hover, active, duration, ...(iconSize !== undefined ? { iconSize } : {}), ...(iconGap !== undefined ? { iconGap } : {}) };
}
