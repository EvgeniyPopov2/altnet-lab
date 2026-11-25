import { describe, expect, it } from "vitest";
import { BOOKMARKS_KEY, bookmarksKey, copyLegacyBookmarks, readBookmarks, toggleBookmark } from "./browserBookmarks";

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

  it("разделяет профили и копирует прежние закладки только по явному запросу", () => {
    const entries = new Map<string, string>();
    const storage = { getItem: (key: string) => entries.get(key) ?? null, setItem: (key: string, value: string) => { entries.set(key, value); } };
    toggleBookmark(storage, "site/old", "Старая", 1);
    const original = entries.get(BOOKMARKS_KEY);
    toggleBookmark(storage, "site/anon", "Анонимная", 2, "anon");
    toggleBookmark(storage, "site/fast", "Быстрая", 3, "fast");
    expect(readBookmarks(storage, "anon").map(item => item.title)).toEqual(["Анонимная"]);
    expect(readBookmarks(storage, "fast").map(item => item.title)).toEqual(["Быстрая"]);
    expect(copyLegacyBookmarks(storage, "anon").map(item => item.title)).toEqual(["Анонимная", "Старая"]);
    expect(copyLegacyBookmarks(storage, "anon")).toHaveLength(2);
    expect(readBookmarks(storage, "fast")).toHaveLength(1);
    expect(entries.get(BOOKMARKS_KEY)).toBe(original);
    expect(bookmarksKey("anon")).not.toBe(bookmarksKey("fast"));
    expect(() => readBookmarks(storage, "" as never)).toThrow("Неизвестный профиль");
    entries.set(BOOKMARKS_KEY, "{broken");
    const before = entries.get(bookmarksKey("fast"));
    expect(() => copyLegacyBookmarks(storage, "fast")).toThrow();
    expect(entries.get(bookmarksKey("fast"))).toBe(before);
  });

  it("не перезаписывает профиль, если объединение не помещается или список повреждён", () => {
    const items = Array.from({ length: 200 }, (_, index) => ({ url: `alt://site/site-${index}`, title: "Сайт", createdAt: index }));
    const entries = new Map<string, string>([
      [BOOKMARKS_KEY, JSON.stringify([{ url: "alt://site/extra", title: "Ещё", createdAt: 1 }])],
      [bookmarksKey("anon"), JSON.stringify(items)],
      [bookmarksKey("fast"), "{broken"],
    ]);
    const storage = { getItem: (key: string) => entries.get(key) ?? null, setItem: (key: string, value: string) => { entries.set(key, value); } };
    const before = entries.get(bookmarksKey("anon"));
    expect(() => copyLegacyBookmarks(storage, "anon")).toThrow("200");
    expect(entries.get(bookmarksKey("anon"))).toBe(before);
    expect(() => copyLegacyBookmarks(storage, "fast")).toThrow();
    expect(entries.get(bookmarksKey("fast"))).toBe("{broken");
  });
});
