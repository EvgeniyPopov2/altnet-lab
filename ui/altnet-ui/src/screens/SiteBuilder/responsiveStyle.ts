import { asRecord } from "../../core/records";
import { blockCornerKeys } from "./blockCorners";
import { blockBorderKeys } from "./blockBorders";

type Device = "desktop" | "tablet" | "mobile";
type Style = Record<string, unknown>;

export function applyStyleLayer(result: Style, value: unknown): Style {
  if (!value || typeof value !== "object" || Array.isArray(value)) return result;
  const layer = value as Style;
  if (layer.br !== undefined || layer.bw !== undefined) {
    result = { ...result };
    if (layer.br !== undefined) for (const key of blockCornerKeys) delete result[key];
    if (layer.bw !== undefined) for (const key of blockBorderKeys) delete result[key];
  }
  return {
    ...result, ...layer,
    ...(layer.py !== undefined ? { pt: layer.pt ?? layer.py, pb: layer.pb ?? layer.py } : {}),
  };
}

export function resolveResponsiveStyle(base: unknown, byDevice: unknown, device: Device): Style {
  const layers = asRecord(byDevice);
  let result = applyStyleLayer({}, base);
  result = applyStyleLayer(result, layers.desktop);
  if (device !== "desktop") result = applyStyleLayer(result, layers.tablet);
  if (device === "mobile") result = applyStyleLayer(result, layers.mobile);
  return result;
}
