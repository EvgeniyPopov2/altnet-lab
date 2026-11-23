import type { Doc } from "./types";

export const STORAGE_KEY = "altnet.sitebuilder.v1";
export const INDEXED_DB_MARKER = JSON.stringify({ format: "altnet.sitebuilder.indexeddb", version: 1 });

export type DraftLoad =
  | { status: "empty" }
  | { status: "loaded"; doc: Doc }
  | { status: "indexeddb" }
  | { status: "unavailable" };

export function validateDraft(value: unknown): DraftLoad {
    if (!value || typeof value !== "object") return { status: "unavailable" };
    const doc = value as Record<string, unknown>;
    if (typeof doc.title !== "string" || !Array.isArray(doc.blocks)) return { status: "unavailable" };
    const ids = new Set<string>();
    const pending = doc.blocks.map(block => ({ block, depth: 0 }));
    while (pending.length) {
      const { block, depth } = pending.pop()!;
      if (!block || typeof block !== "object" || typeof block.id !== "string" || !block.id ||
          typeof block.type !== "string" || !block.type || ids.has(block.id) || depth > 64 || ids.size >= 50000) {
        return { status: "unavailable" };
      }
      ids.add(block.id);
      if (block.type === "menu" && Array.isArray(block.items)) {
        const menu = block.items.map((item: unknown) => ({ item, depth: 0 }));
        let count = 0;
        while (menu.length) {
          const current = menu.pop()!;
          if (!current.item || typeof current.item !== "object" || current.depth > 64 || ++count > 50000) return { status: "unavailable" };
          const children = (current.item as Record<string, unknown>).children;
          if (children !== undefined && !Array.isArray(children)) return { status: "unavailable" };
          if (Array.isArray(children)) for (const item of children) menu.push({ item, depth: current.depth + 1 });
        }
      }
      if (block.layoutCells !== undefined) {
        if (!["grid", "section", "container", "offcanvas"].includes(block.type) || !Array.isArray(block.layoutCells) ||
            !block.layoutCells.length || block.layoutCells.length > (block.type === "grid" ? 64 : 12) || !block.layoutCells.every(Array.isArray)) {
          return { status: "unavailable" };
        }
        if (block.type === "offcanvas" && block.layoutCells.length !== 1) return { status: "unavailable" };
        for (const cell of block.layoutCells) {
          for (const child of cell) pending.push({ block: child, depth: depth + 1 });
        }
      }
    }
    if (doc.sitePages !== undefined) {
      const workspace = doc.sitePages as Record<string, unknown> | null;
      if (!workspace || typeof workspace !== "object" || workspace.version !== 1 ||
          typeof workspace.activeId !== "string" || !Array.isArray(workspace.pages) ||
          !workspace.pages.length || workspace.pages.length > 500) return { status: "unavailable" };
      const pageIds = new Set<string>(), paths = new Set<string>();
      let active = 0;
      for (const page of workspace.pages) {
        if (!page || typeof page !== "object" || typeof page.id !== "string" || !page.id || pageIds.has(page.id) ||
            typeof page.path !== "string" || !/^[a-z0-9][a-z0-9-]{0,63}\.html$/.test(page.path) || paths.has(page.path)) return { status: "unavailable" };
        pageIds.add(page.id); paths.add(page.path);
        if (page.id === workspace.activeId) {
          if (page.document !== undefined) return { status: "unavailable" };
          active++;
        } else {
          if (!page.document || typeof page.document !== "object" || page.document.sitePages !== undefined || page.document.siteProjects !== undefined ||
              validateDraft(page.document).status !== "loaded") return { status: "unavailable" };
        }
      }
      if (active !== 1 || !paths.has("index.html")) return { status: "unavailable" };
    }
    if (doc.siteProjects !== undefined) {
      const workspace = doc.siteProjects as Record<string, unknown> | null;
      if (!workspace || typeof workspace !== "object" || workspace.version !== 1 ||
          typeof workspace.activeId !== "string" || !Array.isArray(workspace.projects) ||
          !workspace.projects.length || workspace.projects.length > 100) return { status: "unavailable" };
      const ids = new Set<string>();
      let active = 0;
      for (const project of workspace.projects) {
        if (!project || typeof project !== "object" || typeof project.id !== "string" || !project.id || ids.has(project.id) ||
            typeof project.name !== "string" || !project.name.trim() || project.name.length > 120) return { status: "unavailable" };
        ids.add(project.id);
        if (project.id === workspace.activeId) {
          if (project.document !== undefined) return { status: "unavailable" };
          active++;
        } else {
          if (!project.document || typeof project.document !== "object" || project.document.siteProjects !== undefined ||
              validateDraft(project.document).status !== "loaded") return { status: "unavailable" };
        }
      }
      if (active !== 1) return { status: "unavailable" };
    }
    return { status: "loaded", doc: value as Doc };
}

export function loadDraft(storage: Pick<Storage, "getItem">): DraftLoad {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === null) return { status: "empty" };
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && parsed.format === "altnet.sitebuilder.indexeddb" && parsed.version === 1) return { status: "indexeddb" };
    return validateDraft(parsed);
  } catch {
    return { status: "unavailable" };
  }
}

export function exportDraft(doc: Doc): string {
  return JSON.stringify({ format: "altnet.sitebuilder.document", version: 1, document: doc }, null, 2);
}

export function importDraft(value: unknown): DraftLoad {
  if (!value || typeof value !== "object") return { status: "unavailable" };
  const wrapper = value as Record<string, unknown>;
  if (wrapper.format !== "altnet.sitebuilder.document" || wrapper.version !== 1) return { status: "unavailable" };
  return validateDraft(wrapper.document);
}
