import { describe, expect, it } from "vitest";
import { releasesHotkey, type ParsedHotkey } from "./pttHotkey";

describe("отпускание кнопки микрофона", () => {
  const hotkey: ParsedHotkey = { ctrl: true, shift: true, alt: false, meta: false, key: "V" };

  it.each(["v", "V", "Control", "Shift"])("отпускает комбинацию Ctrl+Shift+V при отпускании %s", (key) => {
    expect(releasesHotkey(hotkey, key)).toBe(true);
  });

  it.each(["Alt", "Meta", "X"])("не срабатывает на постороннюю клавишу %s", (key) => {
    expect(releasesHotkey(hotkey, key)).toBe(false);
  });

  it("распознаёт пробел в качестве основной клавиши", () => {
    expect(releasesHotkey({ ...hotkey, key: "Space" }, " ")).toBe(true);
  });
});
