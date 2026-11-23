import { describe, expect, it } from "vitest";
import { importLegacyDoc } from "./legacyImport";

describe("импорт прежнего JSON", () => {
  it("сохраняет все поддерживаемые типы, свойства и вложенные блоки", () => {
    const doc = importLegacyDoc({ title: "Сайт", theme: { accent: "#123456" }, customField: "сохранить", blocks: [
      { id: "head", type: "heading", props: { text: "Заголовок", level: "h3", custom: "данные" } },
      { id: "line", type: "divider", props: { width: 60 } },
      { id: "space", type: "spacer", props: { size: "lg" } },
      { id: "grid", type: "grid", props: { layoutWeights: [2, 1], layoutCells: [[{ id: "text", type: "text", props: { text: "Вложенный" } }], []] } },
      { id: "cols", type: "cols2", props: { title: "Свой заголовок", text: "Описание", img: "data:image/png;base64,AAAA" } },
    ] });
    expect(doc.blocks).toHaveLength(5);
    expect(doc).toMatchObject({ title: "Сайт", customField: "сохранить", theme: { accent: "#123456" } });
    expect(doc.blocks[0]).toMatchObject({ id: "head", type: "heading", text: "Заголовок", level: "h3", custom: "данные" });
    expect(doc.blocks[1]).toMatchObject({ id: "line", type: "divider", width: 60 });
    expect(doc.blocks[2]).toMatchObject({ id: "space", type: "spacer", size: "lg" });
    expect(doc.blocks[3]).toMatchObject({ id: "grid", layoutPreset: [2, 1], layoutCells: [[{ id: "text", type: "p", text: "Вложенный" }], []] });
    expect(doc.blocks[4]).toMatchObject({ id: "cols", title: "Свой заголовок", text: "Описание" });
  });
  it("отклоняет неизвестный тип, повторяющиеся ID и повреждённые ячейки", () => {
    expect(() => importLegacyDoc({ blocks: [{ type: "p", id: "ok" }, { type: "unknown-widget" }] })).toThrow("Неизвестный тип блока");
    expect(() => importLegacyDoc({ blocks: [{ type: "p", id: "same" }, { type: "heading", id: "same" }] })).toThrow("повторяющиеся ID");
    expect(() => importLegacyDoc({ blocks: [{ type: "grid", layoutCells: [null] }] })).toThrow("Некорректные ячейки");
    expect(() => importLegacyDoc({ format: "future-format", blocks: [] })).toThrow("Неизвестный формат");
  });
});
