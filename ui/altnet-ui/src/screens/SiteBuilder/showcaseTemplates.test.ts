import { describe, expect, it } from "vitest";
import { adaptFromSiteBuilderDoc, exportSingleHtml, unsupportedBlockTypes } from "../../builder/exporter";
import { createSitePackage, verifySitePackage } from "../../core/sites/ipfsSitePackage";
import { SHOWCASE_TEMPLATES, createShowcaseDocument } from "./showcaseTemplates";
import { importProject, projectsOf, switchProject } from "./projects";
import { validateDraft } from "./storage";
import type { Doc } from "./types";

const pixel = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/ZKkAAAAASUVORK5CYII=";
const documentOf = (spec: typeof SHOWCASE_TEMPLATES[number]) => createShowcaseDocument(spec, pixel, (spec.extraImages ?? []).map(() => pixel));

describe("галерея готовых сайтов", () => {
  it("содержит разные тематики и имена", () => {
    expect(SHOWCASE_TEMPLATES.length).toBeGreaterThanOrEqual(24);
    expect(new Set(SHOWCASE_TEMPLATES.map(item => item.id)).size).toBe(SHOWCASE_TEMPLATES.length);
    expect(new Set(SHOWCASE_TEMPLATES.map(item => item.category)).size).toBe(SHOWCASE_TEMPLATES.length);
  });

  it("содержит отдельные редакционные композиции вместо вариаций одной структуры", () => {
    const featured = SHOWCASE_TEMPLATES.filter(item => item.showcaseStyle);
    expect(featured.map(item => item.showcaseStyle)).toEqual(["magazine", "cinema", "playful", "future", "dining", "botanical"]);
    const docs = featured.map(documentOf);
    expect(new Set(docs.slice(0, 3).map(doc => doc.blocks.length)).size).toBe(3);
    expect(docs.every(doc => doc.blocks.length > 6)).toBe(true);
  });

  it.each(["art-journal", "film-studio", "future-lab", "season-table", "green-room"])("сохраняет раскрытие изображений в экспорте %s", async id => {
    const spec = SHOWCASE_TEMPLATES.find(item => item.id === id)!;
    const html = await (await exportSingleHtml(adaptFromSiteBuilderDoc(documentOf(spec)), { bundleAssets: true, restrictExternalMedia: true })).text();
    expect(html).toContain("data-lightbox-open");
    expect(html).toContain("script-src 'sha256-");
  });

  it("экспортирует встроенные градиент, маску и переключаемое меню", async () => {
    const future = documentOf(SHOWCASE_TEMPLATES.find(item => item.id === "future-lab")!);
    const design = await (await exportSingleHtml(adaptFromSiteBuilderDoc(future), { bundleAssets: true, restrictExternalMedia: true })).text();
    expect(design).toContain("linear-gradient(125deg");
    expect(design).toContain("clip-path:ellipse(");
    const dining = documentOf(SHOWCASE_TEMPLATES.find(item => item.id === "season-table")!);
    const html = await (await exportSingleHtml(adaptFromSiteBuilderDoc(dining), { bundleAssets: true, restrictExternalMedia: true })).text();
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain("Сезонный продукт, огонь и внимание к деталям.");
  });

  it.each(SHOWCASE_TEMPLATES)("создаёт, сохраняет и безопасно экспортирует «$name»", async spec => {
    const doc = documentOf(spec);
    expect(validateDraft(doc).status).toBe("loaded");
    const model = adaptFromSiteBuilderDoc(doc);
    expect(unsupportedBlockTypes(model)).toEqual([]);
    const html = await (await exportSingleHtml(model, { bundleAssets: true, restrictExternalMedia: true, deterministic: true })).text();
    expect(html).toContain(spec.headline);
    expect(html).toContain(spec.imageAlt);
    expect(html).toContain('id="offer"');
    expect(html).toContain('id="contacts"');
    expect(html).toContain("data:image/png;base64,");
    expect(html).not.toContain('<h1 class="site-title">');
    expect(html).toContain("--bg:" + spec.bg);
    const car = await createSitePackage(spec.name, [{ path: "index.html", title: spec.name, html }]);
    expect((await verifySitePackage(car.car, car.root)).pages[0].html).toContain(spec.headline);
  });

  it("не заменяет исходный проект и даёт независимую редактируемую копию", () => {
    const original: Doc = { title: "Мой проект", blocks: [{ id: "keep", type: "p", text: "Мой текст" }] };
    const spec = SHOWCASE_TEMPLATES[0];
    const made = importProject(original, { name: spec.name, document: createShowcaseDocument(spec, pixel) });
    expect(projectsOf(made).projects).toHaveLength(2);
    expect(switchProject(made, "first").blocks).toEqual(original.blocks);
    const second = importProject(made, { name: spec.name, document: createShowcaseDocument(spec, pixel) });
    expect(projectsOf(second).projects.at(-1)?.name).toBe(spec.name + " (2)");
    expect(second.blocks[0].id).not.toBe(made.blocks[0].id);
    expect(validateDraft(second).status).toBe("loaded");
  });

  it("не принимает внешние или исполняемые адреса изображений", () => {
    for (const input of ["https://example.com/x.png", "data:image/svg+xml;base64,PHN2Zz4=", "javascript:alert(1)"])
      expect(() => createShowcaseDocument(SHOWCASE_TEMPLATES[0], input)).toThrow();
    const featured = SHOWCASE_TEMPLATES.find(item => item.id === "film-studio")!;
    expect(() => createShowcaseDocument(featured, pixel, [pixel, "https://example.com/x.png"])).toThrow();
    expect(() => createShowcaseDocument(featured, pixel, [pixel])).toThrow();
  });

  it("проверяет цвета темы перед вставкой в CSS и не меняет заголовок старых документов", async () => {
    const old = await (await exportSingleHtml(adaptFromSiteBuilderDoc({ title: "Старый сайт", blocks: [] }), { bundleAssets: false })).text();
    expect(old).toContain('<h1 class="site-title">Старый сайт</h1>');
    const hostile = await (await exportSingleHtml(adaptFromSiteBuilderDoc({ title: "Тест", blocks: [], theme: { background: "#fff; color:red", foreground: "url(https://example.invalid)" } }), { bundleAssets: false })).text();
    expect(hostile).toContain("--bg:#0b0d12");
    expect(hostile).toContain("--fg:#e7e9f0");
    expect(hostile).not.toContain("example.invalid");
  });
});
