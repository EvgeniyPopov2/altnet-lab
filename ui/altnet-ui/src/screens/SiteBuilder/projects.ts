import type { Doc, ProjectDocument, SiteProject, SiteProjects } from "./types";
import { validateDraft } from "./storage";

function projectDocument(doc: Doc): ProjectDocument {
  const { siteProjects: _siteProjects, ...project } = doc;
  return project;
}

export function exportProject(doc: Doc): string {
  const workspace = projectsOf(doc);
  const name = workspace.projects.find(project => project.id === workspace.activeId)!.name;
  return JSON.stringify({ format: "altnet.sitebuilder.project", version: 1, project: { name, document: projectDocument(doc) } }, null, 2);
}

export function parseProject(value: unknown): { name: string; document: ProjectDocument } {
  if (!value || typeof value !== "object") throw new Error("Файл проекта повреждён.");
  const wrapper = value as Record<string, unknown>;
  if (wrapper.format !== "altnet.sitebuilder.project" || wrapper.version !== 1 || !wrapper.project || typeof wrapper.project !== "object") throw new Error("Формат или версия проекта не поддерживаются.");
  const project = wrapper.project as Record<string, unknown>;
  if (typeof project.name !== "string" || !project.name.trim() || project.name.length > 120 ||
      !project.document || typeof project.document !== "object" || (project.document as Record<string, unknown>).siteProjects !== undefined ||
      validateDraft(project.document).status !== "loaded") throw new Error("Содержимое проекта повреждено или не поддерживается.");
  return { name: project.name, document: project.document as ProjectDocument };
}

export function projectsOf(doc: Doc): SiteProjects {
  if (doc.siteProjects) return doc.siteProjects;
  const home = doc.sitePages?.pages.find(page => page.path === "index.html");
  const title = home && home.id !== doc.sitePages?.activeId ? home.document?.title ?? doc.title : doc.title;
  return { version: 1, activeId: "first", projects: [{ id: "first", name: title.trim().slice(0, 120) || "Первый проект" }] };
}

export function switchProject(doc: Doc, id: string): Doc {
  const workspace = projectsOf(doc);
  if (workspace.activeId === id) return doc;
  const target = workspace.projects.find(project => project.id === id);
  if (!target?.document) return doc;
  const projects = workspace.projects.map(project => {
    if (project.id === workspace.activeId) return { ...project, document: projectDocument(doc) };
    if (project.id === id) { const { document: _document, ...rest } = project; return rest; }
    return project;
  });
  return { ...target.document, siteProjects: { ...workspace, activeId: id, projects } };
}

function newId(projects: SiteProject[]): string {
  let id: string;
  do { id = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`; }
  while (projects.some(project => project.id === id));
  return id;
}

function uniqueName(name: string, projects: SiteProject[]): string {
  const used = new Set(projects.map(project => project.name.trim().toLocaleLowerCase("ru-RU")));
  const base = name.trim();
  if (!used.has(base.toLocaleLowerCase("ru-RU"))) return base;
  for (let number = 2; number <= 101; number++) {
    const suffix = ` (${number})`;
    const candidate = base.slice(0, 120 - suffix.length).trimEnd() + suffix;
    if (!used.has(candidate.toLocaleLowerCase("ru-RU"))) return candidate;
  }
  throw new Error("Не удалось подобрать название проекта.");
}

export function addProject(doc: Doc, name: string, duplicate = false): Doc {
  const workspace = projectsOf(doc);
  const clean = name.trim();
  if (!clean || clean.length > 120 || workspace.projects.length >= 100) return doc;
  const project: SiteProject = { id: newId(workspace.projects), name: uniqueName(clean, workspace.projects),
    document: duplicate ? projectDocument(doc) : { title: "Главная", blocks: [] } };
  return switchProject({ ...doc, siteProjects: { ...workspace, projects: [...workspace.projects, project] } }, project.id);
}

export function importProject(doc: Doc, project: { name: string; document: ProjectDocument }): Doc {
  const workspace = projectsOf(doc);
  if (workspace.projects.length >= 100) throw new Error("Достигнут предел в 100 проектов.");
  const parsed = parseProject({ format: "altnet.sitebuilder.project", version: 1, project });
  const entry: SiteProject = { id: newId(workspace.projects), ...parsed, name: uniqueName(parsed.name, workspace.projects) };
  return switchProject({ ...doc, siteProjects: { ...workspace, projects: [...workspace.projects, entry] } }, entry.id);
}

export function renameProject(doc: Doc, id: string, name: string): Doc {
  const workspace = projectsOf(doc), clean = name.trim();
  if (!clean || clean.length > 120 || !workspace.projects.some(project => project.id === id) ||
      workspace.projects.some(project => project.id !== id && project.name.trim().toLocaleLowerCase("ru-RU") === clean.toLocaleLowerCase("ru-RU"))) return doc;
  return { ...doc, siteProjects: { ...workspace, projects: workspace.projects.map(project => project.id === id ? { ...project, name: clean } : project) } };
}

export function removeProject(doc: Doc, id: string): Doc {
  const workspace = projectsOf(doc);
  if (workspace.projects.length < 2 || !workspace.projects.some(project => project.id === id)) return doc;
  const current = workspace.activeId === id ? switchProject(doc, workspace.projects.find(project => project.id !== id)!.id) : doc;
  const currentWorkspace = projectsOf(current);
  return { ...current, siteProjects: { ...currentWorkspace, projects: currentWorkspace.projects.filter(project => project.id !== id) } };
}
