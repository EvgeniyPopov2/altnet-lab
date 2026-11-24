import { asRecord } from "../../core/records";

export const playerFlags = [
  ["visual", "Большая обложка", false],
  ["auto_play", "Начать воспроизведение при открытии", false],
  ["buying", "Кнопка покупки", true],
  ["liking", "Кнопка «Нравится»", true],
  ["download", "Загрузка трека", true],
  ["sharing", "Кнопка «Поделиться»", true],
  ["show_comments", "Комментарии", true],
  ["show_playcount", "Число прослушиваний", true],
  ["show_user", "Имя исполнителя", true],
  ["show_artwork", "Иллюстрация трека", true],
] as const;
export type SoundFlag = (typeof playerFlags)[number][0];
export function soundTrack(value: unknown): string {
  if (typeof value !== "string" || value.length > 2000) return "";
  try {
    const url = new URL(value.trim());
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      !["soundcloud.com", "www.soundcloud.com"].includes(url.hostname)
    )
      return "";
    const path = url.pathname.replace(/\/$/, "");
    if (!/^\/[A-Za-z0-9_-]+\/(?:sets\/)?[A-Za-z0-9_-]+$/.test(path)) return "";
    return "https://soundcloud.com" + path;
  } catch {
    return "";
  }
}
export function soundSettings(value: unknown) {
  const data = asRecord(value),
    flags = asRecord(data.flags),
    track = soundTrack(data.track);
  const color = typeof data.color === "string" && /^#[0-9a-f]{6}$/i.test(data.color) ? data.color : "#714df0";
  const params = new URLSearchParams({ url: track, color, single_active: "true" });
  const options = {} as Record<SoundFlag, boolean>;
  for (const [key, , initial] of playerFlags) {
    options[key] = typeof flags[key] === "boolean" ? flags[key] : initial;
    params.set(key, String(options[key]));
  }
  return {
    track,
    color,
    flags: options,
    label: typeof data.label === "string" && data.label.trim() ? data.label.trim() : "SoundCloud",
    height: options.visual ? 400 : 166,
    embed: track ? "https://w.soundcloud.com/player/?" + params.toString() : "",
  };
}
