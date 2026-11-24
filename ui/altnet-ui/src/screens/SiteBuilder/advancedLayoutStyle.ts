import { oneOf } from "../../core/records";

/** Проверенные CSS-свойства для холста и экспорта. */
export function advancedLayoutStyle(style: Record<string, unknown>): Record<string, string | number> {
  const result: Record<string, string | number> = {};
  if (oneOf(style.overflowMode, ["visible", "hidden", "clip", "auto", "scroll"])) result.overflow = style.overflowMode;
  if (oneOf(style.mouseCursor, ["auto", "default", "pointer", "text", "grab", "zoom-in", "zoom-out"])) result.cursor = style.mouseCursor;
  if (oneOf(style.stackingIsolation, ["auto", "isolate"])) result.isolation = style.stackingIsolation;
  if (typeof style.layerOrder === "number" && Number.isInteger(style.layerOrder) && style.layerOrder >= -9999 && style.layerOrder <= 9999) {
    result.position = "relative";
    result.zIndex = style.layerOrder;
  }
  return result;
}
