import { describe, expect, it } from "vitest";
import { BOOKMARKS_KEY, readBookmarks, toggleBookmark } from "./browserBookmarks";

function memoryStorage(initial: string | null = null) {
  let value = initial;
  return { getItem: () => value, setItem: (_key: string, next: string) => { value = next; }, raw: () => value };
}

describe("локальные закладки", () => {
  it("добавляет страницу, сохраняет её между чтениями и удаляет по точному адресу", () => {
    const storage = memoryStorage();
    toggleBookmark(storage, "site/demo/about.html#team", "Команда", 123);
    expect(readBookmarks(storage)).toEqual([{ url: "alt://site/demo/about.html#team", title: "Команда", createdAt: 123 }]);
    toggleBookmark(storage, "alt://site/demo", "Главная", 124);
    expect(readBookmarks(storage)).toHaveLength(2);
    toggleBookmark(storage, "site/demo/about.html#team", "Команда", 125);
    expect(readBookmarks(storage).map(item => item.url)).toEqual(["alt://site/demo"]);
  });

  it("не перезаписывает повреждённые данные и не сохраняет внешние адреса", () => {
    const storage = memoryStorage("{broken");
    expect(() => toggleBookmark(storage, "alt://site/demo", "Сайт")).toThrow();
    expect(storage.raw()).toBe("{broken");
    expect(() => toggleBookmark(memoryStorage(), "https://example.invalid/", "Сайт")).toThrow();
    expect(BOOKMARKS_KEY).toContain("bookmarks");
  });

  it("не скрывает ошибку хранилища и ограничивает размер списка", () => {
    const denied = { getItem: () => null, setItem: () => { throw new Error("quota"); } };
    expect(() => toggleBookmark(denied, "alt://site/demo", "Сайт")).toThrow("quota");
    const items = Array.from({ length: 200 }, (_, index) => ({ url: `alt://site/site-${index}`, title: "Сайт", createdAt: index }));
    const storage = memoryStorage(JSON.stringify(items));
    expect(() => toggleBookmark(storage, "alt://site/new", "Новый")).toThrow("200");
    expect(readBookmarks(storage)).toHaveLength(200);
  });
});
