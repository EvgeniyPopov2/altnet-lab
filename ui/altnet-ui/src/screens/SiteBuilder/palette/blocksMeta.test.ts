import { describe, expect, it } from "vitest";
import { groupsWithItems } from "./blocksMeta";

describe("поиск виджетов", () => {
  it("ищет по русскому описанию и названию независимо от регистра", () => {
    expect(groupsWithItems("ЗАГОЛОВОК").flatMap(g => g.items).some(item => item.type === "heading")).toBe(true);
    expect(groupsWithItems("image").flatMap(g => g.items).some(item => item.type === "img")).toBe(true);
  });
  it("возвращает только группы с совпадениями и пустой результат для неизвестного запроса", () => {
    expect(groupsWithItems("текст").every(group => group.items.length > 0)).toBe(true);
    expect(groupsWithItems("такого виджета здесь нет")).toEqual([]);
  });
  it("сохраняет полный набор при пустом запросе", () => {
    expect(groupsWithItems("  ").flatMap(g => g.items)).toEqual(groupsWithItems().flatMap(g => g.items));
  });
  it("не показывает повторяющиеся карточки с одинаковыми идентификаторами", () => {
    const items = groupsWithItems().flatMap(group => group.items);
    expect(new Set(items.map(item => item.id)).size).toBe(items.length);
  });
});
