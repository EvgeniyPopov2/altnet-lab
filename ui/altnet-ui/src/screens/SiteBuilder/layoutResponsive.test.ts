import { describe, expect, it } from "vitest";
import { resolveGridGaps, resolveLayout } from "./layoutResponsive";

describe("адаптивная сетка", () => {
  const block = { layoutCells: [[], []], layoutPreset: [2, 1], layoutGap: 20, layoutByBp: { tablet: { mode: "stack" as const, weights: [1, 3], gap: 8 }, mobile: { mode: "columns" as const } } };
  it("наследует пропорции и сохраняет независимое расположение экранов", () => {
    expect(resolveLayout(block, "desktop")).toEqual({ mode: "columns", weights: [2, 1], gap: 20 });
    expect(resolveLayout(block, "tablet")).toEqual({ mode: "stack", weights: [1, 3], gap: 8 });
    expect(resolveLayout(block, "mobile")).toEqual({ mode: "columns", weights: [1, 3], gap: 8 });
  });
  it("проверяет пропорции и по умолчанию складывает колонки на телефоне", () => {
    expect(resolveLayout({ layoutCells: [[], []], layoutPreset: [999, 2] }, "mobile")).toEqual({ mode: "stack", weights: [1, 2], gap: 16 });
  });
  it("независимо наследует расстояния по двум осям и учитывает старые настройки", () => {
    const grid = { layoutGap: 12, layoutGapX: 24, layoutByBp: { tablet: { gap: 8, gapY: 20 }, mobile: { gapX: 4 } } };
    expect(resolveGridGaps(grid, "desktop")).toEqual({ x: 24, y: 12 });
    expect(resolveGridGaps(grid, "tablet")).toEqual({ x: 8, y: 20 });
    expect(resolveGridGaps(grid, "mobile")).toEqual({ x: 4, y: 20 });
    expect(resolveGridGaps({ layoutGapX: -1, layoutGapY: Infinity }, "desktop")).toEqual({ x: 16, y: 16 });
  });
});
