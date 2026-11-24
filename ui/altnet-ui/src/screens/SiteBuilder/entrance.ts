import { oneOf } from "../../core/records";

export const entranceTypes = ["none", "fade", "up", "down", "left", "right", "zoom-in", "zoom-out"] as const;
export type EntranceType = typeof entranceTypes[number];
export const entranceLabels: Record<EntranceType, string> = {
  none: "Без анимации", fade: "Плавное появление", up: "Снизу вверх", down: "Сверху вниз",
  left: "Слева направо", right: "Справа налево", "zoom-in": "Увеличение", "zoom-out": "Уменьшение",
};
const number = (value: unknown, min: number, max: number, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;

export function entranceSettings(style: Record<string, unknown>) {
  return {
    type: oneOf(style.entranceType, entranceTypes) ? style.entranceType : "none",
    duration: number(style.entranceDuration, 100, 5000, 600),
    delay: number(style.entranceDelay, 0, 5000, 0),
    distance: number(style.entranceDistance, 0, 500, 40),
    repeat: style.entranceRepeat === "repeat",
    opacity: number(style.op, 0, 100, 100) / 100,
  };
}

export function entranceStart(type: EntranceType, distance: number): Keyframe {
  const translate: Partial<Record<EntranceType, string>> = {
    up: `0 ${distance}px`, down: `0 ${-distance}px`, left: `${-distance}px 0`, right: `${distance}px 0`,
  };
  const scale = type === "zoom-in" ? "0.8" : type === "zoom-out" ? "1.2" : undefined;
  return { opacity: 0, ...(translate[type] ? { translate: translate[type] } : {}), ...(scale ? { scale } : {}) };
}
