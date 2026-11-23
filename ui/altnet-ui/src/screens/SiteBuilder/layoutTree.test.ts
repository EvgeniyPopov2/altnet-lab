import { describe, expect, it } from "vitest";
import { copyTree, findBlock, insertIntoCell, moveToCell, moveToRoot, removeFromTree, updateBlock } from "./layoutTree";
import type { Block } from "./types";

const heading = (id: string): Block => ({ id, type: "h1", text: id });
const layout = (): Block[] => [
  { id: "outer", type: "grid", cols: 2, items: [], layoutPreset: [1, 1], layoutCells: [
    [heading("a"), { id: "inner", type: "section", layoutPreset: [1], layoutCells: [[heading("b")]] }],
    [heading("c")],
  ] },
  heading("outside"),
];

describe("дерево вложенных элементов", () => {
  it("вставляет и редактирует элемент в глубокой ячейке без изменения исходных данных", () => {
    const original = layout();
    const inserted = insertIntoCell(original, "inner", 0, heading("new"));
    const changed = updateBlock(inserted, "new", block => ({ ...block, text: "Изменено" }) as Block);
    expect(findBlock(original, "new")).toBeUndefined();
    expect(findBlock(changed, "new")).toMatchObject({ text: "Изменено" });
    expect(removeFromTree(changed, "new")).toEqual(original);
  });
  it("перемещает элементы между уровнями и отклоняет циклы", () => {
    const original = layout();
    const moved = moveToCell(original, "outside", "inner", 0, 0);
    expect(moved).toHaveLength(1);
    expect(findBlock(moved, "inner")).toMatchObject({ layoutCells: [[heading("outside"), heading("b")]] });
    expect(moveToCell(original, "outer", "inner", 0)).toBe(original);
    expect(moveToCell(original, "inner", "inner", 0)).toBe(original);
  });
  it("не теряет элемент при неверной позиции или повторном идентификаторе", () => {
    const original = layout();
    expect(moveToCell(original, "outside", "outer", 8)).toBe(original);
    expect(insertIntoCell(original, "outer", 0, heading("a"))).toBe(original);
  });
  it("не разрешает перенос через заблокированный родительский контейнер", () => {
    const original = layout();
    const locked = updateBlock(original, "outer", b => ({ ...b, locked: true }));
    expect(moveToCell(locked, "b", "inner", 0)).toBe(locked);
    expect(moveToCell(locked, "outside", "inner", 0)).toBe(locked);
    expect(moveToRoot(locked, "b", 0)).toBe(locked);
    expect(insertIntoCell(locked, "inner", 0, heading("new"))).toBe(locked);
    expect(removeFromTree(locked, "b")).toBe(locked);
  });
  it("копирует дерево с новыми идентификаторами и переносит вложенный блок на верхний уровень", () => {
    const original = layout();
    let next = 0;
    const copy = copyTree(original[0], () => `copy${++next}`);
    expect(copy.id).not.toBe(original[0].id);
    expect(findBlock([copy], "b")).toBeUndefined();
    const moved = moveToRoot(original, "b", 0);
    expect(moved[0].id).toBe("b");
    expect(findBlock(moved.slice(1), "b")).toBeUndefined();
  });
  it("учитывает место вставки при перемещении внутри одной ячейки", () => {
    const original = layout();
    const moved = moveToCell(original, "a", "outer", 0, 2);
    const outer = findBlock(moved, "outer");
    expect(outer?.type === "grid" && outer.layoutCells?.[0].map(item => item.id)).toEqual(["inner", "a"]);
    const back = moveToCell(moved, "a", "outer", 0, 0);
    expect(back).toEqual(original);
  });
  it("вставляет блоки в обычный контейнер", () => {
    const original: Block[] = [{ id: "container", type: "container", width: "md", layoutPreset: [1], layoutCells: [[]] }];
    const result = insertIntoCell(original, "container", 0, heading("inside"));
    expect(findBlock(result, "inside")).toEqual(heading("inside"));
    expect(findBlock(original, "inside")).toBeUndefined();
  });
});
