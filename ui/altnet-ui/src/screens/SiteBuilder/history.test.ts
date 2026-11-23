import { describe, expect, it } from "vitest";
import { historyReducer, type DocumentHistory } from "./history";
import type { Doc } from "./types";

const doc: Doc = { title: "Страница", blocks: [{ id: "one", type: "h1", text: "Заголовок" }] };
const start = (): DocumentHistory => ({ past: [], current: doc, future: [] });

describe("история изменений страницы", () => {
  it("отменяет одно перетаскивание ползунка одним действием и отделяет следующие изменения", () => {
    let state = historyReducer(start(), { type: "edit", value: d => ({ ...d, title: "До ползунка" }) });
    for (const title of ["20", "30", "40"]) state = historyReducer(state, { type: "edit", group: "drag-1", value: d => ({ ...d, title }) });
    expect(state.past).toHaveLength(2);
    state = historyReducer(state, { type: "undo" });
    expect(state.current.title).toBe("До ползунка");
    state = historyReducer(state, { type: "redo" });
    state = historyReducer(state, { type: "edit", group: "drag-1", value: d => ({ ...d, title: "50" }) });
    expect(historyReducer(state, { type: "undo" }).current.title).toBe("40");
  });
  it("отменяет удаление и возвращает его с полным содержимым блока", () => {
    const changed = historyReducer(start(), { type: "edit", value: d => ({ ...d, blocks: [] }) });
    const undone = historyReducer(changed, { type: "undo" });
    expect(undone.current).toEqual(doc);
    expect(historyReducer(undone, { type: "redo" }).current.blocks).toEqual([]);
  });

  it("удаляет будущие действия после нового изменения", () => {
    const changed = historyReducer(start(), { type: "edit", value: { ...doc, title: "Первое" } });
    const undone = historyReducer(changed, { type: "undo" });
    const replaced = historyReducer(undone, { type: "edit", value: { ...doc, title: "Второе" } });
    expect(replaced.future).toEqual([]);
    expect(historyReducer(replaced, { type: "redo" }).current.title).toBe("Второе");
  });

  it("ограничивает историю и не добавляет пустое действие", () => {
    let state = start();
    expect(historyReducer(state, { type: "edit", value: d => d })).toBe(state);
    for (let i = 0; i < 45; i++) {
      state = historyReducer(state, { type: "edit", value: d => ({ ...d, title: String(i) }) });
    }
    expect(state.past).toHaveLength(40);
    for (let i = 0; i < 40; i++) state = historyReducer(state, { type: "undo" });
    expect(state.current.title).toBe("4");
    expect(historyReducer(state, { type: "undo" })).toBe(state);
  });
});
