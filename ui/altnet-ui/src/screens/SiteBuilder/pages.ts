import { slugify } from "../../core/sites/published";
import type { Doc, PageDocument, SitePage, SitePages } from "./types";

function pageDocument(doc: Doc): PageDocument {
  const page = { ...doc };
  delete page.sitePages;
  delete page.siteProjects;
  delete page.mediaLibrary;
  delete page.styleClasses;
  return page;
}

/** Старые документы становятся главной страницей только при первом добавлении. */
export function pagesOf(doc: Doc): SitePages {
  return doc.sitePages ?? { version: 1, activeId: "home", pages: [{ id: "home", path: "index.html" }] };
}

export function allPageDocuments(doc: Doc): Array<{ id: string; path: string; document: PageDocument }> {
  const workspace = pagesOf(doc);
  return workspace.pages.map(page => ({
    id: page.id, path: page.path,
    document: page.id === workspace.activeId ? pageDocument(doc) : page.document!,
  }));
}

export function switchPage(doc: Doc, id: string): Doc {
  const workspace = pagesOf(doc);
  if (id === workspace.activeId) return doc;
  const target = workspace.pages.find(page => page.id === id);
  if (!target?.document) return doc;
  const pages = workspace.pages.map(page => {
    if (page.id === workspace.activeId) return { ...page, document: pageDocument(doc) };
    if (page.id === id) { const rest = { ...page }; delete rest.document; return rest; }
    return page;
  });
  return { ...target.document, ...(doc.styleClasses ? {styleClasses:doc.styleClasses} : {}), ...(doc.mediaLibrary ? { mediaLibrary: doc.mediaLibrary } : {}), sitePages: { ...workspace, activeId: id, pages }, ...(doc.siteProjects ? { siteProjects: doc.siteProjects } : {}) };
}

function uniquePath(title: string, pages: SitePage[]): string {
  const base = slugify(title).slice(0, 56).replace(/-+$/, "") || "page";
  const existing = new Set(pages.map(page => page.path));
  let candidate = `${base}.html`, suffix = 2;
  while (existing.has(candidate)) candidate = `${base}-${suffix++}.html`;
  return candidate;
}

function newId(pages: SitePage[]): string {
  let id: string;
  do { id = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`; }
  while (pages.some(page => page.id === id));
  return id;
}

export function addPage(doc: Doc, title: string, duplicate = false): Doc {
  const workspace = pagesOf(doc);
  if (workspace.pages.length >= 500) return doc;
  const name = title.trim();
  if (!name) return doc;
  const page: SitePage = {
    id: newId(workspace.pages), path: uniquePath(name, workspace.pages),
    document: duplicate ? { ...pageDocument(doc), title: name } : { title: name, blocks: [] },
  };
  return switchPage({ ...doc, sitePages: { ...workspace, pages: [...workspace.pages, page] } }, page.id);
}

const linkKeys = new Set(["href", "ctaLink", "ctaHref", "btnHref"]);
/** Обновляем только поля ссылок в виджетах; HTML и произвольный текст не переписываем. */
function updateLinks(value: unknown, oldPath: string, newPath: string, depth = 0): unknown {
  if (!value || typeof value !== "object" || depth > 128) return value;
  if (Array.isArray(value)) {
    let changed = false;
    const items = value.map(item => { const next = updateLinks(item, oldPath, newPath, depth + 1); changed ||= next !== item; return next; });
    return changed ? items : value;
  }
  let result: Record<string, unknown> | undefined;
  for (const [key, item] of Object.entries(value)) {
    let next = item;
    if (linkKeys.has(key) && typeof item === "string") {
      const oldUrl = `./${oldPath}`;
      if (item === oldUrl || (item.startsWith(`${oldUrl}#`) && /^[a-zA-Z0-9_-]{1,128}$/.test(item.slice(oldUrl.length + 1)))) {
        next = `./${newPath}${item.slice(oldUrl.length)}`;
      }
    } else if (typeof item === "object" && item !== null) next = updateLinks(item, oldPath, newPath, depth + 1);
    if (next !== item) {
      result ??= { ...value };
      Object.defineProperty(result, key, { value: next, enumerable: true, configurable: true, writable: true });
    }
  }
  return result ?? value;
}

export function renamePagePath(doc: Doc, id: string, path: string): Doc {
  const workspace = pagesOf(doc);
  const current = workspace.pages.find(page => page.id === id);
  if (!current || current.path === "index.html" || !/^[a-z0-9][a-z0-9-]{0,63}\.html$/.test(path) ||
      workspace.pages.some(page => page.id !== id && page.path === path)) return doc;
  const pages = workspace.pages.map(page => {
    const blocks = page.document ? updateLinks(page.document.blocks, current.path, path) as Doc["blocks"] : undefined;
    return { ...page, ...(page.id === id ? { path } : {}),
      ...(page.document && blocks !== page.document.blocks ? { document: { ...page.document, blocks: blocks! } } : {}) };
  });
  const blocks = updateLinks(doc.blocks, current.path, path) as Doc["blocks"];
  return { ...doc, blocks, sitePages: { ...workspace, pages } };
}

export function removePage(doc: Doc, id: string): Doc {
  const workspace = pagesOf(doc);
  const target = workspace.pages.find(page => page.id === id);
  if (!target || target.path === "index.html") return doc;
  const current = id === workspace.activeId ? switchPage(doc, workspace.pages.find(page => page.path === "index.html")!.id) : doc;
  const currentWorkspace = pagesOf(current);
  return { ...current, sitePages: { ...currentWorkspace, pages: currentWorkspace.pages.filter(page => page.id !== id) } };
}
