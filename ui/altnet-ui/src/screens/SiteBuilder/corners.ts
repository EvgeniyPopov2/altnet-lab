import { asRecord } from "../../core/records";
import type { Device } from "./types";

export const corners = [
  ["TopLeft", "Верхний левый"],
  ["TopRight", "Верхний правый"],
  ["BottomRight", "Нижний правый"],
  ["BottomLeft", "Нижний левый"],
] as const;
export type WidgetState = "normal" | "hover" | "active";
export function stateKey(state: WidgetState, key: string) {
  return state === "normal" ? key : state + key[0].toUpperCase() + key.slice(1);
}
export type CornerSettings = Partial<
  Record<
    | `radius${(typeof corners)[number][0]}`
    | `hoverRadius${(typeof corners)[number][0]}`
    | `activeRadius${(typeof corners)[number][0]}`,
    number
  >
> &
  Partial<Record<"radiusUnit" | "hoverRadiusUnit" | "activeRadiusUnit", "px" | "%">>;

/** На меньшем экране общий радиус заменяет все углы предыдущего размера. */
export function cornerStyles(layers: unknown, device: Device, state: WidgetState, limit: number) {
  const values = new Map<string, number>();
  let unit = "px";
  for (const bp of ["desktop", "tablet", "mobile"] as const) {
    const layer = asRecord(asRecord(layers)[bp]);
    const scalar = layer[stateKey(state, "radius")];
    const nextUnit = layer[stateKey(state, "radiusUnit")];
    if (nextUnit === "px" || nextUnit === "%") unit = nextUnit;
    if (typeof scalar === "number" && Number.isFinite(scalar)) {
      values.clear();
      values.set("borderRadius", scalar);
    }
    for (const [corner] of corners) {
      const value = layer[stateKey(state, "radius" + corner)];
      if (typeof value === "number" && Number.isFinite(value)) values.set("border" + corner + "Radius", value);
    }
    if (bp === device) break;
  }
  return Object.fromEntries(Array.from(values, ([key, n]) => [key, Math.max(0, Math.min(limit, n)) + unit]));
}
