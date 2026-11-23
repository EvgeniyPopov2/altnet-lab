import { describe, expect, it } from "vitest";
import { moveBlockToSlot } from "./slotOrder";

describe("перемещение блока в позицию", () => {
  const blocks = ["a", "b", "c"];
  it("переносит в начало, середину и конец без дубликатов", () => {
    expect(moveBlockToSlot(blocks, 2, 0)).toEqual(["c", "a", "b"]);
    expect(moveBlockToSlot(blocks, 0, 2)).toEqual(["b", "a", "c"]);
    expect(moveBlockToSlot(blocks, 0, 3)).toEqual(["b", "c", "a"]);
  });
  it("не изменяет порядок при пустом перемещении или ошибочной позиции", () => {
    expect(moveBlockToSlot(blocks, 1, 1)).toBe(blocks);
    expect(moveBlockToSlot(blocks, 1, 2)).toBe(blocks);
    expect(moveBlockToSlot(blocks, -1, 0)).toBe(blocks);
    expect(moveBlockToSlot(blocks, 0, 4)).toBe(blocks);
  });
});
