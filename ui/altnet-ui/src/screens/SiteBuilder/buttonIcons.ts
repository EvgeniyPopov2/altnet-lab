/** Локальный перечень: данные SVG не принимаются из документа или сети. */
export const buttonIcons = [
  ["arrow-right", "Стрелка вправо"], ["arrow-left", "Стрелка влево"],
  ["arrow-up", "Стрелка вверх"], ["arrow-down", "Стрелка вниз"],
  ["download", "Скачать"], ["external", "Внешняя ссылка"], ["send", "Отправить"],
  ["plus", "Плюс"], ["check", "Галочка"], ["star", "Звезда"], ["heart", "Сердце"],
] as const;

const paths: Record<string, string> = {
  "arrow-right": "M5 12h14 M12 5l7 7-7 7",
  "arrow-left": "M19 12H5 M12 19l-7-7 7-7",
  "arrow-up": "M12 19V5 M5 12l7-7 7 7",
  "arrow-down": "M12 5v14 M19 12l-7 7-7-7",
  download: "M12 3v12 M7 10l5 5 5-5 M4 17v3h16v-3",
  external: "M13 5h6v6 M19 5l-9 9 M19 13v6H5V5h6",
  send: "M22 2L11 13 M22 2l-7 20-4-9-9-4 20-7z",
  plus: "M12 5v14 M5 12h14",
  check: "M5 12l4 4L19 6",
  star: "M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z",
  heart: "M20.8 4.6a5.5 5.5 0 0 0-7.8 0l-1 1-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z",
};

export function buttonIconPath(name: unknown): string | undefined {
  return typeof name === "string" && Object.hasOwn(paths, name) ? paths[name] : undefined;
}
