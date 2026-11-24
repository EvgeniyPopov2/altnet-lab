import { describe, expect, it } from "vitest";
import { exportSingleHtml, adaptFromSiteBuilderDoc } from "../../builder/exporter";
import { promoteStyle, withStyleClasses, reorderStyleClass, removeStyleClass, validStyleClasses } from "./styleClasses";
import { addPage, switchPage } from "./pages";
import { addProject, switchProject } from "./projects";
import { activePageForBuild } from "./siteTemplates";
import { validateDraft } from "./storage";
import type { Block, Doc, StyleClass } from "./types";

const sample: Doc = {
  title: "Журнал",
  blocks: [
    { id: "article", type: "p", text: "Статья", styleByBp: { desktop: { tc: "#111111", fs: 40 }, mobile: { fs: 20 } } },
  ],
};
const first = () => promoteStyle(sample, "article", "article-title", "class-a");
describe("общие классы оформления", () => {
  it("переносит локальные размеры и цвет в класс сайта без изменения исходника", () => {
    const doc = first();
    expect(doc.blocks[0].styleByBp).toBeUndefined();
    expect(doc.blocks[0].styleClassIds).toEqual(["class-a"]);
    expect(sample.blocks[0].styleByBp?.mobile?.fs).toBe(20);
    expect(validateDraft(doc).status).toBe("loaded");
    expect(promoteStyle(doc, "article", "article-title", "class-b")).toBe(doc);
    expect(promoteStyle(sample, "article", "bad name", "class-b")).toBe(sample);
  });
  it("вычисляет приоритеты классов и сохраняет локальные переопределения при смене экрана", () => {
    const a: StyleClass = {
      id: "one",
      name: "one",
      layers: { desktop: { tc: "#111", pt: 2 }, mobile: { tc: "#222" } },
    };
    const b: StyleClass = { id: "two", name: "two", layers: { desktop: { tc: "#333", pt: 4 } } };
    const block: Block = {
      id: "p",
      type: "p",
      text: "Текст",
      className: "custom",
      styleClassIds: ["two", "one"],
      styleByBp: { desktop: { pt: 8 } },
    };
    const doc: Doc = { title: "Страница", blocks: [block], styleClasses: [a, b] };
    const merged = withStyleClasses(block, doc.styleClasses!);
    expect(merged.styleByBp?.mobile).toMatchObject({ tc: "#333", pt: 8 });
    expect(merged.className).toBe("custom sb-global-one sb-global-two");
    expect(withStyleClasses(block, reorderStyleClass(doc, "one", 1).styleClasses!).styleByBp?.mobile).toMatchObject({
      tc: "#222",
      pt: 8,
    });
  });
  it("обновляет публикацию на каждой странице и сохраняет изоляцию проектов", async () => {
    const doc = first(),
      other = addPage(doc, "Вторая");
    const next = {
      ...other,
      blocks: [{ id: "second", type: "p" as const, text: "Вторая", styleClassIds: ["class-a"] }],
      styleClasses: [{ ...doc.styleClasses![0], name: "title", layers: { desktop: { tc: "#aa00bb" } } }],
    };
    const home = switchPage(next, "home");
    for (const page of [home, next]) {
      const html = await (
        await exportSingleHtml(adaptFromSiteBuilderDoc(activePageForBuild(page)), { bundleAssets: false })
      ).text();
      expect(html).toContain("sb-global-title");
      expect(html).toContain("color:#aa00bb");
    }
    expect(home.sitePages!.pages.filter((p) => p.document).every((p) => !("styleClasses" in p.document!))).toBe(true);
    const newProject = addProject(home, "Другой");
    expect(newProject.styleClasses).toBeUndefined();
    expect(switchProject(newProject, "first").styleClasses).toEqual(home.styleClasses);
    const removed = removeStyleClass(home, "class-a");
    expect(removed.blocks[0].styleClassIds).toBeUndefined();
    expect(switchPage(removed, next.sitePages!.activeId).blocks[0].styleClassIds).toBeUndefined();
  });
  it("проверяет имена, уникальность, типы значений и ссылки черновиков", () => {
    const rule = { id: "one", name: "brand", layers: { mobile: { fs: 18 } } };
    expect(validStyleClasses([rule, rule])).toBe(false);
    expect(validStyleClasses([{ ...rule, layers: { bad: {} } }])).toBe(false);
    expect(validStyleClasses([{ ...rule, layers: { mobile: { fs: {} } } }])).toBe(false);
    expect(validateDraft({ ...sample, blocks: [{ ...sample.blocks[0], styleClassIds: [null] }] }).status).toBe(
      "unavailable"
    );
  });
});
