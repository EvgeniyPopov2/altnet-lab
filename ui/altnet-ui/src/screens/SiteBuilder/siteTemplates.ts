import { popupId, popupSettings } from "./popup";
import { addPage, allPageDocuments, pagesOf } from "./pages";
import { contentResolver, type EntryPage } from "./dynamicContent";
import { copyTree } from "./layoutTree";
import { assignedTemplate } from "./templateRules";
import { newId } from "./registry";
import type { Block, Doc, PageDocument, SiteTemplate, TemplateKind } from "./types";

export type PageForBuild = PageDocument & {
  themeAreas?: Partial<Record<"header" | "footer", Block[]>>;
  popups?: { id: string; title: string; options: ReturnType<typeof popupSettings>; blocks: Block[] }[];
};

export function addSiteTemplate(doc: Doc, title: string, kind: TemplateKind): Doc {
  const next = addPage(doc, title);
  return next === doc ? doc : updateSiteTemplate(next, pagesOf(next).activeId, { kind, enabled: false, priority: 0 });
}

export function updateSiteTemplate(doc: Doc, id: string, template: SiteTemplate): Doc {
  const ws = pagesOf(doc);
  if (!ws.pages.some((page) => page.id === id && page.path !== "index.html")) return doc;
  return {
    ...doc,
    sitePages: { ...ws, pages: ws.pages.map((page) => (page.id === id ? { ...page, template } : page)) },
  };
}

export function insertTemplateCopy(doc: Doc, id: string): Doc {
  const ws = pagesOf(doc);
  const template = ws.pages.find((page) => page.id === id && page.template);
  if (!template || template.id === ws.activeId || !template.document?.blocks.length) return doc;
  return {
    ...doc,
    blocks: [...doc.blocks, ...template.document.blocks.map((block) => copyTree(block, () => newId("blk")))],
  };
}

function buildContext(doc: Doc) {
  const workspace = pagesOf(doc),
    entries = allPageDocuments(doc),
    byId = new Map(entries.map((page) => [page.id, page]));
  const flags = new Map(workspace.pages.map((p) => [p.id, p.template]));
  const render = contentResolver(workspace, entries, doc.styleClasses);
  function build(page: EntryPage): PageForBuild {
    const areas: PageForBuild["themeAreas"] = {};
    if (!flags.get(page.id))
      for (const kind of ["header", "footer"] as const) {
        const template = assignedTemplate(workspace.pages, page.id, kind);
        if (template) areas[kind] = render(byId.get(template.id)!.document.blocks, page, kind);
      }
    const popups = flags.get(page.id)
      ? []
      : workspace.pages
          .filter((item) => {
            const t = item.template;
            return (
              t?.kind === "popup" &&
              t.enabled &&
              !t.exclude?.includes(page.id) &&
              (!t.include || t.include.includes(page.id))
            );
          })
          .sort((a, b) => b.template!.priority - a.template!.priority)
          .map((item) => {
            const content = byId.get(item.id)!.document,
              id = popupId(item.id);
            return {
              id,
              title: content.title,
              options: popupSettings(item.template?.popup),
              blocks: render(content.blocks, page, id),
            };
          });
    return {
      ...page.document,
      ...(popups.length ? { popups } : {}),
      blocks: render(page.document.blocks, page),
      ...(Object.keys(areas).length ? { themeAreas: areas } : {}),
    };
  }
  return { workspace, entries, byId, flags, build };
}

export function pagesForBuild(doc: Doc) {
  const { entries, flags, build } = buildContext(doc);
  return entries.filter((page) => !flags.get(page.id)).map((page) => ({ ...page, document: build(page) }));
}

export function activePageForBuild(doc: Doc): PageForBuild {
  const { workspace, byId, build } = buildContext(doc);
  return build(byId.get(workspace.activeId)!);
}
