import { describe, expect, it } from "vitest";
import { popupId, popupSettings } from "./popup";
import { activePageForBuild, pagesForBuild } from "./siteTemplates";
import { switchPage } from "./pages";
import { adaptFromSiteBuilderDoc, exportSingleHtml } from "../../builder/exporter";
import type { Doc } from "./types";

const doc: Doc = {
  title: "Главная",
  blocks: [{ type: "btn", id: "open", label: "Контакты", href: "#" + popupId("modal") }],
  sitePages: {
    version: 1,
    activeId: "home",
    pages: [
      { id: "home", path: "index.html" },
      { id: "else", path: "about.html", document: { title: "О нас", blocks: [] } },
      {
        id: "modal",
        path: "modal.html",
        document: { title: "Контакты", blocks: [{ id: "title", type: "p", text: "Связь с редакцией" }] },
        template: {
          kind: "popup",
          enabled: true,
          priority: 3,
          exclude: ["else"],
          popup: { triggers: ["load", "clicks"], clicks: 2, width: 440, position: "bottom", devices: ["desktop"] },
        },
      },
    ],
  },
};
describe("назначение и экспорт Popup", () => {
  it("включает окно только на назначенных страницах и редактирует его как шаблон", () => {
    expect(pagesForBuild(doc).map((page) => page.path)).toEqual(["index.html", "about.html"]);
    expect(activePageForBuild(doc).popups?.[0]).toMatchObject({
      id: popupId("modal"),
      options: { width: 440, triggers: ["load", "clicks"] },
    });
    expect(activePageForBuild(switchPage(doc, "else")).popups).toBeUndefined();
    expect(activePageForBuild(switchPage(doc, "modal")).popups).toBeUndefined();
  });
  it("экспортирует скрытый диалог, привязку ссылки, стили и доступную кнопку закрытия", async () => {
    const html = await (
      await exportSingleHtml(adaptFromSiteBuilderDoc(activePageForBuild(doc)), { bundleAssets: false })
    ).text();
    expect(html).toContain('href="#' + popupId("modal") + '"');
    expect(html).toContain('id="' + popupId("modal") + '"');
    expect(html).toMatch(/<\/main>[\s\S]*<dialog class="sb-popup/);
    expect(html).toContain("Связь с редакцией");
    expect(html).toContain("440px");
    expect(html).toContain("data-popup-close");
    expect(html).not.toContain("unknown-widget");
  });
  it("ограничивает интервалы, проценты, ширину, устройства и виды триггеров", () => {
    expect(
      popupSettings({ triggers: ["bad", "exit", "exit"], devices: ["tablet", "bad"], width: 9900, scroll: -5, idle: 0 })
    ).toMatchObject({
      triggers: ["exit"],
      devices: ["tablet"],
      width: 1600,
      scroll: 0,
      idle: 1,
    });
  });
});
