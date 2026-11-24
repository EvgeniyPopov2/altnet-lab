import PopupSettings from "./PopupSettings";
import { useState, type Dispatch, type SetStateAction } from "react";
import { addSiteTemplate, updateSiteTemplate, insertTemplateCopy } from "./siteTemplates";
import { pagesOf, removePage, switchPage } from "./pages";
import type { Doc, SiteTemplate, TemplateKind } from "./types";

const names = { header: "Шапка", footer: "Подвал", section: "Секция", popup: "Всплывающее окно" };
type Props = { doc: Doc; setDoc: Dispatch<SetStateAction<Doc>>; onChangePage: () => void };
export default function TemplatePanel({ doc, setDoc, onChangePage }: Props) {
  const ws = pagesOf(doc),
    templates = ws.pages.filter((page) => page.template),
    pages = ws.pages.filter((page) => !page.template);
  const active = templates.find((p) => p.id === ws.activeId),
    rule = active?.template;
  const [kind, setKind] = useState<TemplateKind>("header");
  const [name, setName] = useState("");
  function edit(change: (current: SiteTemplate) => SiteTemplate) {
    if (!active) return;
    setDoc((current) => {
      const item = pagesOf(current).pages.find((p) => p.id === active.id);
      return item?.template ? updateSiteTemplate(current, item.id, change(item.template)) : current;
    });
  }
  return (
    <details className="sb-template-panel" open={active ? true : undefined}>
      <summary>Шаблоны сайта</summary>
      <div className="grid gap-2">
        <label>
          Тип нового шаблона
          <select value={kind} onChange={(e) => setKind(e.target.value as TemplateKind)}>
            {Object.entries(names).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Имя нового шаблона
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <button
          type="button"
          disabled={!name.trim() || ws.pages.length >= 500}
          onClick={() => {
            setDoc((current) => addSiteTemplate(current, name, kind));
            setName("");
            onChangePage();
          }}
        >
          Создать шаблон
        </button>
        {templates.map((t) => (
          <div key={t.id} className="flex flex-wrap gap-1">
            <button
              type="button"
              aria-current={active?.id === t.id ? "page" : undefined}
              onClick={() => {
                setDoc((current) => switchPage(current, t.id));
                onChangePage();
              }}
            >
              {names[t.template!.kind]} · {active?.id === t.id ? doc.title : t.document?.title}
            </button>
            {active?.id !== t.id && (
              <button
                type="button"
                disabled={!t.document?.blocks.length}
                onClick={() => setDoc((current) => insertTemplateCopy(current, t.id))}
              >
                Вставить копию
              </button>
            )}
          </div>
        ))}
        {active && rule && (
          <fieldset className="grid gap-2">
            <legend>Параметры шаблона</legend>
            {rule.kind === "popup" && (
              <PopupSettings
                id={active.id}
                value={rule.popup}
                onChange={(patch) => edit((r) => ({ ...r, popup: { ...r.popup, ...patch } }))}
              />
            )}
            {rule.kind !== "section" && (
              <>
                <label>
                  <input
                    type="checkbox"
                    checked={rule.enabled}
                    onChange={(e) => {
                      const enabled = e.target.checked;
                      edit((r) => ({ ...r, enabled }));
                    }}
                  />{" "}
                  Использовать на сайте
                </label>
                <label>
                  Показывать на страницах
                  <select
                    value={rule.include ? "selected" : "all"}
                    onChange={(e) => {
                      const selected = e.target.value === "selected";
                      edit((r) => ({ ...r, include: selected ? (r.include ?? []) : undefined }));
                    }}
                  >
                    <option value="all">Все страницы</option>
                    <option value="selected">Выбранные страницы</option>
                  </select>
                </label>
                {(["include", "exclude"] as const)
                  .filter((k) => k === "exclude" || rule.include)
                  .map((k) => (
                    <details key={k}>
                      <summary>{k === "include" ? "Включить страницы" : "Исключить страницы"}</summary>
                      {pages.map((page) => (
                        <label key={page.id}>
                          <input
                            type="checkbox"
                            checked={!!rule[k]?.includes(page.id)}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              edit((r) => ({
                                ...r,
                                [k]: checked
                                  ? [...new Set([...(r[k] ?? []), page.id])]
                                  : (r[k] ?? []).filter((id) => id !== page.id),
                              }));
                            }}
                          />
                          {page.id === ws.activeId ? doc.title : page.document?.title}
                        </label>
                      ))}
                    </details>
                  ))}
                <label>
                  Приоритет
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={rule.priority}
                    onChange={(e) => {
                      const n = e.target.valueAsNumber;
                      if (Number.isFinite(n))
                        edit((r) => ({ ...r, priority: Math.min(100, Math.max(0, Math.round(n))) }));
                    }}
                  />
                </label>
                <p>{rule.kind==="popup"
                  ? "Окна с совпавшими условиями открываются по очереди. Более высокий приоритет ставит окно раньше при одинаковом триггере."
                  : "Условия для отдельных страниц имеют приоритет перед общими. При равенстве используется последний подходящий шаблон."}</p>
              </>
            )}
            <button
              type="button"
              onClick={() => {
                if (window.confirm("Удалить шаблон из проекта?")) {
                  setDoc((current) => removePage(current, active.id));
                  onChangePage();
                }
              }}
            >
              Удалить шаблон
            </button>
          </fieldset>
        )}
      </div>
    </details>
  );
}
