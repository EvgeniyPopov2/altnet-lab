import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { createDefaultBlock } from "./registry";
import { pagesOf, switchPage, addPage } from "./pages";
import {
  activePageForBuild,
  addSiteTemplate,
  insertTemplateCopy,
  pagesForBuild,
  updateSiteTemplate,
} from "./siteTemplates";
import { validTemplate, assignedTemplate } from "./templateRules";
import { validateDraft } from "./storage";
import { exportProject, parseProject } from "./projects";
import { exportPagesZip } from "./exportPages";
import type { Doc, SiteTemplate } from "./types";

const home: Doc = { title: "Главная", blocks: [{ ...createDefaultBlock("p"), text: "Содержимое главной" }] };
const rule: SiteTemplate = { kind: "header", enabled: true, priority: 5 };
describe("общие шаблоны сайта", () => {
  it("сохраняет активный шаблон, не создаёт для него публичную страницу и применяет изменения ко всему проекту", async () => {
    const contact = addPage(home, "Контакты"),
      second = pagesOf(contact).activeId;
    let template = addSiteTemplate(contact, "Навигация", "header");
    const id = pagesOf(template).activeId;
    template = { ...template, blocks: [{ ...createDefaultBlock("heading"), text: "Общая шапка" }] };
    template = updateSiteTemplate(template, id, { ...rule, exclude: [second] });
    expect(activePageForBuild(template).themeAreas).toBeUndefined();
    expect(validateDraft(template).status).toBe("loaded");
    const restored = parseProject(JSON.parse(exportProject(template))).document;
    expect(pagesForBuild(restored)).toHaveLength(2);
    const zip = await JSZip.loadAsync(await (await exportPagesZip(restored)).arrayBuffer());
    const index = await zip.file("index.html")!.async("string");
    expect(index).toContain('<header class="container" data-site-template="header">');
    expect(index).toContain("Общая шапка");
    expect(await zip.file("kontakty.html")!.async("string")).not.toContain("Общая шапка");
    expect(zip.file("navigatsiya.html")).toBeNull();
    const edited = { ...template, blocks: [{ ...createDefaultBlock("p"), text: "Обновлено" }] };
    expect(activePageForBuild(switchPage(edited, "home")).themeAreas?.header).toMatchObject([{ text: "Обновлено" }]);
  });
  it("точное условие имеет приоритет, исключение и выключенный шаблон учитываются", () => {
    const common = { id: "x", path: "x.html", template: { ...rule, priority: 100 } };
    const specific = { id: "y", path: "y.html", template: { ...rule, include: ["home"], priority: 0 } };
    expect(assignedTemplate([common, specific], "home", "header")?.id).toBe("y");
    expect(
      assignedTemplate(
        [common, { ...specific, template: { ...specific.template, exclude: ["home"] } }],
        "home",
        "header"
      )?.id
    ).toBe("x");
    expect(assignedTemplate([{ ...common, template: { ...rule, enabled: false } }], "home", "header")).toBeUndefined();
    expect(validTemplate({ ...rule, priority: Infinity })).toBe(false);
    expect(validTemplate({ ...rule, include: ["x", "x"] })).toBe(false);
  });
  it("копирует шаблон с новыми ID, включая вложенные блоки, и оставляет оригинал редактируемым", () => {
    const made = addSiteTemplate(home, "Секция", "section"),
      id = pagesOf(made).activeId;
    const block = { ...createDefaultBlock("section", [1]), layoutCells: [[createDefaultBlock("btn")]] };
    const doc = switchPage({ ...made, blocks: [block] }, "home");
    const next = insertTemplateCopy(doc, id);
    expect(next.blocks).toHaveLength(2);
    expect(next.blocks[1].id).not.toBe(block.id);
    const section = next.blocks[1];
    if (section.type !== "section") throw Error("Секция отсутствует");
    expect(section.layoutCells![0][0].id).not.toBe(block.layoutCells[0][0].id);
    expect(validateDraft(next).status).toBe("loaded");
  });
});
