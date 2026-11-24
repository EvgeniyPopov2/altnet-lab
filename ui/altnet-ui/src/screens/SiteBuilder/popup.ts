import { asRecord, oneOf } from "../../core/records";
import { moreFragment } from "./postExcerpt";
import type { Device } from "./types";

export const popupTriggers = {
  load: "После загрузки",
  scroll: "При прокрутке",
  anchor: "При появлении элемента",
  clicks: "После нажатий",
  idle: "При бездействии",
  exit: "При уходе указателя",
};
export type PopupTrigger = keyof typeof popupTriggers;
export type PopupOptions = {
  triggers?: PopupTrigger[];
  delay?: number;
  scroll?: number;
  clicks?: number;
  idle?: number;
  anchor?: string;
  limit?: number;
  devices?: Device[];
  width?: number;
  position?: "center" | "top" | "bottom";
  backdropClose?: boolean;
};
export const popupId = (id: string) => "popup-" + moreFragment(id).slice(5);
export function popupSettings(value: unknown) {
  const p = asRecord(value),
    n = (v: unknown, min: number, max: number, initial: number) =>
      typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : initial;
  return {
    triggers: Array.isArray(p.triggers)
      ? (Object.keys(popupTriggers).filter(
          (k) => p.triggers instanceof Array && p.triggers.includes(k)
        ) as PopupTrigger[])
      : [],
    delay: n(p.delay, 0, 3600, 0),
    scroll: n(p.scroll, 0, 100, 50),
    clicks: n(p.clicks, 1, 100, 2),
    idle: n(p.idle, 1, 3600, 30),
    anchor: typeof p.anchor === "string" && /^[A-Za-z][A-Za-z0-9_-]{0,127}$/.test(p.anchor) ? p.anchor : "",
    limit: n(p.limit, 0, 100, 1),
    width: n(p.width, 200, 1600, 560),
    devices: (["desktop", "tablet", "mobile"] as const).filter(
      (device) => !Array.isArray(p.devices) || p.devices.includes(device)
    ),
    position: oneOf(p.position, ["center", "top", "bottom"]) ? p.position : "center",
    backdropClose: p.backdropClose !== false,
  };
}
