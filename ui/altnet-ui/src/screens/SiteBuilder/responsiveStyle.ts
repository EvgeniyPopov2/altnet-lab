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

export function resolveResponsiveStyle(base: unknown, byDevice: any, device: Device): Style {
  let result = applyLayer({}, base);
  result = applyLayer(result, byDevice?.desktop);
  if (device !== "desktop") result = applyLayer(result, byDevice?.tablet);
  if (device === "mobile") result = applyLayer(result, byDevice?.mobile);
  return result;
}
