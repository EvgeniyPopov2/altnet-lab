import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { addPage, allPageDocuments, pagesOf, removePage, renamePagePath, switchPage } from "./pages";
import { exportDraft, importDraft, validateDraft } from "./storage";
import { exportPagesZip } from "./exportPages";
import type { Doc } from "./types";

const original: Doc = { title: "Главная", description: "Описание", blocks: [{ id: "heading", type: "h1", text: "Начало" }] };

describe("страницы сайта", () => {
  it("без миграции открывает прежний документ как главную страницу", () => {
    expect(pagesOf(original).pages).toEqual([{ id: "home", path: "index.html" }]);
    expect(original.sitePages).toBeUndefined();
  });
  it("сохраняет содержимое, настройки и имена при переключении, импорте и удалении", () => {
    const added = addPage(original, "Контакты");
    const second = pagesOf(added).activeId;
    const edited: Doc = { ...added, blocks: [{ id: "email", type: "p", text: "Почта" }] };
    const home = switchPage(edited, "home");
    expect(home.blocks).toEqual(original.blocks);
    expect(home.description).toBe("Описание");
    const loaded = importDraft(JSON.parse(exportDraft(home)));
    expect(loaded.status).toBe("loaded");
    if (loaded.status !== "loaded") return;
    const restored = switchPage(loaded.doc, second);
    expect(restored.blocks).toEqual(edited.blocks);
    expect(removePage(restored, second).blocks).toEqual(original.blocks);
    expect(removePage(home, "home")).toBe(home);
  });
  it("дублирует содержимое и не допускает одинаковых или небезопасных адресов", () => {
    const copy = addPage(original, "Копия", true);
    expect(copy.blocks).toEqual(original.blocks);
    const second = addPage(copy, "Копия", true);
    expect(allPageDocuments(second).map(page => page.path)).toEqual(["index.html", "kopiya.html", "kopiya-2.html"]);
    const id = pagesOf(second).activeId;
    expect(renamePagePath(second, id, "kopiya.html")).toBe(second);
    expect(renamePagePath(second, id, "../escape.html")).toBe(second);
    expect(renamePagePath(second, id, "about.html").sitePages?.pages.at(-1)?.path).toBe("about.html");
    expect(renamePagePath(second, "home", "other.html")).toBe(second);
  });
  it("отклоняет повреждённые неактивные страницы и неоднозначные адреса", () => {
    const doc = addPage(original, "Другая");
    const workspace = pagesOf(doc);
    const badPage = { ...doc, sitePages: { ...workspace, pages: workspace.pages.map(page => page.id === "home" ? { ...page, document: { title: "bad", blocks: [{ id: "same", type: "p" }, { id: "same", type: "p" }] } } : page) } };
    expect(validateDraft(badPage).status).toBe("unavailable");
    expect(validateDraft({ ...doc, sitePages: { ...workspace, pages: workspace.pages.map(page => ({ ...page, path: "index.html" })) } }).status).toBe("unavailable");
    expect(validateDraft({ ...doc, sitePages: { ...workspace, activeId: "missing" } }).status).toBe("unavailable");
    expect(validateDraft({ ...doc, sitePages: { ...workspace, version: 2 } }).status).toBe("unavailable");
  });
  it("обновляет ссылки на переименованную страницу во всех страницах, сохраняя текст и HTML", () => {
    const home: Doc = { title: "Главная", blocks: [
      { id: "button", type: "btn", label: "./kontakty.html", href: "./kontakty.html#address" },
      { id: "menu", type: "menu", items: [{ id: "item", label: "Раздел", href: "#", children: [{ id: "child", label: "Контакты", href: "./kontakty.html" }] }] },
      { id: "html", type: "html", html: '<a href="./kontakty.html">Ручной HTML</a>' },
      { id: "other", type: "btn", label: "Другая", href: "./kontakty.html-extra" },
    ] };
    const active = addPage(home, "Контакты");
    const withLink: Doc = { ...active, blocks: [{ id: "cta", type: "cta", btnHref: "./kontakty.html" }] };
    const renamed = renamePagePath(withLink, pagesOf(withLink).activeId, "about.html");
    expect(renamed.blocks[0]).toMatchObject({ btnHref: "./about.html" });
    const restored = switchPage(renamed, "home");
    expect(restored.blocks[0]).toMatchObject({ label: "./kontakty.html", href: "./about.html#address" });
    expect(restored.blocks[1]).toMatchObject({ items: [{ children: [{ href: "./about.html" }] }] });
    expect(restored.blocks[2]).toMatchObject({ html: '<a href="./kontakty.html">Ручной HTML</a>' });
    expect(restored.blocks[3]).toMatchObject({ href: "./kontakty.html-extra" });
    expect(validateDraft(renamed).status).toBe("loaded");
  });
  it("экспортирует все страницы в ZIP с корректным содержимым и ссылками", async () => {
    const next = addPage(original, "Контакты");
    const second: Doc = { ...next, blocks: [{ id: "link", type: "btn", label: "На главную", href: "./index.html" }] };
    const blob = await exportPagesZip(second);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    expect(await zip.file("index.html")?.async("string")).toContain("Начало");
    expect(await zip.file("kontakty.html")?.async("string")).toContain('href="./index.html"');
    expect(JSON.parse((await zip.file("manifest.json")?.async("string"))!).pages).toHaveLength(2);
  });
  it("не создаёт неполный ZIP, если виджет одной из страниц не поддерживается", async () => {
    const invalid = addPage({ ...original, blocks: [{ id: "map", type: "map", lat: 1, lon: 2 }] }, "Вторая");
    await expect(exportPagesZip(invalid)).rejects.toThrow("неподдерживаемые виджеты");
  });
  it("включает в sitemap только индексируемые страницы с безопасным каноническим адресом", async () => {
    const home: Doc = { ...original, seo: { canonical: "https://example.org/?a=1&b=2" } };
    const next = addPage(home, "Закрытая");
    const hidden: Doc = { ...next, seo: { canonical: "https://example.org/private", index: false } };
    const zip = await JSZip.loadAsync(await (await exportPagesZip(hidden)).arrayBuffer());
    const sitemap = await zip.file("sitemap.xml")!.async("string");
    expect(sitemap).toContain("https://example.org/?a=1&amp;b=2");
    expect(sitemap).not.toContain("private");
    expect(sitemap).not.toContain("localhost");
  });
});
