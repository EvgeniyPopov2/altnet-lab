import { useState, type Dispatch, type SetStateAction } from "react";
import { addProject, projectsOf, removeProject, renameProject, switchProject } from "./projects";
import type { Doc } from "./types";

type Props = { doc: Doc; setDoc: Dispatch<SetStateAction<Doc>>; onChangeProject: () => void; onExportProject: () => void; onImportProject: () => void };
export default function ProjectPanel({ doc, setDoc, onChangeProject, onExportProject, onImportProject }: Props) {
  const [name, setName] = useState("");
  const [rename, setRename] = useState("");
  const [error, setError] = useState("");
  const workspace = projectsOf(doc);
  const active = workspace.projects.find(project => project.id === workspace.activeId)!;
  const field = "w-full min-w-0 rounded-md border border-[#2a2f45] bg-[#0c0f1a] px-2 py-1.5 text-sm text-[#e6e9f4]";
  const button = "rounded-md border border-[#2a2f45] px-2 py-1.5 text-xs text-[#e6e9f4] hover:border-[#6E59F2] disabled:opacity-50";
  function create(duplicate: boolean) {
    if (!name.trim()) { setError("Введите название проекта."); return; }
    if (workspace.projects.length >= 100) { setError("Достигнут предел в 100 проектов."); return; }
    setDoc(current => addProject(current, name, duplicate));
    setName(""); setRename(""); setError(""); onChangeProject();
  }
  return <section aria-label="Проекты сайтов" className="grid min-w-0 gap-2 rounded-lg border border-[#2a2f45] p-3">
    <div className="text-xs font-medium text-[#cfd5e6]">Проекты сайтов · {workspace.projects.length}</div>
    <ul className="grid gap-1">
      {workspace.projects.map(project => <li key={project.id} className="min-w-0">
        <button type="button" aria-current={project.id === workspace.activeId ? "true" : undefined}
          className={`w-full truncate rounded-md border px-2 py-1.5 text-left text-xs ${project.id === workspace.activeId ? "border-[#6E59F2] text-white" : "border-[#2a2f45] text-[#cfd5e6]"}`}
          onClick={() => { setDoc(current => switchProject(current, project.id)); setRename(""); setError(""); onChangeProject(); }} title={project.name}>{project.name}</button>
      </li>)}
    </ul>
    <label className="grid gap-1 text-xs text-[#cfd5e6]">Название нового проекта
      <input className={field} value={name} maxLength={120} onChange={event => setName(event.target.value)} placeholder="Например, Портфолио" />
    </label>
    <div className="grid grid-cols-2 gap-1">
      <button type="button" className={button} onClick={() => create(false)}>Создать</button>
      <button type="button" className={button} onClick={() => create(true)}>Дублировать</button>
    </div>
    <div className="grid grid-cols-2 gap-1">
      <button type="button" className={button} onClick={onExportProject}>Скачать проект</button>
      <button type="button" className={button} onClick={onImportProject}>Импорт проекта</button>
    </div>
    <label className="grid gap-1 text-xs text-[#cfd5e6]">Переименовать текущий проект
      <input className={field} value={rename} maxLength={120} onChange={event => setRename(event.target.value)} placeholder={active.name} />
    </label>
    <div className="grid grid-cols-2 gap-1">
      <button type="button" className={button} disabled={!rename.trim()} onClick={() => {
        if (workspace.projects.some(project => project.id !== active.id && project.name.trim().toLocaleLowerCase("ru-RU") === rename.trim().toLocaleLowerCase("ru-RU"))) {
          setError("Проект с таким названием уже существует."); return;
        }
        setDoc(current => renameProject(current, active.id, rename)); setRename(""); setError("");
      }}>Переименовать</button>
      <button type="button" className={button} disabled={workspace.projects.length < 2} onClick={() => {
        if (!window.confirm(`Удалить проект «${active.name}» со всеми страницами? Действие можно отменить в текущей сессии.`)) return;
        setDoc(current => removeProject(current, active.id)); setRename(""); setError(""); onChangeProject();
      }}>Удалить проект</button>
    </div>
    {error && <p role="alert" className="text-xs text-[#ffb3a8]">{error}</p>}
    <p className="text-xs text-[#9aa3b2]">ZIP, публикация и файл проекта относятся к текущему проекту. Общий JSON и сохранённые версии содержат все проекты.</p>
  </section>;
}
