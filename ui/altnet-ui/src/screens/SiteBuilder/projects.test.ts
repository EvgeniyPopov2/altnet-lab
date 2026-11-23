import { describe, expect, it } from "vitest";
import { addPage, allPageDocuments, pagesOf, switchPage } from "./pages";
import { addProject, exportProject, importProject, parseProject, projectsOf, removeProject, renameProject, switchProject } from "./projects";
import { exportDraft, importDraft, validateDraft } from "./storage";
import type { Doc } from "./types";

const original: Doc = { title: "Первый сайт", blocks: [{ id: "head", type: "h1", text: "Первый проект" }] };

describe("проекты сайтов", () => {
  it("оставляет старый документ доступным без немедленной миграции", () => {
    expect(projectsOf(original).projects).toEqual([{ id: "first", name: "Первый сайт" }]);
    expect(original.siteProjects).toBeUndefined();
  });
  it("сохраняет страницы разных проектов при переключении и перезапуске", () => {
    const about = addPage(original, "Контакты");
    const aboutId = pagesOf(about).activeId;
    const withContent: Doc = { ...about, blocks: [{ id: "contact", type: "p", text: "Почта" }] };
    const second = addProject(withContent, "Второй проект");
    const secondId = projectsOf(second).activeId;
    expect(second.blocks).toEqual([]);
    const secondPage = addPage(second, "Услуги");
    const first = switchProject(secondPage, "first");
    expect(first.blocks).toEqual(withContent.blocks);
    expect(switchPage(first, "home").blocks).toEqual(original.blocks);
    expect(pagesOf(switchPage(first, "home")).pages.length).toBe(2);
    expect(switchPage(first, "home").siteProjects?.projects.length).toBe(2);
    const loaded = importDraft(JSON.parse(exportDraft(first)));
    expect(loaded.status).toBe("loaded");
    if (loaded.status !== "loaded") return;
    expect(pagesOf(switchProject(loaded.doc, secondId)).pages).toHaveLength(2);
    expect(pagesOf(switchProject(loaded.doc, "first")).activeId).toBe(aboutId);
    expect(allPageDocuments(loaded.doc)).toHaveLength(2);
  });
  it("дублирует проект целиком, переименовывает и удаляет с сохранением остальных", () => {
    const source = addPage(original, "Контакты");
    const copy = addProject(source, "Копия", true);
    const id = projectsOf(copy).activeId;
    expect(allPageDocuments(copy)).toHaveLength(2);
    const edited: Doc = { ...copy, title: "Изменено" };
    const renamed = renameProject(edited, id, "Новое имя");
    expect(projectsOf(renamed).projects.find(project => project.id === id)?.name).toBe("Новое имя");
    const first = switchProject(renamed, "first");
    expect(first.title).toBe("Контакты");
    const removed = removeProject(renamed, id);
    expect(projectsOf(removed).projects).toHaveLength(1);
    expect(removed.title).toBe("Контакты");
    expect(removeProject(removed, "first")).toBe(removed);
  });
  it("не принимает сломанный, вложенный или неоднозначный список проектов", () => {
    const doc = addProject(original, "Второй");
    const workspace = projectsOf(doc);
    expect(validateDraft({ ...doc, siteProjects: { ...workspace, activeId: "missing" } }).status).toBe("unavailable");
    expect(validateDraft({ ...doc, siteProjects: { ...workspace, projects: workspace.projects.map(project => ({ ...project, id: "same" })) } }).status).toBe("unavailable");
    const nested = workspace.projects.map(project => project.id === "first" ? { ...project, document: { ...original, siteProjects: workspace } } : project);
    expect(validateDraft({ ...doc, siteProjects: { ...workspace, projects: nested } }).status).toBe("unavailable");
  });
  it("переносит один проект со всеми его страницами, не включая и не заменяя другие проекты", () => {
    const first = addPage(original, "Контакты");
    const second = addProject(first, "Секретный проект");
    const selected = switchProject(second, "first");
    const text = exportProject(selected);
    expect(text).not.toContain("Секретный проект");
    const imported = importProject(second, parseProject(JSON.parse(text)));
    expect(projectsOf(imported).projects).toHaveLength(3);
    expect(projectsOf(imported).projects.at(-1)?.name).toBe("Первый сайт (2)");
    expect(allPageDocuments(imported)).toHaveLength(2);
    expect(switchProject(imported, projectsOf(second).activeId).title).toBe("Главная");
  });
  it("различает одинаковые имена и не позволяет переименованием скрыть другой проект", () => {
    const duplicate = addProject(original, "первый сайт");
    const workspace = projectsOf(duplicate);
    expect(workspace.projects.at(-1)?.name).toBe("первый сайт (2)");
    expect(renameProject(duplicate, workspace.activeId, "ПЕРВЫЙ САЙТ")).toBe(duplicate);
  });
  it("отклоняет неверный файл проекта и вложенные рабочие области", () => {
    expect(() => parseProject({ format: "altnet.sitebuilder.project", version: 2, project: {} })).toThrow();
    expect(() => parseProject({ format: "altnet.sitebuilder.project", version: 1, project: { name: "X", document: { ...original, siteProjects: projectsOf(original) } } })).toThrow();
    expect(() => parseProject({ format: "altnet.sitebuilder.project", version: 1, project: { name: "X", document: { title: "bad", blocks: "not an array" } } })).toThrow();
  });
});
