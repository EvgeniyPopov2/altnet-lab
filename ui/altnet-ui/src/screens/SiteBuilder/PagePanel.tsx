import EntryPanel from "./EntryPanel";
import React, { useState } from "react";
import { addPage, pagesOf, removePage, renamePagePath, switchPage } from "./pages";
import type { Doc } from "./types";
import { sanitizeCanonicalUrl, sanitizeSocialImage } from "../../builder/exporter";

type Props = { doc: Doc; setDoc: React.Dispatch<React.SetStateAction<Doc>>; onChangePage: () => void };

export default function PagePanel({ doc, setDoc, onChangePage }: Props) {
  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  const [message, setMessage] = useState("");
  const workspace = pagesOf(doc);
  const publicPages = workspace.pages.filter(page => !page.template);
  const active = workspace.pages.find(page => page.id === workspace.activeId)!;
  const field = "w-full min-w-0 rounded-md border border-[#2a2f45] bg-[#0c0f1a] px-2 py-1.5 text-sm text-[#e6e9f4]";
  const button = "rounded-md border border-[#2a2f45] px-2 py-1.5 text-xs text-[#e6e9f4] hover:border-[#6E59F2] disabled:opacity-50";

  function create(duplicate: boolean) {
    const title = name.trim();
    if (!title) { setMessage("Введите название новой страницы."); return; }
    if (workspace.pages.length >= 500) { setMessage("Достигнут предел в 500 страниц."); return; }
    setDoc(current => addPage(current, title, duplicate));
    setName(""); setPath(""); setMessage(""); onChangePage();
  }
  function changePath() {
    const clean = path.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{0,63}\.html$/.test(clean)) {
      setMessage("Адрес: латинские буквы, цифры, дефис и окончание .html."); return;
    }
    if (workspace.pages.some(page => page.id !== active.id && page.path === clean)) {
      setMessage("Этот адрес уже используется другой страницей."); return;
    }
    setDoc(current => renamePagePath(current, active.id, clean));
    setPath(""); setMessage("");
  }
  return <section aria-label="Страницы сайта" className="grid min-w-0 gap-2 rounded-lg border border-[#2a2f45] p-3">
    <div className="text-xs font-medium text-[#cfd5e6]">Страницы сайта · {publicPages.length}</div>
    <ul className="grid gap-1">
      {publicPages.map(page => <li key={page.id} className="min-w-0">
        <button type="button" aria-current={page.id === workspace.activeId ? "page" : undefined}
          className={`w-full min-w-0 rounded-md border px-2 py-1.5 text-left text-xs ${page.id === workspace.activeId ? "border-[#6E59F2] text-white" : "border-[#2a2f45] text-[#cfd5e6]"}`}
          onClick={() => { setDoc(current => switchPage(current, page.id)); setPath(""); setMessage(""); onChangePage(); }}>
          <span className="block truncate">{page.id === workspace.activeId ? doc.title : page.document?.title}</span>
          <span className="block truncate text-[#9aa3b2]">{page.path === "index.html" ? "Главная · " : ""}{page.path}</span>
        </button>
      </li>)}
    </ul>
    <label className="grid gap-1 text-xs text-[#cfd5e6]">{active.template ? "Название шаблона" : "Название текущей страницы"}
      <input className={field} value={doc.title} onChange={event => { const title = event.target.value; setDoc(current => ({ ...current, title })); }} />
    </label>
    <label className="grid gap-1 text-xs text-[#cfd5e6]">Название новой страницы
      <input className={field} value={name} onChange={event => setName(event.target.value)} placeholder="Например, Контакты" />
    </label>
    <div className="grid grid-cols-2 gap-1">
      <button type="button" className={button} onClick={() => create(false)}>Добавить</button>
      <button type="button" className={button} onClick={() => create(true)}>Дублировать</button>
    </div>
    <label className="grid gap-1 text-xs text-[#cfd5e6]">Адрес текущей страницы
      <input className={field} value={path} disabled={active.path === "index.html"} placeholder={active.path} onChange={event => setPath(event.target.value)} />
    </label>
    <div className="grid grid-cols-2 gap-1">
      <button type="button" className={button} disabled={active.path === "index.html" || !path.trim()} onClick={changePath}>Изменить адрес</button>
      <button type="button" className={button} disabled={active.path === "index.html"} onClick={() => {
        if (!window.confirm(`Удалить страницу «${doc.title}»? Действие можно отменить в текущей сессии.`)) return;
        setDoc(current => removePage(current, active.id)); setPath(""); setMessage(""); onChangePage();
      }}>Удалить</button>
    </div>
    {!active.template && <EntryPanel key={workspace.activeId} doc={doc} setDoc={setDoc} />}
    {!active.template && <details className="rounded-md border border-[#2a2f45] p-2 text-xs text-[#cfd5e6]">
      <summary className="cursor-pointer">Поиск и соцсети</summary>
      <label className="mt-2 grid gap-1">Описание страницы
        <textarea className={field} rows={3} value={doc.description ?? ""} onChange={event => { const description = event.target.value; setDoc(current => ({ ...current, description })); }} />
      </label>
      <label className="mt-2 grid gap-1">Адрес изображения для соцсетей
        <input className={field} type="url" value={doc.ogImage ?? ""} placeholder="https://example.org/image.jpg" onChange={event => { const ogImage = event.target.value; setDoc(current => ({ ...current, ogImage })); }} />
      </label>
      {doc.ogImage && !sanitizeSocialImage(doc.ogImage) && <p role="alert" className="mt-1 text-[#ffb3a8]">Введите HTTP(S)-адрес без пробелов, логина и пароля. Пока этот адрес не попадёт в экспорт.</p>}
      <p className="mt-2 text-[#9aa3b2]">При публикации ссылку и изображение могут запрашивать сервисы соцсетей.</p>
      <label className="mt-2 grid gap-1">Канонический адрес страницы
        <input className={field} type="url" value={doc.seo?.canonical ?? ""} placeholder="https://example.org/page" onChange={event => { const canonical = event.target.value; setDoc(current => ({ ...current, seo: { ...current.seo, canonical } })); }} />
      </label>
      {doc.seo?.canonical && !sanitizeCanonicalUrl(doc.seo.canonical) && <p role="alert" className="mt-1 text-[#ffb3a8]">Нужен полный HTTP(S)-адрес без пробелов, учётных данных и якоря. Пока он не попадёт в экспорт.</p>}
      <label className="mt-2 flex items-center gap-2"><input type="checkbox" checked={doc.seo?.index !== false} onChange={event => { const index = event.target.checked; setDoc(current => ({ ...current, seo: { ...current.seo, index } })); }} />Разрешить индексацию</label>
      <label className="mt-2 flex items-center gap-2"><input type="checkbox" checked={doc.seo?.follow !== false} onChange={event => { const follow = event.target.checked; setDoc(current => ({ ...current, seo: { ...current.seo, follow } })); }} />Разрешить переход по ссылкам</label>
      <p className="mt-2 text-[#9aa3b2]">Это указания для поисковых систем; их выполнение зависит от поискового робота.</p>
    </details>}
    {message && <p role="alert" className="text-xs text-[#ffb3a8]">{message}</p>}
    <p className="text-xs text-[#9aa3b2]">Главная — index.html. Для ссылок используйте ./адрес.html. При изменении адреса ссылки в виджетах обновляются; ссылки в пользовательском HTML измените вручную. ZIP и локальная публикация включают все страницы; HTML — только текущую.</p>
  </section>;
}
