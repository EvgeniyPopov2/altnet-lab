import type { CSSProperties } from "react";
import type { ResponsiveStyle, Device } from "./types";

/** Определяем брейкпоинт по ширине вьюпорта (примерно как Tailwind md/xl). */
export function deviceFromViewport(w?: number): Device {
  const width =
    typeof w === "number" ? w :
    (typeof window !== "undefined" ? window.innerWidth : 1280);
  if (width >= 1280) return "desktop";
  if (width >= 768) return "tablet";
  return "mobile";
}

/** Строим inline-стили из block.style[device]. */
export function styleInline(style?: ResponsiveStyle, w?: number): CSSProperties {
  const device = deviceFromViewport(w);
  const s = style?.[device] || {};
  const out: CSSProperties = {};
  if (s.padding) out.padding = s.padding as any;
  if (s.margin) out.margin = s.margin as any;
  if (s.radius) out.borderRadius = s.radius as any;
  return out;
}
