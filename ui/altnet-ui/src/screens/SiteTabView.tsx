import { useEffect, useRef, useState } from "react";
import LocalSiteFrame from "../components/LocalSiteFrame";
import { parseBrowserAddress } from "../core/sites/browserNavigation";
import { readCachedSite } from "../core/sites/ipfsSiteCache";
import { getPublishedSite } from "../core/sites/published";
import { encodeSitePath } from "../core/sites/sitePath";
import { parseSiteTabHash, siteTabHash, type SiteTabAddress } from "../core/sites/siteTabAddress";
import type { PublishedPage } from "../core/sites/publishedDb";

type SiteContent = { pages: PublishedPage[]; resources?: { path: string; mime: string; data: string }[]; warning?: string };
type LoadState = { key: string; content: SiteContent | null; error: string };

export default function SiteTabView() {
  const [target, setTarget] = useState<SiteTabAddress | null>(() => parseSiteTabHash(window.location.hash));
  const [state, setState] = useState<LoadState | null>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const key = target ? `${target.profile}:${target.address}` : "";

  useEffect(() => {
    const update = () => setTarget(parseSiteTabHash(window.location.hash));
    window.addEventListener("popstate", update); window.addEventListener("hashchange", update);
    return () => { window.removeEventListener("popstate", update); window.removeEventListener("hashchange", update); };
  }, []);

  useEffect(() => {
    if (!target) return;
    let live = true;
    const current = parseBrowserAddress(target.address);
    const load = async (): Promise<SiteContent | null> => {
      if (current.kind === "ipfs") {
        const site = await readCachedSite(current.root, target.profile);
        return site ? { pages: site.pages, resources: site.resources } : null;
      }
      if (current.kind === "site") {
        const site = await getPublishedSite(current.slug);
        if (!site) return null;
        const pages = site.pages?.length ? site.pages : [{ path: "index.html", title: site.title, html: site.html }];
        return { pages, warning: site.storageWarning };
      }
      return null;
    };
    load().then(content => { if (live) setState({ key, content, error: "" }); }, () => {
      if (live) setState({ key, content: null, error: "Не удалось прочитать и проверить сайт. Сохранённые данные не изменены." });
    });
    return () => { live = false; };
  }, [key, target]);

  const current = target ? parseBrowserAddress(target.address) : null;
  const content = state?.key === key ? state.content : null;
  const paths = content?.pages.map(page => page.path) ?? [];
  const page = current && (current.kind === "site" || current.kind === "ipfs") ? content?.pages.find(item => item.path === current.path) : null;

  useEffect(() => { document.title = page ? `${page.title} — AltNet` : "Сайт AltNet"; }, [page]);

  useEffect(() => {
    if (!target || !current || (current.kind !== "site" && current.kind !== "ipfs") || !content) return;
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || !event.data || event.data.type !== "altnet.local-page" ||
          typeof event.data.path !== "string" || !content.pages.some(item => item.path === event.data.path)) return;
      const fragment: unknown = event.data.fragment;
      if (fragment !== undefined && (typeof fragment !== "string" || (fragment !== "" && !/^[a-zA-Z0-9_-]{1,128}$/.test(fragment)))) return;
      const base = current.kind === "ipfs" ? `ipfs://${current.root}` : `alt://site/${current.slug}`;
      const path = event.data.path === "index.html" ? "" : `/${current.kind === "ipfs" ? encodeSitePath(event.data.path) : event.data.path}`;
      try {
        const hash = siteTabHash(`${base}${path}${fragment ? `#${fragment}` : ""}`, target.profile);
        history.pushState(null, "", hash);
        setTarget(parseSiteTabHash(hash));
      } catch { /* Некорректная ссылка не меняет страницу. */ }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [target, current, content]);

  return <main className="flex h-dvh min-h-0 flex-col bg-slate-950 text-slate-100">
    <header className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-b border-slate-700 px-4 py-2 text-sm">
      <strong>AltNet</strong><span className="order-3 w-full min-w-0 break-all text-slate-300 sm:order-none sm:w-auto sm:flex-1">{target?.address ?? "Некорректный адрес"}</span>
      {target && <span className="ml-auto text-xs text-slate-400">{target.profile === "fast" ? "Быстрый профиль · локально" : "Анонимный профиль · локально"}</span>}
    </header>
    {!target ? <p role="alert" className="p-5">Некорректная ссылка на локальный сайт.</p> :
      state?.key !== key ? <p role="status" className="p-5">Проверяем сайт…</p> :
      state.error ? <p role="alert" className="p-5">{state.error}</p> :
      !content ? <p role="alert" className="p-5">Локальная копия сайта не найдена в этом профиле браузера.</p> :
      !page ? <p role="alert" className="p-5">Страница отсутствует в локальной копии сайта.</p> : <>
        <p className="shrink-0 bg-slate-900 px-4 py-1 text-xs text-slate-300">{current?.kind === "ipfs" ? "Копия проверена по CID; автор не подтверждён. " : "Локальная публикация. "}Внешние ресурсы и произвольные скрипты отключены.</p>
        {content.warning && <p role="alert" className="px-4 py-1 text-xs text-amber-300">{content.warning}</p>}
        <LocalSiteFrame key={key} frameRef={frame} title={page.title} html={page.html} paths={paths} fragment={current?.kind === "ipfs" || current?.kind === "site" ? current.fragment : ""} resources={content.resources} pagePath={page.path} className="min-h-0 w-full flex-1 border-0 bg-white" />
      </>}
  </main>;
}
