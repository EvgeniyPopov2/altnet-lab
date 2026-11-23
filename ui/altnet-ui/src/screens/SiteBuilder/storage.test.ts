import { describe, expect, it } from "vitest";
import { exportDraft, importDraft, loadDraft, INDEXED_DB_MARKER, STORAGE_KEY } from "./storage";

describe("восстановление черновика конструктора", () => {
  it("отличает указатель большого документа от повреждённого черновика", () => {
    expect(loadDraft({ getItem: () => INDEXED_DB_MARKER })).toEqual({ status: "indexeddb" });
    expect(loadDraft({ getItem: () => '{"format":"altnet.sitebuilder.indexeddb","version":2}' })).toEqual({ status: "unavailable" });
  });
  it("восстанавливает виджеты внутри выезжающей панели", () => {
    const doc = { title: "Страница", blocks: [{ id: "drawer", type: "offcanvas" as const, layoutPreset: [1], layoutCells: [[{ id: "nested", type: "p" as const, text: "Текст" }]] }] };
    expect(importDraft(JSON.parse(exportDraft(doc)))).toEqual({ status: "loaded", doc });
    const bad = { ...doc, blocks: [{ ...doc.blocks[0], layoutCells: [[], []] }] };
    expect(importDraft({ format: "altnet.sitebuilder.document", version: 1, document: bad })).toEqual({ status: "unavailable" });
  });
  it("восстанавливает все данные, включая дополнительные поля блоков", () => {
    const doc = { title: "Мой сайт", blocks: [{ id: "a", type: "h1", text: "Привет", styleByBp: { mobile: { fs: 12 } } }], theme: { accent: "#123456" } };
    const storage = { getItem: (key: string) => key === STORAGE_KEY ? JSON.stringify(doc) : null };
    expect(loadDraft(storage)).toEqual({ status: "loaded", doc });
  });
  it("начинает новый документ только при отсутствии черновика", () => {
    expect(loadDraft({ getItem: () => null })).toEqual({ status: "empty" });
  });
  it.each(["{", "null", "{}", '{"title":"A","blocks":[{"id":"a","type":"p"},{"id":"a","type":"p"}]}'])(
    "защищает повреждённый или неоднозначный черновик %s",
    (raw) => expect(loadDraft({ getItem: () => raw })).toEqual({ status: "unavailable" }),
  );
  it("сообщает о недоступном хранилище", () => {
    expect(loadDraft({ getItem: () => { throw new Error("denied"); } })).toEqual({ status: "unavailable" });
  });
  it("сохраняет в JSON все блоки, скрытые элементы и адаптивные настройки", () => {
    const doc = { title: "Страница", blocks: [
      { id: "a", type: "accordion" as const, hidden: true, items: [], styleByBp: { mobile: { fs: 12 } } },
      { id: "b", type: "heading" as const, text: "Заголовок", level: "h2" as const },
    ], theme: { accent: "#112233" }, ogImage: "ipfs://image" };
    expect(importDraft(JSON.parse(exportDraft(doc)))).toEqual({ status: "loaded", doc });
  });
  it("отклоняет неизвестную версию документа", () => {
    expect(importDraft({ format: "altnet.sitebuilder.document", version: 2, document: { title: "x", blocks: [] } })).toEqual({ status: "unavailable" });
  });
  it("восстанавливает вложенные ячейки и отклоняет повторяющиеся идентификаторы в дереве", () => {
    const doc = { title: "Страница", blocks: [{ id: "container", type: "grid" as const, cols: 2 as const, items: [], layoutPreset: [2, 1], layoutCells: [[{ id: "nested", type: "h1" as const, text: "Текст" }], []] }] };
    expect(importDraft(JSON.parse(exportDraft(doc)))).toEqual({ status: "loaded", doc });
    const bad = { ...doc, blocks: [...doc.blocks, { id: "nested", type: "h1", text: "Дубликат" }] };
    expect(importDraft({ format: "altnet.sitebuilder.document", version: 1, document: bad })).toEqual({ status: "unavailable" });
  });
  it("сохраняет содержимое контейнера", () => {
    const doc = { title: "Страница", blocks: [{ id: "c", type: "container" as const, layoutPreset: [1], layoutCells: [[{ id: "p", type: "p" as const, text: "Текст" }]] }] };
    expect(importDraft(JSON.parse(exportDraft(doc)))).toEqual({ status: "loaded", doc });
  });
  it("отклоняет чрезмерно глубокое меню до отображения документа", () => {
    let item: Record<string, unknown> = { label: "Конец", href: "#" };
    for (let i = 0; i < 66; i++) item = { label: "Пункт", href: "#", children: [item] };
    const value = { format: "altnet.sitebuilder.document", version: 1, document: { title: "Меню", blocks: [{ id: "menu", type: "menu", items: [item] }] } };
    expect(importDraft(value)).toEqual({ status: "unavailable" });
  });
});
