import { describe, expect, it } from "vitest";
import { changeGrid, gridColumnCount, gridCoveredCells, gridTracks, readGridMerges, setGridMerge, splitGridMerge } from "./gridLayout";
import { insertIntoCell, moveToCell } from "./layoutTree";
import { exportDraft, importDraft } from "./storage";

describe("строки и колонки сетки", () => {
  const grid = { id: "grid", type: "grid" as const, cols: 2 as const, items: [], layoutCells: [[{ id: "a", type: "p" as const, text: "Не удалять" }], []], layoutPreset: [2, 1], layoutByBp: { mobile: { mode: "columns" as const, weights: [1, 3] } } };
  it("создаёт и восстанавливает строки с вложенными виджетами и адаптивными пропорциями", () => {
    const after = { ...grid, ...changeGrid(grid, "add-row") } as typeof grid & { layoutColumns: number };
    expect(after.layoutCells).toHaveLength(4);
    expect(gridColumnCount(after)).toBe(2);
    expect(gridTracks(after, "desktop")).toEqual([2, 1]);
    expect(gridTracks(after, "mobile")).toEqual([1, 3]);
    const doc = { title: "Страница", blocks: [after] };
    expect(importDraft(JSON.parse(exportDraft(doc)))).toEqual({ status: "loaded", doc });
    expect(grid.layoutCells).toHaveLength(2);
  });
  it("добавляет и удаляет колонку во всех строках, сохраняя порядок ячеек", () => {
    const withRow = { ...grid, ...changeGrid(grid, "add-row") };
    const expanded = { ...withRow, ...changeGrid(withRow, "add-column") };
    expect(gridColumnCount(expanded)).toBe(3);
    expect(expanded.layoutCells).toHaveLength(6);
    expect(expanded.layoutCells[0][0].id).toBe("a");
    expect(gridTracks(expanded, "mobile")).toEqual([1, 3, 1]);
    const restored = { ...expanded, ...changeGrid(expanded, "remove-column") };
    expect(restored.layoutCells).toEqual(withRow.layoutCells);
    expect(gridTracks(restored, "desktop")).toEqual([2, 1]);
  });
  it("запрещает удаление занятых ячеек, последнего ряда и превышение лимита", () => {
    const block = { ...grid, layoutColumns: 2, layoutCells: [[], [], [{ id: "busy" }], []] };
    expect(changeGrid(block, "remove-row")).toBeNull();
    expect(changeGrid({ ...block, layoutCells: [[], [{ id: "busy" }], [], []] }, "remove-column")).toBeNull();
    expect(changeGrid(grid, "remove-row")).toBeNull();
    expect(changeGrid({ layoutColumns: 2, layoutCells: Array.from({ length: 64 }, () => []) }, "add-row")).toBeNull();
  });
  it("не доверяет неверному числу колонок в старом или повреждённом документе", () => {
    expect(gridColumnCount({ layoutColumns: 3, layoutCells: [[], [], [], []] })).toBe(4);
  });
  it("объединяет и разделяет прямоугольные области без потери содержимого", () => {
    const initial = { ...grid, layoutColumns: 2, layoutCells: [grid.layoutCells[0], [], [], []], layoutPreset: [2, 1, 2, 1] };
    const merged = { ...initial, ...setGridMerge(initial, 0, 2, 2) };
    expect(readGridMerges(merged)).toEqual([{ start: 0, columns: 2, rows: 2 }]);
    expect([...gridCoveredCells(merged)]).toEqual([1, 2, 3]);
    expect(merged.layoutCells[0][0].id).toBe("a");
    expect(changeGrid(merged, "remove-row")).toBeNull();
    expect(changeGrid(merged, "remove-column")).toBeNull();
    expect(splitGridMerge(merged, 0)).toEqual({ layoutMerges: [] });
    expect(initial.layoutCells).toHaveLength(4);
  });
  it("не объединяет занятые ячейки или пересекающиеся области", () => {
    const initial = { ...grid, layoutColumns: 2, layoutCells: [grid.layoutCells[0], [], [], [{ id: "busy" }]] };
    expect(setGridMerge(initial, 0, 2, 2)).toBeNull();
    const first = { ...initial, ...setGridMerge(initial, 0, 2, 1) };
    expect(setGridMerge(first, 1, 1, 2)).toBeNull();
    expect(setGridMerge(first, 2, 2, 1)).toBeNull();
  });
  it("обновляет координаты объединений при добавлении колонок", () => {
    const initial = { ...grid, layoutColumns: 2, layoutCells: [[], [], grid.layoutCells[0], []], layoutPreset: [2, 1, 2, 1] };
    const merged = { ...initial, ...setGridMerge(initial, 2, 2, 1) };
    const expanded = { ...merged, ...changeGrid(merged, "add-column") };
    expect(readGridMerges(expanded)).toEqual([{ start: 3, columns: 2, rows: 1 }]);
    expect(expanded.layoutCells[3][0].id).toBe("a");
    expect(readGridMerges({ ...expanded, ...changeGrid(expanded, "remove-column") })).toEqual(readGridMerges(merged));
  });
  it("не скрывает данные при повреждённом объединении и не вставляет в поглощённую ячейку", () => {
    const invalid = { ...grid, layoutMerges: [{ start: 0, columns: 2, rows: 1 }], layoutCells: [grid.layoutCells[0], [{ id: "busy" }]] };
    expect(readGridMerges(invalid)).toBeNull();
    expect(gridCoveredCells(invalid).size).toBe(0);
    expect(changeGrid(invalid, "add-row")).toBeNull();
    const merged = { ...grid, layoutMerges: [{ start: 0, columns: 2, rows: 1 }] };
    const blocks = [merged];
    const incoming = { id: "incoming", type: "p" as const, text: "Входящий" };
    expect(insertIntoCell(blocks, "grid", 1, incoming)).toBe(blocks);
    const withRoot = [...blocks, incoming];
    expect(moveToCell(withRoot, "incoming", "grid", 1)).toBe(withRoot);
  });
});
