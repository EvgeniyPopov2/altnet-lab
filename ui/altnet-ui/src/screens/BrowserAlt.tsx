import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Plus, RotateCw, X } from "lucide-react";
import LocalSiteFrame from "../components/LocalSiteFrame";
import {
  deletePublishedSite,
  getPublishedSite,
  listPublishedSites,
  upsertPublishedSite,
  type PublishedSiteMeta,
  type PublishedSite,
} from "../core/sites/published";

type NavRequest = {
  url: string;
  token: number;
};

type Tab = {
  id: string;
  title: string;
  url: string;
  history: string[];
  cursor: number;
  reloadToken: number;
};

function inferTitle(url: string): string {
  try {
    if (url.startsWith("alt://")) {
      const path = url.slice("alt://".length) || "home";
      const head = path.split(/[/?#]/)[0] || ".alt";
      if (head === "home") return ".alt старт";
      if (head === "site") return "site";
      return head;
    }
    const u = new URL(url);
    return u.host || url;
  } catch {
    return url || ".alt";
  }
}

function normalizeToUrl(raw: string): string {
  const value = String(raw || "").trim();
  if (!value) return "alt://home";
  if (value.includes("://")) return value;
  return "alt://" + value.replace(/^\/+/, "");
}

function parseSiteSlug(url: string): string | null {
  if (!url.startsWith("alt://site/")) return null;
  const rest = url.slice("alt://site/".length);
  const slug = rest.split(/[/?#]/)[0];
  return /^[a-z0-9][a-z0-9-]{0,95}$/.test(slug) ? slug : null;
}

function parseSitePath(url: string): string | null {
  if (!parseSiteSlug(url)) return null;
  const parts = url.slice("alt://site/".length).split(/[?#]/)[0].split("/");
  if (parts.length === 1) return "index.html";
  if (parts.length !== 2 || !/^[a-z0-9][a-z0-9-]{0,63}\.html$/.test(parts[1])) return null;
  return parts[1];
}

function fmtTime(ts: number): string {
  try {
    return new Date(ts).toLocaleString(undefined, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(ts);
  }
}

export default function BrowserAlt({
  onOpenBuilder,
  navRequest,
}: {
  onOpenBuilder: () => void;
  navRequest?: NavRequest | null;
}) {
  const makeTab = (url = "alt://home"): Tab => ({
    id: crypto.randomUUID(),
    title: inferTitle(url),
    url,
    history: [url],
    cursor: 0,
    reloadToken: 0,
  });

  const [tabs, setTabs] = useState<Tab[]>(() => [makeTab("alt://home")]);
  const [activeId, setActiveId] = useState<string>(() => tabs[0].id);
  const addressRef = useRef<HTMLInputElement>(null);
  const [addressValue, setAddressValue] = useState<string>(() => tabs[0].url);

  const [publishedToken, setPublishedToken] = useState<number>(0);
  const [publishedSites, setPublishedSites] = useState<PublishedSiteMeta[]>([]);
  const [publishedLoading, setPublishedLoading] = useState(true);
  const [publishedError, setPublishedError] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const [carCid, setCarCid] = useState("");
  const [carFile, setCarFile] = useState<File | null>(null);
  const [onionAddress, setOnionAddress] = useState("");
  const [carLoading, setCarLoading] = useState(false);
  const [carError, setCarError] = useState("");
  const carImportBusy = useRef(false);
  const [siteState, setSiteState] = useState<{ slug: string; loading: boolean; site: PublishedSite | null; error: string } | null>(null);
  const siteFrameRef = useRef<HTMLIFrameElement>(null);
  const deletingSites = useRef(new Set<string>());

  useEffect(() => {
    let active = true; setPublishedLoading(true);
    listPublishedSites().then(result => { if (active) { setPublishedSites(result.sites); setPublishedError(result.warning); } }, () => {
      if (!active) return;
      setPublishedSites([]);
      setPublishedError("Не удалось прочитать локальные публикации. Повторите попытку после восстановления хранилища.");
    }).finally(() => { if (active) setPublishedLoading(false); });
    return () => { active = false; };
  }, [publishedToken]);

  const activeTab = useMemo(
    () => tabs.find((t) => t.id === activeId) ?? tabs[0],
    [tabs, activeId]
  );

  useEffect(() => {
    const slug = parseSiteSlug(activeTab?.url || "");
    if (!slug) { setSiteState(null); return; }
    let active = true;
    setSiteState({ slug, loading: true, site: null, error: "" });
    getPublishedSite(slug).then(site => { if (active) setSiteState({ slug, loading: false, site, error: "" }); }, () => {
      if (active) setSiteState({ slug, loading: false, site: null, error: "Не удалось прочитать публикацию. Проверьте доступность хранилища и повторите попытку." });
    });
    return () => { active = false; };
  }, [activeTab?.url, activeTab?.reloadToken, publishedToken]);

  const activeUrl = activeTab?.url;
  useEffect(() => {
    if (activeUrl !== undefined) setAddressValue(activeUrl);
  }, [activeTab?.id, activeUrl]);

  const canGoBack = !!activeTab && activeTab.cursor > 0;
  const canGoForward =
    !!activeTab && activeTab.cursor < (activeTab.history?.length ?? 1) - 1;

  const setActiveUrl = (nextUrlRaw: string) => {
    const nextUrl = normalizeToUrl(nextUrlRaw);
    setTabs((prev) =>
      prev.map((t) => {
        if (t.id !== activeId) return t;

        const history = Array.isArray(t.history) && t.history.length > 0 ? t.history : [t.url];
        const cursor = typeof t.cursor === "number" ? t.cursor : history.length - 1;
        const current = history[cursor] ?? t.url;
        if (current === nextUrl) {
          return { ...t, url: nextUrl, title: inferTitle(nextUrl) };
        }

        const nextHistory = history.slice(0, cursor + 1);
        nextHistory.push(nextUrl);
        return {
          ...t,
          url: nextUrl,
          title: inferTitle(nextUrl),
          history: nextHistory,
          cursor: nextHistory.length - 1,
        };
      })
    );
  };

  useEffect(() => {
    const slug = parseSiteSlug(activeTab?.url || "");
    const site = slug && siteState?.slug === slug ? siteState.site : null;
    if (!slug || !site) return;
    const pages = site.pages?.map(page => page.path) ?? ["index.html"];
    const onMessage = (event: MessageEvent) => {
      if (event.source !== siteFrameRef.current?.contentWindow || !event.data || event.data.type !== "altnet.local-page" ||
          typeof event.data.path !== "string" || !pages.includes(event.data.path)) return;
      const fragment = event.data.fragment;
      if (fragment !== undefined && (typeof fragment !== "string" || (fragment !== "" && !/^[a-zA-Z0-9_-]{1,128}$/.test(fragment)))) return;
      setActiveUrl(`alt://site/${slug}${event.data.path === "index.html" ? "" : `/${event.data.path}`}${fragment ? `#${fragment}` : ""}`);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
    // Функция привязана к активной вкладке и публикации.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, activeTab?.url, siteState]);

  const deletePublication = async (slug: string, returnHome: boolean) => {
    if (deletingSites.current.has(slug)) return;
    if (!window.confirm("Удалить эту локальную публикацию?")) return;
    deletingSites.current.add(slug);
    try {
      await deletePublishedSite(slug);
      setPublishedError(""); setPublishedToken(value => value + 1);
      if (returnHome) setActiveUrl("alt://home");
    } catch (error) {
      const detail = error instanceof Error && error.message ? ` ${error.message}` : "";
      setPublishedError(`Не удалось полностью удалить публикацию. Проверьте хранилище и повторите попытку.${detail}`);
    } finally {
      deletingSites.current.delete(slug);
    }
  };

  const goBack = () => {
    setTabs((prev) =>
      prev.map((t) => {
        if (t.id !== activeId) return t;
        if (t.cursor <= 0) return t;
        const nextCursor = t.cursor - 1;
        const url = t.history[nextCursor] ?? t.url;
        return { ...t, cursor: nextCursor, url, title: inferTitle(url) };
      })
    );
  };

  const goForward = () => {
    setTabs((prev) =>
      prev.map((t) => {
        if (t.id !== activeId) return t;
        if (t.cursor >= t.history.length - 1) return t;
        const nextCursor = t.cursor + 1;
        const url = t.history[nextCursor] ?? t.url;
        return { ...t, cursor: nextCursor, url, title: inferTitle(url) };
      })
    );
  };

  const refresh = () => {
    setTabs((prev) =>
      prev.map((t) => (t.id === activeId ? { ...t, reloadToken: Date.now() } : t))
    );
  };

  const newTab = (url = "alt://home") => {
    const u = normalizeToUrl(url);
    const t = makeTab(u);
    setTabs((prev) => [...prev, t]);
    setActiveId(t.id);
    setTimeout(() => addressRef.current?.focus(), 0);
  };

  const closeTab = (id: string) => {
    setTabs((prev) => {
      if (prev.length === 1) return prev; // не закрываем последнюю
      const idx = prev.findIndex((t) => t.id === id);
      const nextTabs = prev.filter((t) => t.id !== id);

      if (id === activeId) {
        const next = nextTabs[idx] ?? nextTabs[idx - 1] ?? nextTabs[0];
        if (next) setActiveId(next.id);
      }
      return nextTabs;
    });
  };

  // Хоткеи: Ctrl+T (новая), Ctrl+W (закрыть), Ctrl+L (фокус адреса), Ctrl+R (обновить), Alt+←/→ (история)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ctrlOrMeta = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();

      if (e.altKey && e.key === "ArrowLeft") {
        e.preventDefault();
        goBack();
        return;
      }
      if (e.altKey && e.key === "ArrowRight") {
        e.preventDefault();
        goForward();
        return;
      }

      if (!ctrlOrMeta) return;
      if (k === "t") {
        e.preventDefault();
        newTab();
      } else if (k === "w") {
        e.preventDefault();
        closeTab(activeId);
      } else if (k === "l") {
        e.preventDefault();
        addressRef.current?.focus();
        addressRef.current?.select();
      } else if (k === "r") {
        e.preventDefault();
        refresh();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, tabs, activeTab]);

  // Навигация извне (например: конструктор “Опубликовать” -> открыть alt://site/...) 
  useEffect(() => {
    if (!navRequest?.url) return;
    setPublishedToken(Date.now());
    setActiveUrl(navRequest.url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navRequest?.token]);

  // Отправка адреса
  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setActiveUrl(addressValue);
  };

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus("Адрес скопирован.");
    } catch {
      setCopyStatus("Не удалось скопировать адрес. Выделите и скопируйте его вручную.");
    }
  };

  const importCar = async (source: "file" | "onion") => {
    if (carImportBusy.current || (source === "file" && !carFile)) return;
    carImportBusy.current = true;
    setCarLoading(true);
    setCarError("");
    try {
      const {parseSiteRoot,verifySitePackage,SITE_MAX_CAR_BYTES} = await import("../core/sites/ipfsSitePackage");
      const root = parseSiteRoot(carCid.trim()).toString();
      let data: Uint8Array;
      if (source === "file") {
        if (!carFile || !carFile.size || carFile.size > SITE_MAX_CAR_BYTES) throw new Error("Некорректный размер файла CAR.");
        data = new Uint8Array(await carFile.arrayBuffer());
      } else {
        const { fetchOnionCar } = await import("../core/sites/onionCar");
        data = await fetchOnionCar(onionAddress.trim(), root);
      }
      const site = await verifySitePackage(data, root);
      const home = site.pages.find(page => page.path === "index.html");
      if (!home) throw new Error("В пакете нет главной страницы.");
      const meta = await upsertPublishedSite({title:site.title || home.title || "Сайт",html:home.html,...(site.pages.length > 1 ? {pages:site.pages} : {})});
      setPublishedToken(Date.now());
      setCarFile(null);
      setCarCid("");
      setActiveUrl(`alt://site/${meta.slug}`);
    } catch (error) {
      setCarError(error instanceof Error ? error.message : "Не удалось проверить пакет сайта.");
    } finally {
      carImportBusy.current = false;
      setCarLoading(false);
    }
  };

  const renderHome = () => {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-white/80">
          <div className="text-white/90 text-xl font-semibold mb-2">Домашняя .alt</div>
          <div className="text-white/70 text-sm">
            Введите адрес <code className="text-white/90">alt://имя</code> или откройте опубликованный сайт.
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onOpenBuilder}
              className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white"
            >
              Создать / опубликовать сайт
            </button>
            <button
              type="button"
              onClick={() => setActiveUrl("alt://site/demo")}
              className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20"
              title="Открыть демо-страницу (если опубликована)"
            >
              Открыть demo
            </button>
          </div>
        </div>

        <details className="rounded-2xl border border-white/10 bg-white/5 p-4 text-white/80">
          <summary className="cursor-pointer font-semibold">Открыть IPFS-пакет CAR с устройства</summary>
          <p className="mt-2 text-sm text-white/70">Пакет проверяется по CID и открывается локально. Сверьте CID с адресом, полученным от автора по доверенному каналу: CID подтверждает содержимое, но не личность автора.</p>
          <label className="mt-3 block text-sm">CID сайта
            <input aria-label="CID сайта для импорта" value={carCid} onChange={event => setCarCid(event.target.value)} disabled={carLoading} autoComplete="off" spellCheck={false} className="mt-1 block w-full rounded border border-white/20 bg-[#0c0f1a] p-2 text-white" />
          </label>
          <label className="mt-3 block text-sm">Файл CAR
            <input aria-label="Файл CAR" type="file" accept=".car,application/vnd.ipld.car" disabled={carLoading} onChange={event => setCarFile(event.target.files?.[0] ?? null)} className="mt-1 block w-full text-sm" />
          </label>
          <button type="button" disabled={carLoading || !carFile || !carCid.trim()} onClick={() => void importCar("file")} className="mt-3 rounded bg-indigo-600 px-3 py-2 text-white disabled:opacity-40">{carLoading ? "Проверяем…" : "Проверить и открыть"}</button>
          <div className="mt-4 border-t border-white/10 pt-3">
            <p className="text-sm text-white/70">Или получите CAR от известного onion-шлюза IPFS через подключённый Tor. Автоматический поиск участников и сетевая публикация пока не подключены.</p>
            <label className="mt-3 block text-sm">Адрес onion-шлюза
              <input aria-label="Адрес onion-шлюза" value={onionAddress} onChange={event => setOnionAddress(event.target.value)} disabled={carLoading} autoComplete="off" spellCheck={false} placeholder="адрес.onion" className="mt-1 block w-full rounded border border-white/20 bg-[#0c0f1a] p-2 text-white" />
            </label>
            <button type="button" disabled={carLoading || !onionAddress.trim() || !carCid.trim()} onClick={() => void importCar("onion")} className="mt-3 rounded bg-indigo-600 px-3 py-2 text-white disabled:opacity-40">{carLoading ? "Загружаем и проверяем…" : "Получить через Tor и открыть"}</button>
          </div>
          {carError && <p role="alert" className="mt-2 text-sm text-amber-300">{carError}</p>}
        </details>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-white/80">
          <div className="flex items-center justify-between gap-3">
            <div className="text-white/90 font-semibold">Опубликованные сайты</div>
            <div className="text-white/50 text-xs">{publishedSites.length} шт.</div>
          </div>

          {publishedLoading ? <div role="status" className="mt-3 text-sm text-white/60">Загружаем локальные публикации…</div> : publishedSites.length === 0 && publishedError ? null : publishedSites.length === 0 ? (
            <div className="mt-3 text-sm text-white/60">
              Пока ничего не опубликовано. Нажмите <span className="text-white/90">«Создать / опубликовать сайт»</span>.
            </div>
          ) : (
            <div className="mt-3 divide-y divide-white/10">
              {publishedSites.map((s) => {
                const url = `alt://site/${s.slug}`;
                return (
                  <div key={s.slug} className="py-3 flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setActiveUrl(url)}
                      className="text-left flex-1 min-w-0"
                      title={url}
                    >
                      <div className="text-white/90 font-medium truncate">{s.title}</div>
                      <div className="text-white/50 text-xs truncate">{url}</div>
                      <div className="text-white/40 text-[11px]">обновлён: {fmtTime(s.updatedAt)}</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => copyText(url)}
                      className="px-2 py-1 rounded-md bg-white/10 hover:bg-white/20 text-white/80 text-xs"
                      title="Скопировать адрес"
                    >
                      Копировать
                    </button>
                    <button
                      type="button"
                      onClick={() => void deletePublication(s.slug, false)}
                      className="px-2 py-1 rounded-md bg-white/10 hover:bg-white/20 text-white/80 text-xs"
                      title="Удалить локальную публикацию"
                    >
                      Удалить
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderSite = (slug: string, path: string | null) => {
    const state = siteState?.slug === slug ? siteState : null;
    const url = activeTab?.url || `alt://site/${slug}`;

    if (!state || state.loading) return <div role="status" className="p-6 text-sm text-white/70">Открываем локальную публикацию…</div>;
    if (state.error) return <div role="alert" className="rounded-2xl border border-amber-400/50 p-6 text-amber-100">{state.error}</div>;
    const site = state.site;

    if (!site) {
      return (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-white/80">
          <div className="text-white/90 text-xl font-semibold mb-2">Сайт не найден</div>
          <div className="text-white/70 text-sm">
            Публикация <span className="text-white/90">{url}</span> отсутствует на этом устройстве.
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setActiveUrl("alt://home")}
              className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20"
            >
              На главную
            </button>
            <button
              type="button"
              onClick={onOpenBuilder}
              className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white"
            >
              Открыть конструктор
            </button>
          </div>
        </div>
      );
    }

    const page = path === "index.html" ? { title: site.title, html: site.html } : site.pages?.find(item => item.path === path);
    if (!page) return <div role="alert" className="rounded-2xl border border-white/10 bg-white/5 p-6 text-white/80">
      Страница отсутствует в локальной публикации. <button type="button" className="underline" onClick={() => setActiveUrl(`alt://site/${slug}`)}>На главную сайта</button>
    </div>;

    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
        <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-white/90 font-semibold truncate">{page.title}</div>
            <div className="text-white/50 text-xs truncate">{url}</div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => copyText(url)}
              className="px-2 py-1 rounded-md bg-white/10 hover:bg-white/20 text-white/80 text-xs"
              title="Скопировать адрес"
            >
              Копировать
            </button>
            <button
              type="button"
              onClick={() => void deletePublication(slug, true)}
              className="px-2 py-1 rounded-md bg-white/10 hover:bg-white/20 text-white/80 text-xs"
              title="Удалить локальную публикацию"
            >
              Удалить
            </button>
          </div>
        </div>

        {site.storageWarning && <p role="alert" className="px-3 py-2 text-xs text-amber-300">{site.storageWarning}</p>}
        <p className="px-3 py-2 text-xs text-[#c9d0e9]">В локальном просмотре внешние ссылки, формы и медиа отключены до подключения защищённого маршрута.</p>
        <LocalSiteFrame key={`${activeTab.id}:${activeTab.url}:${activeTab.reloadToken}:${publishedToken}`}
          frameRef={siteFrameRef} title={page.title} html={page.html}
          paths={site.pages?.map(item => item.path) ?? ["index.html"]} fragment={url.split("#")[1] || ""}
        />
      </div>
    );
  };

  const renderExternal = (url: string) => {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-white/80">
        <div className="text-white/90 text-xl font-semibold mb-2">Внешний адрес</div>
        <div className="text-white/70 text-sm">
          Пока это эмуляция запроса: <span className="text-white/90">{url}</span>
        </div>
        <div className="text-white/50 text-xs mt-3">
          В реальной реализации доступ к внешним адресам будет зависеть от профиля приватности (Анонимный / Приватный быстрый).
        </div>
      </div>
    );
  };

  // Контент вкладки
  const renderPage = () => {
    const url = activeTab?.url || "alt://home";
    if (url.startsWith("alt://home")) return renderHome();
    if (url.startsWith("alt://site/")) {
      const slug = parseSiteSlug(url);
      if (!slug) return <div role="alert" className="p-6 text-amber-100">Некорректный адрес сайта.</div>;
      return renderSite(slug, parseSitePath(url));
    }
    if (url.startsWith("http://") || url.startsWith("https://")) return renderExternal(url);

    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-white/80">
        <div className="text-white/90 text-xl font-semibold mb-2">Неподдерживаемый адрес</div>
        <div className="text-white/70 text-sm">
          URL: <span className="text-white/90">{url}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {publishedError && <div role="alert" className="rounded-lg border border-amber-500/50 bg-amber-950/70 p-3 text-sm text-amber-100">{publishedError} <button type="button" className="underline" onClick={() => setPublishedToken(value => value + 1)}>Повторить</button></div>}
      {copyStatus && <div role="status" className="rounded-lg border border-white/20 p-2 text-sm text-white/80">{copyStatus} <button type="button" className="underline" onClick={() => setCopyStatus("")}>Закрыть</button></div>}
      {/* Табы */}
      <div className="rounded-xl bg-white/5 border border-white/10 px-2 py-1 overflow-x-auto">
        <div className="flex items-center gap-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveId(t.id)}
              className={`group max-w-[240px] flex items-center gap-2 px-3 py-1.5 rounded-lg transition
                ${t.id === activeId ? "bg-white/20 text-white" : "bg-transparent text-white/80 hover:bg-white/10 hover:text-white"}`}
              title={t.url}
            >
              <span className="truncate">{t.title}</span>
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(t.id);
                }}
                className="opacity-60 group-hover:opacity-100"
                title="Закрыть вкладку"
              >
                <X size={14} />
              </span>
            </button>
          ))}
          <button
            onClick={() => newTab()}
            className="ml-1 px-2 py-1 rounded-md bg-white/10 hover:bg-white/20"
            title="Новая вкладка (Ctrl+T)"
          >
            <Plus size={16} />
          </button>
        </div>
      </div>

      {/* Панель навигации */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={goBack}
          disabled={!canGoBack}
          className={`px-2 py-2 rounded-lg border border-white/10 ${
            canGoBack ? "bg-white/5 hover:bg-white/10 text-white" : "bg-white/5 text-white/30 cursor-not-allowed"
          }`}
          title="Назад (Alt+←)"
        >
          <ArrowLeft size={18} />
        </button>
        <button
          type="button"
          onClick={goForward}
          disabled={!canGoForward}
          className={`px-2 py-2 rounded-lg border border-white/10 ${
            canGoForward ? "bg-white/5 hover:bg-white/10 text-white" : "bg-white/5 text-white/30 cursor-not-allowed"
          }`}
          title="Вперёд (Alt+→)"
        >
          <ArrowRight size={18} />
        </button>
        <button
          type="button"
          onClick={refresh}
          className="px-2 py-2 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-white"
          title="Обновить (Ctrl+R)"
        >
          <RotateCw size={18} />
        </button>

        {/* Адресная строка */}
        <form onSubmit={onSubmit} className="flex-1 flex gap-2">
          <input
            ref={addressRef}
            value={addressValue}
            onChange={(e) => setAddressValue(e.currentTarget.value)}
            onFocus={(e) => e.currentTarget.select()}
            placeholder="alt://home или alt://site/имя"
            className="flex-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 outline-none text-white/90 placeholder-white/40"
          />
          <button
            type="submit"
            className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20"
            title="Перейти по адресу (Enter)"
          >
            Перейти
          </button>
        </form>

        <button
          type="button"
          onClick={onOpenBuilder}
          className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white"
          title="Открыть конструктор сайта"
        >
          Создать сайт
        </button>
      </div>

      {/* Контент вкладки */}
      {renderPage()}
    </div>
  );
}
