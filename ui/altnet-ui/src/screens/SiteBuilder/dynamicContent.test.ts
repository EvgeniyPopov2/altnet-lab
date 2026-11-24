import { describe, expect, it } from "vitest";
import { adaptFromSiteBuilderDoc, exportSingleHtml, unsupportedBlockTypes } from "../../builder/exporter";
import { contentResolver, bindContent, loopSettings, queryEntries, validEntry } from "./dynamicContent";
import { activePageForBuild } from "./siteTemplates";
import { validateDraft } from "./storage";
import type { Doc, Block } from "./types";

function fixture(): Doc {
  return {
    title: "Журнал",
    blocks: [
      {
        id: "list",
        type: "loopgrid",
        source: "post",
        sort: "date",
        descending: true,
        templateId: "card",
        pageSize: 1,
        filter: true,
        columns: { desktop: 4, mobile: 1 },
      },
    ],
    sitePages: {
      version: 1,
      activeId: "home",
      pages: [
        { id: "home", path: "index.html" },
        {
          id: "a",
          path: "first.html",
          document: {
            title: "Первая",
            description: "События",
            blocks: [],
            entry: { kind: "post", date: "2026-11-01", author: "Анна", terms: ["Новости"], fields: { k: "Один" } },
          },
        },
        {
          id: "b",
          path: "second.html",
          document: {
            title: "Вторая",
            blocks: [],
            entry: { kind: "post", date: "2026-11-10", author: "Борис", terms: ["Фото"], fields: { k: "Два" } },
          },
        },
        {
          id: "card",
          path: "card.html",
          template: { kind: "section", priority: 0, enabled: false },
          document: {
            title: "Карточка",
            blocks: [
              {
                id: "title",
                type: "heading",
                level: "h2",
                text: "Вручную",
                dynamic: { text: { source: "page.title" }, href: { source: "page.url" } },
              },
              { id: "extra", type: "p", text: "Резерв", dynamic: { text: { source: "custom.k", before: "Поле · " } } },
            ],
          },
        },
      ],
    },
  };
}
describe("данные страниц и Loop Grid", () => {
  it("применяет привязки к отдельной карточке и пропускает служебные шаблоны", async () => {
    const doc = fixture();
    expect(validateDraft(doc).status).toBe("loaded");
    const built = activePageForBuild(doc),
      list = built.blocks[0];
    if (list.type !== "loopgrid") throw Error();
    expect(list.cards?.map((c) => c.title)).toEqual(["Вторая", "Первая"]);
    expect(list.cards![0].blocks).toMatchObject([{ text: "Вторая", href: "./second.html" }, { text: "Поле · Два" }]);
    const html = await (await exportSingleHtml(adaptFromSiteBuilderDoc(built), { bundleAssets: false })).text();
    expect(html).toContain('data-loop-size="1"');
    expect(html).toContain('href="./second.html"');
    expect(html).toContain("Поле · Один");
    expect(html).toContain("data-loop-next");
    expect(html).not.toContain('href="./card.html"');
    expect(html).not.toContain(">Вручную<");
    expect(doc.blocks[0]).not.toHaveProperty("cards");
  });
  it("проверяет подстановку, резервное значение и разрешённые свойства", () => {
    const image: Block = {
      id: "i",
      type: "img",
      cid: "",
      dynamic: {
        src: { source: "page.image" },
        caption: { source: "custom.x", fallback: "Нет", before: "(", after: ")" },
        type: { source: "page.title" },
      },
    };
    expect(bindContent(image, { "page.image": "./photo.png", "page.title": "other" })).toMatchObject({
      type: "img",
      cid: "./photo.png",
      src: "./photo.png",
      caption: "(Нет)",
      captionSource: "custom",
    });
    expect(validEntry({ date: "2026-02-31" })).toBe(false);
    expect(validEntry({ date: "2024-02-29" })).toBe(true);
    expect(validEntry({ terms: "новости" })).toBe(false);
    expect(validEntry({ fields: { invalid: {} } })).toBe(false);
  });
  it("поддерживает сортировку, смещение, отбор рубрик и разные экраны", () => {
    const doc = fixture(),
      entries = doc
        .sitePages!.pages.filter((p) => p.document && !p.template)
        .map((p) => ({ id: p.id, path: p.path, document: p.document! }));
    const base = { id: "l", type: "loopgrid" as const, source: "all" as const };
    expect(queryEntries({ ...base, terms: ["Фото"] }, entries, "home").map((c) => c.id)).toEqual(["b"]);
    expect(queryEntries({ ...base, omitCurrent: true }, entries, "a").map((c) => c.id)).toEqual(["b"]);
    expect(queryEntries({ ...base, offset: 1 }, entries, "home").map((c) => c.id)).toEqual(["b"]);
    expect(loopSettings({ columns: { desktop: 20, tablet: -1 } }).columns).toEqual({
      desktop: 12,
      tablet: 1,
      mobile: 1,
    });
  });
  it("создаёт отдельные якоря карточек и сохраняет ссылки на другие страницы", async () => {
    const doc = fixture();
    const template = doc.sitePages!.pages.find((p) => p.template)!.document!;
    template.blocks = [
      { id: "target", type: "anchor", name: "bio" },
      { id: "jump", type: "btn", label: "Био", href: "#bio" },
      { id: "other", type: "btn", label: "Вся статья", href: "./first.html#bio" },
    ];
    const model = adaptFromSiteBuilderDoc(activePageForBuild(doc));
    const html = await (await exportSingleHtml(model, { bundleAssets: false })).text();
    for (const i of [1, 2]) {
      expect(html).toContain('id="loop-main-' + i + '-bio"');
      expect(html).toContain('href="#loop-main-' + i + '-bio"');
    }
    expect(html).toContain('href="./first.html#bio"');
    expect(template.blocks[0]).toMatchObject({ name: "bio" });
  });
  it("выявляет пропавший шаблон и цикл ссылок до публикации", () => {
    const doc = fixture(),
      block = doc.blocks[0];
    if (block.type !== "loopgrid") throw Error();
    expect(
      unsupportedBlockTypes(
        adaptFromSiteBuilderDoc(activePageForBuild({ ...doc, blocks: [{ ...block, templateId: "absent" }] }))
      ).join()
    ).toContain("Шаблон карточки отсутствует");
    doc.sitePages!.pages[3].document!.blocks = [{ ...block, id: "nested" }];
    expect(unsupportedBlockTypes(adaptFromSiteBuilderDoc(activePageForBuild(doc))).join()).toContain(
      "собственный цикл"
    );
  });
});

it("не обходит содержимое остальных страниц, когда виджету нужен только заголовок", () => {
  const other = {
    id: "b",
    path: "second.html",
    document: {
      title: "Вторая",
      get blocks(): Block[] {
        throw Error("Лишний обход страницы");
      },
    },
  };
  const first = { id: "home", path: "index.html", document: { title: "Главная", blocks: [] } };
  const resolve = contentResolver(
    {
      version: 1,
      activeId: "home",
      pages: [
        { id: "home", path: "index.html" },
        { id: "b", path: "second.html" },
      ],
    },
    [first, other]
  );
  const result = resolve([{ id: "p", type: "p", text: "", dynamic: { text: { source: "page.title" } } }], first);
  expect(result[0]).toMatchObject({ text: "Главная" });
});
