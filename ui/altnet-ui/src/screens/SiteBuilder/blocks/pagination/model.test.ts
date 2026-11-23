import { describe, expect, it } from "vitest";
import { paginationHref, paginationState } from "./model";

describe("постраничная навигация", () => {
  it("показывает одиночную пропущенную страницу и многоточие для большого разрыва", () => {
    expect(paginationState({ total: 5, current: 3, siblings: 0, boundary: 1 }).pages).toEqual([1, 2, 3, 4, 5]);
    expect(paginationState({ total: 20, current: 10, siblings: 1, boundary: 1 }).pages).toEqual([1, "...", 9, 10, 11, "...", 20]);
  });
  it("ограничивает некорректные размеры и очищает опасные ссылки", () => {
    expect(paginationState({ total: Infinity, current: -1, siblings: 9999 }).total).toBe(1);
    expect(paginationHref("javascript:alert(1)", 1)).toBe("#");
    expect(paginationHref("/page?n=", 3)).toBe("/page?n=3");
  });
});
