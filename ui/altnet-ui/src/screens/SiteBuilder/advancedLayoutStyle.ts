import { oneOf } from "../../core/records";
import { lengthUnits, sides } from "./boxDimensions";

/** Проверенные CSS-свойства для холста и экспорта. */
export function advancedLayoutStyle(style: Record<string, unknown>): Record<string, string | number> {
  const result: Record<string, string | number> = {};
  if (oneOf(style.overflowMode, ["visible", "hidden", "clip", "auto", "scroll"])) result.overflow = style.overflowMode;
  if (oneOf(style.mouseCursor, ["auto", "default", "pointer", "text", "grab", "zoom-in", "zoom-out"])) result.cursor = style.mouseCursor;
  if (oneOf(style.stackingIsolation, ["auto", "isolate"])) result.isolation = style.stackingIsolation;
  if (style.positionMode === "relative") {
    result.position = "relative";
    const unit = oneOf(style.positionUnit, lengthUnits) ? style.positionUnit : "px";
    for (const [key, side] of sides) {
      const value = style["position" + key.toUpperCase()];
      if (typeof value === "number" && Number.isFinite(value)) {
        result[side.toLowerCase()] = Math.max(-5000, Math.min(5000, value)) + unit;
      }
    }
  } else if (style.positionMode === "normal") {
    result.position = "static";
  }
  if (typeof style.layerOrder === "number" && Number.isInteger(style.layerOrder) && style.layerOrder >= -9999 && style.layerOrder <= 9999) {
    if (style.positionMode !== "normal") result.position = "relative";
    result.zIndex = style.layerOrder;
  }
  return result;
}
