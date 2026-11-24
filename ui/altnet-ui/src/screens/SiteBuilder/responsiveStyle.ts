import { asRecord } from "../../core/records";

type Device = "desktop" | "tablet" | "mobile";
type Style = Record<string, unknown>;

function applyLayer(result: Style, value: unknown): Style {
  if (!value || typeof value !== "object" || Array.isArray(value)) return result;
  const layer = value as Style;
  return {
    ...result, ...layer,
    ...(layer.py !== undefined ? { pt: layer.pt ?? layer.py, pb: layer.pb ?? layer.py } : {}),
  };
}

export function resolveResponsiveStyle(base: unknown, byDevice: unknown, device: Device): Style {
  const layers = asRecord(byDevice);
  let result = applyLayer({}, base);
  result = applyLayer(result, layers.desktop);
  if (device !== "desktop") result = applyLayer(result, layers.tablet);
  if (device === "mobile") result = applyLayer(result, layers.mobile);
  return result;
}
