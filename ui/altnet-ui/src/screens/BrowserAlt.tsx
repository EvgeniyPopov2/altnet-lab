import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { ArrowLeft, ArrowRight, Globe2, House, Pencil, Plus, RotateCw, Star, X } from "lucide-react";
import "./browserAlt.css";
import LocalSiteFrame from "../components/LocalSiteFrame";
import { BOOKMARKS_KEY, readBookmarks, toggleBookmark, type BrowserBookmark } from "../core/sites/browserBookmarks";
import { browserTabTitle, createBrowserTab, parseBrowserAddress, type BrowserTab } from "../core/sites/browserNavigation";
import type { VerifiedSite } from "../core/sites/ipfsSitePackage";
import { encodeSitePath } from "../core/sites/sitePath";
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

function parseSiteSlug(url: string): string | null {
  try { const address = parseBrowserAddress(url); return address.kind === "site" ? address.slug : null; } catch { return null; }
}

function parseSitePath(url: string): string | null {
  try { const address = parseBrowserAddress(url); return address.kind === "site" ? address.path : null; } catch { return null; }
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
  onNavConsumed,
  tabs,
  setTabs,
  activeId,
  setActiveId,
}: {
  onOpenBuilder: () => void;
  navRequest?: NavRequest | null;
  onNavConsumed: (token: number) => void;
  tabs: BrowserTab[];
  setTabs: Dispatch<SetStateAction<BrowserTab[]>>;
  activeId: string;
  setActiveId: Dispatch<SetStateAction<string>>;
}) {
  const addressRef = useRef<HTMLInputElement>(null);
  const [addressValue, setAddressValue] = useState<string>(() => tabs[0].url);
  const [navigationError, setNavigationError] = useState("");
  const [bookmarks, setBookmarks] = useState<BrowserBookmark[]>([]);
  const [bookmarksError, setBookmarksError] = useState("");
  const [bookmarksOpen, setBookmarksOpen] = useState(false);

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
  const [ipfsState, setIpfsState] = useState<{ root: string; loading: boolean; site: VerifiedSite | null; error: string } | null>(null);
  const [ipfsDeleteError, setIpfsDeleteError] = useState("");
  const deletingIpfs = useRef(new Set<string>());
  const siteFrameRef = useRef<HTMLIFrameElement>(null);
  const deletingSites = useRef(new Set<string>());

  useEffect(() => {
    const read = () => {
      try { setBookmarks(readBookmarks(localStorage)); setBookmarksError(""); }
      catch { setBookmarksError("Не удалось прочитать закладки. Сохранённые данные не изменены."); }
    };
    read();
    const onStorage = (event: StorageEvent) => { if (event.key === BOOKMARKS_KEY || event.key === null) read(); };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

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

  useEffect(() => {
    let address;
    try { address = parseBrowserAddress(activeTab?.url || ""); } catch { setIpfsState(null); return; }
    if (address.kind !== "ipfs") { setIpfsState(null); return; }
    let active = true;
    const root = address.root;
    setIpfsState({ root, loading: true, site: null, error: "" });
    import("../core/sites/ipfsSiteCache").then(({ readCachedSite }) => readCachedSite(root)).then(site => {
      if (active) setIpfsState({ root, loading: false, site, error: "" });
    }, error => {
      if (active) setIpfsState({ root, loading: false, site: null, error: error instanceof Error ? error.message : "Не удалось проверить локальную копию IPFS." });
    });
    return () => { active = false; };
  }, [activeTab?.url, activeTab?.reloadToken]);

  const activeUrl = activeTab?.url;
  useEffect(() => {
    if (activeUrl !== undefined) setAddressValue(activeUrl);
  }, [activeTab?.id, activeUrl]);

  const canGoBack = !!activeTab && activeTab.cursor > 0;
  const canGoForward =
    !!activeTab && activeTab.cursor < (activeTab.history?.length ?? 1) - 1;
  const activeSlug = parseSiteSlug(activeTab?.url || "");
  const activePath = parseSitePath(activeTab?.url || "");
  const currentSite = activeSlug && siteState?.slug === activeSlug ? siteState.site : null;
  const activeAddress = useMemo(() => { try { return parseBrowserAddress(activeTab?.url || ""); } catch { return null; } }, [activeTab?.url]);
  const currentIpfs = activeAddress?.kind === "ipfs" && ipfsState?.root === activeAddress.root ? ipfsState.site : null;
  const currentPage = activeAddress?.kind === "ipfs" ? currentIpfs?.pages.find(page => page.path === activeAddress.path) : currentSite && activePath === "index.html" ? { title: currentSite.title } : currentSite?.pages?.find(page => page.path === activePath);
  const canBookmark = Boolean((currentSite || currentIpfs) && currentPage && activeTab);
  const bookmarked = !!activeTab && bookmarks.some(item => item.url === activeTab.url);

  const changeBookmark = (url: string, title: string) => {
    try { setBookmarks(toggleBookmark(localStorage, url, title)); setBookmarksError(""); }
    catch (error) { setBookmarksError(error instanceof Error ? error.message : "Не удалось сохранить закладку."); }
  };

  const setActiveUrl = (nextUrlRaw: string) => {
    let nextUrl: string;
    try { nextUrl = parseBrowserAddress(nextUrlRaw).url; }
    catch (error) { setNavigationError(error instanceof Error ? error.message : "Некорректный адрес."); return; }
    setNavigationError("");
    setAddressValue(nextUrl);
    setTabs((prev) =>
      prev.map((t) => {
        if (t.id !== activeId) return t;

        const history = Array.isArray(t.history) && t.history.length > 0 ? t.history : [t.url];
        const cursor = typeof t.cursor === "number" ? t.cursor : history.length - 1;
        const current = history[cursor] ?? t.url;
        if (current === nextUrl) {
          return { ...t, url: nextUrl, title: browserTabTitle(nextUrl) };
        }

        const nextHistory = history.slice(0, cursor + 1);
        nextHistory.push(nextUrl);
        return {
          ...t,
          url: nextUrl,
          title: browserTabTitle(nextUrl),
          history: nextHistory,
          cursor: nextHistory.length - 1,
        };
      })
    );
  };

  useEffect(() => {
    const slug = parseSiteSlug(activeTab?.url || "");
    const site = slug && siteState?.slug === slug ? siteState.site : null;
    const ipfs = activeAddress?.kind === "ipfs" && ipfsState?.root === activeAddress.root ? ipfsState.site : null;
    if (!site && !ipfs) return;
    const pages = ipfs ? ipfs.pages.map(page => page.path) : site?.pages?.map(page => page.path) ?? ["index.html"];
    const onMessage = (event: MessageEvent) => {
      if (event.source !== siteFrameRef.current?.contentWindow || !event.data || event.data.type !== "altnet.local-page" ||
          typeof event.data.path !== "string" || !pages.includes(event.data.path)) return;
      const fragment = event.data.fragment;
      if (fragment !== undefined && (typeof fragment !== "string" || (fragment !== "" && !/^[a-zA-Z0-9_-]{1,128}$/.test(fragment)))) return;
      const base = ipfs ? `ipfs://${ipfs.root}` : `alt://site/${slug}`;
      setActiveUrl(`${base}${event.data.path === "index.html" ? "" : `/${ipfs ? encodeSitePath(event.data.path) : event.data.path}`}${fragment ? `#${fragment}` : ""}`);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
    // Функция привязана к активной вкладке и публикации.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, activeTab?.url, siteState, ipfsState, activeAddress]);

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
    setNavigationError("");
    setTabs((prev) =>
      prev.map((t) => {
        if (t.id !== activeId) return t;
        if (t.cursor <= 0) return t;
        const nextCursor = t.cursor - 1;
        const url = t.history[nextCursor] ?? t.url;
        return { ...t, cursor: nextCursor, url, title: browserTabTitle(url) };
      })
    );
  };

  const goForward = () => {
    setNavigationError("");
    setTabs((prev) =>
      prev.map((t) => {
        if (t.id !== activeId) return t;
        if (t.cursor >= t.history.length - 1) return t;
        const nextCursor = t.cursor + 1;
        const url = t.history[nextCursor] ?? t.url;
        return { ...t, cursor: nextCursor, url, title: browserTabTitle(url) };
      })
    );
  };

  const refresh = () => {
    setTabs((prev) =>
      prev.map((t) => (t.id === activeId ? { ...t, reloadToken: Date.now() } : t))
    );
  };

  const newTab = (url = "alt://home") => {
    const u = parseBrowserAddress(url).url;
    const t = createBrowserTab(u);
    setTabs((prev) => [...prev, t]);
    setActiveId(t.id);
    setNavigationError("");
    setTimeout(() => addressRef.current?.focus(), 0);
  };

  const closeTab = (id: string) => {
    if (tabs.length <= 1) return;
    const index = tabs.findIndex(tab => tab.id === id);
    if (index < 0) return;
    const remaining = tabs.filter(tab => tab.id !== id);
    if (id === activeId) setActiveId((remaining[index] ?? remaining[index - 1] ?? remaining[0]).id);
    setTabs(current => current.length > 1 ? current.filter(tab => tab.id !== id) : current);
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
    onNavConsumed(navRequest.token);
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

  const deleteIpfsCopy = async (root: string) => {
    if (deletingIpfs.current.has(root) || !window.confirm("Удалить локальную копию IPFS? Закладки и другие публикации сохранятся.")) return;
    deletingIpfs.current.add(root);
    try {
      const { deleteCachedSite } = await import("../core/sites/ipfsSiteCache");
      await deleteCachedSite(root);
      setIpfsDeleteError("");
      setIpfsState(current => current?.root === root ? { root, loading: false, site: null, error: "" } : current);
    } catch {
      setIpfsDeleteError("Не удалось удалить локальную копию IPFS; повторите попытку.");
    } finally { deletingIpfs.current.delete(root); }
  };

  const importCar = async (source: "file" | "onion") => {
    if (carImportBusy.current || (source === "file" && !carFile)) return;
    carImportBusy.current = true;
    setCarLoading(true);
    setCarError("");
    try {
      const {SITE_MAX_CAR_BYTES} = await import("../core/sites/ipfsSitePackage");
      const {parseBrowserRoot} = await import("../core/sites/siteCid");
      const root = parseBrowserRoot(carCid.trim()).toString();
      let data: Uint8Array;
      if (source === "file") {
        if (!carFile || !carFile.size || carFile.size > SITE_MAX_CAR_BYTES) throw new Error("Некорректный размер файла CAR.");
        data = new Uint8Array(await carFile.arrayBuffer());
      } else {
        const { fetchOnionCar } = await import("../core/sites/onionCar");
        data = await fetchOnionCar(onionAddress.trim(), root);
      }
      const { cacheVerifiedSite } = await import("../core/sites/ipfsSiteCache");
      const site = await cacheVerifiedSite(data, root);
      if (parseBrowserRoot(root).code !== 0x71) {
        setCarFile(null); setCarCid(""); setActiveUrl(`ipfs://${site.root}`); return;
      }
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

  const openOnionShare = async (address: Extract<NonNullable<typeof activeAddress>, { kind: "onion-share" }>) => {
    if (carImportBusy.current) return;
    const originalTab = activeTab;
    carImportBusy.current = true;
    setCarLoading(true);
    setCarError("");
    try {
      const { fetchOnionCar } = await import("../core/sites/onionCar");
      const bytes = await fetchOnionCar(address.onion, address.root);
      const { cacheVerifiedSite } = await import("../core/sites/ipfsSiteCache");
      await cacheVerifiedSite(bytes, address.root);
      const nextUrl = `ipfs://${address.root}`;
      setTabs(previous => previous.map(tab => {
        // A completed download must not redirect a tab that the user has since navigated.
        if (tab !== originalTab || tab.url !== address.url) return tab;
        const history = tab.history.slice(0, tab.cursor + 1).concat(nextUrl);
        return { ...tab, url: nextUrl, title: browserTabTitle(nextUrl), history, cursor: history.length - 1 };
      }));
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
            Откройте локальный сайт по адресу <code className="text-white/90">alt://site/имя</code> или ранее проверенную копию по <code className="text-white/90">ipfs://CID</code>.
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onOpenBuilder}
              className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white"
            >
              Создать / опубликовать сайт
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
            <p className="text-sm text-white/70">Или получите CAR от известного onion-шлюза IPFS через подключённый Tor. Автоматический поиск участников и постоянная сетевая публикация пока не подключены.</p>
            <label className="mt-3 block text-sm">Адрес onion-шлюза
              <input aria-label="Адрес onion-шлюза" value={onionAddress} onChange={event => setOnionAddress(event.target.value)} disabled={carLoading} autoComplete="off" spellCheck={false} placeholder="адрес.onion" className="mt-1 block w-full rounded border border-white/20 bg-[#0c0f1a] p-2 text-white" />
            </label>
            <button type="button" disabled={carLoading || !onionAddress.trim() || !carCid.trim()} onClick={() => void importCar("onion")} className="mt-3 rounded bg-indigo-600 px-3 py-2 text-white disabled:opacity-40">{carLoading ? "Загружаем и проверяем…" : "Получить через Tor и открыть"}</button>
          </div>
          {carError && <p role="alert" className="mt-2 text-sm text-amber-300">{carError}</p>}
        </details>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-white/80">
          <div className="flex items-center justify-between gap-3">
            <div className="text-white/90 font-semibold">Локальные сайты</div>
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
          Открытие обычных веб-сайтов пока не подключено: <span className="text-white/90">{url}</span>
        </div>
        <div className="text-white/50 text-xs mt-3">
          Сетевой запрос не выполнялся. Внешний доступ требует защищённого транспорта и изоляции сайтов.
        </div>
      </div>
    );
  };

  const renderIpfs = (address: Extract<NonNullable<typeof activeAddress>, { kind: "ipfs" }>) => {
    const state = ipfsState?.root === address.root ? ipfsState : null;
    if (!state || state.loading) return <div role="status" className="p-6 text-sm text-white/70">Проверяем локальную копию IPFS…</div>;
    if (state.error) return <div role="alert" className="rounded-2xl border border-amber-400/50 p-6 text-amber-100">{state.error} <button type="button" className="underline" onClick={() => void deleteIpfsCopy(address.root)}>Удалить копию IPFS</button></div>;
    if (!state.site) return <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-white/80">
      <div className="text-xl font-semibold">Локальная копия IPFS не найдена</div>
      <p className="mt-2 text-sm">Автоматический поиск в сети пока не подключён. Импортируйте CAR с этим CID на главной странице.</p>
      <button type="button" className="mt-3 rounded bg-white/10 px-3 py-2" onClick={() => { setCarCid(address.root); setActiveUrl("alt://home"); }}>На главную</button>
    </div>;
    const page = state.site.pages.find(item => item.path === address.path);
    if (!page) return <div role="alert" className="p-6 text-amber-100">Страница отсутствует в проверенном пакете. <button type="button" className="underline" onClick={() => setActiveUrl(`ipfs://${address.root}`)}>На главную сайта</button></div>;
    return <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div className="min-w-0"><div className="truncate font-semibold text-white/90">{page.title}</div><div className="truncate text-xs text-white/50">{address.url}</div></div>
        <div className="flex gap-2"><button type="button" onClick={() => copyText(address.url)} className="rounded-md bg-white/10 px-2 py-1 text-xs text-white/80" title="Скопировать адрес">Копировать</button>
          <button type="button" onClick={() => void deleteIpfsCopy(address.root)} className="rounded-md bg-white/10 px-2 py-1 text-xs text-white/80">Удалить копию IPFS</button></div>
      </div>
      <p className="px-3 py-2 text-xs text-[#c9d0e9]">Локальная копия проверена по CID. Авторство не подтверждено; скрипты и внешние ресурсы отключены. Часть форматов и ресурсов CSS пока не поддерживается.</p>
      <LocalSiteFrame key={`${activeTab.id}:${address.url}:${activeTab.reloadToken}`} frameRef={siteFrameRef} title={page.title} html={page.html} paths={state.site.pages.map(item => item.path)} fragment={address.fragment} resources={state.site.resources} pagePath={page.path} />
    </div>;
  };

  // Контент вкладки
  const renderPage = () => {
    const url = activeTab?.url || "alt://home";
    if (url === "alt://home") return renderHome();
    if (activeAddress?.kind === "ipfs") return renderIpfs(activeAddress);
    if (activeAddress?.kind === "onion-share") {
      const address = activeAddress;
      return <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-white/80">
        <h2 className="text-xl font-semibold text-white">Получить сайт через Tor</h2>
        <p className="mt-2 text-sm">Ссылка указывает на временную раздачу. При загрузке узел увидит запрос к сайту; содержимое будет проверено по CID, но авторство не подтверждено.</p>
        <p className="mt-3 break-all text-sm">Узел: <code>{address.onion}</code></p>
        <p className="break-all text-sm">CID: <code>{address.root}</code></p>
        <button type="button" disabled={carLoading} onClick={() => void openOnionShare(address)} className="mt-4 rounded bg-indigo-600 px-3 py-2 text-white disabled:opacity-40">{carLoading ? "Загружаем и проверяем…" : "Получить и открыть"}</button>
        {carError && <p role="alert" className="mt-3 text-amber-300">{carError}</p>}
      </div>;
    }
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
    <div className="browser-workspace">
      {publishedError && <div role="alert" className="rounded-lg border border-amber-500/50 bg-amber-950/70 p-3 text-sm text-amber-100">{publishedError} <button type="button" className="underline" onClick={() => setPublishedToken(value => value + 1)}>Повторить</button></div>}
      {bookmarksError && <div role="alert" className="rounded-lg border border-amber-500/50 bg-amber-950/70 p-3 text-sm text-amber-100">{bookmarksError}</div>}
      {ipfsDeleteError && <div role="alert" className="rounded-lg border border-amber-500/50 bg-amber-950/70 p-3 text-sm text-amber-100">{ipfsDeleteError}</div>}
      {copyStatus && <div role="status" className="rounded-lg border border-white/20 p-2 text-sm text-white/80">{copyStatus} <button type="button" className="underline" onClick={() => setCopyStatus("")}>Закрыть</button></div>}
      <div className="browser-chrome">
      <div className="browser-tab-strip">
        <div role="tablist" aria-label="Вкладки браузера" className="browser-tabs" onKeyDown={event => {
          if (!(event.target instanceof HTMLElement) || event.target.getAttribute("role") !== "tab" || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
          const index = tabs.findIndex(tab => tab.id === activeId);
          const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
          event.preventDefault();
          setActiveId(tabs[next].id);
          setNavigationError("");
          const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]');
          buttons[next]?.focus();
        }}>
          {tabs.map((t) => (
            <div key={t.id} className={`browser-tab ${t.id === activeId ? "browser-tab--active" : ""}`}>
              <button type="button" role="tab" aria-selected={t.id === activeId} tabIndex={t.id === activeId ? 0 : -1} onClick={() => { setActiveId(t.id); setNavigationError(""); }} className="browser-tab-label" title={t.url}><Globe2 size={15} aria-hidden="true" /><span>{t.title}</span></button>
              <button type="button" disabled={tabs.length === 1} onClick={() => closeTab(t.id)} className="browser-tab-close" aria-label={`Закрыть вкладку ${t.title}`} title="Закрыть вкладку"><X size={14} /></button>
            </div>
          ))}
          <button
            onClick={() => newTab()}
            type="button"
            className="browser-new-tab"
            title="Новая вкладка (Ctrl+T)"
            aria-label="Новая вкладка"
          >
            <Plus size={16} />
          </button>
        </div>
      </div>

      <div className="browser-toolbar">
        <div className="browser-navigation">
        <button
          type="button"
          onClick={goBack}
          disabled={!canGoBack}
          className="browser-icon-button"
          title="Назад (Alt+←)"
          aria-label="Назад"
        >
          <ArrowLeft size={18} />
        </button>
        <button
          type="button"
          onClick={goForward}
          disabled={!canGoForward}
          className="browser-icon-button"
          title="Вперёд (Alt+→)"
          aria-label="Вперёд"
        >
          <ArrowRight size={18} />
        </button>
        <button
          type="button"
          onClick={refresh}
          className="browser-icon-button"
          title="Обновить (Ctrl+R)"
          aria-label="Обновить"
        >
          <RotateCw size={18} />
        </button>
        <button type="button" onClick={() => setActiveUrl("alt://home")} className="browser-icon-button" title="Домашняя страница" aria-label="Домашняя страница"><House size={18} /></button>
        </div>

        {/* Адресная строка */}
        <form onSubmit={onSubmit} className="browser-address">
          <Globe2 size={16} className="browser-address-icon" aria-hidden="true" />
          <input
            ref={addressRef}
            value={addressValue}
            onChange={(e) => setAddressValue(e.currentTarget.value)}
            onFocus={(e) => e.currentTarget.select()}
            placeholder="Введите адрес Alt или IPFS"
            aria-label="Адрес сайта"
            aria-invalid={Boolean(navigationError)}
            aria-describedby={navigationError ? "browser-address-error" : undefined}
            autoComplete="off"
            spellCheck={false}
            className="browser-address-input"
          />
          <button
            type="submit"
            className="browser-address-submit"
            title="Перейти по адресу (Enter)"
            aria-label="Перейти"
          >
            <ArrowRight size={17} aria-hidden="true" />
          </button>
        </form>

        <div className="browser-actions">
        <button type="button" disabled={!canBookmark || Boolean(bookmarksError)} aria-label={bookmarked ? "Убрать страницу из закладок" : "Добавить страницу в закладки"}
          aria-pressed={bookmarked} title={bookmarked ? "Убрать страницу из закладок" : "Добавить страницу в закладки"}
          onClick={() => activeTab && currentPage && changeBookmark(activeTab.url, currentPage.title)}
          className="browser-icon-button"><Star size={18} fill={bookmarked ? "currentColor" : "none"} /></button>
        <button type="button" aria-expanded={bookmarksOpen} aria-controls="browser-bookmarks" onClick={() => setBookmarksOpen(value => !value)} className="browser-bookmarks-button">Закладки <span>{bookmarks.length}</span></button>

        <button
          type="button"
          onClick={onOpenBuilder}
          className="browser-create-button"
          title="Открыть конструктор сайта"
          aria-label="Создать сайт"
        >
          <Pencil size={14} aria-hidden="true" /><span>Создать сайт</span>
        </button>
        </div>
      </div>
      </div>

      {navigationError && <p id="browser-address-error" role="alert" className="rounded-lg border border-amber-500/50 bg-amber-950/70 px-3 py-2 text-sm text-amber-100">{navigationError}</p>}
      {bookmarksOpen && <section id="browser-bookmarks" aria-label="Закладки" className="rounded-xl border border-white/10 bg-white/5 p-4">
        <p className="text-sm text-white/70">Закладки сохраняются на этом устройстве. Адреса указывают на локальные копии сайтов.</p>
        {bookmarks.length === 0 ? <p className="mt-3 text-sm text-white/60">Закладок пока нет.</p> : <ul className="mt-3 divide-y divide-white/10">{bookmarks.map(item => <li key={item.url} className="flex items-center gap-2 py-2">
          <button type="button" onClick={() => { setActiveUrl(item.url); setBookmarksOpen(false); }} className="min-w-0 flex-1 text-left"><span className="block truncate text-sm text-white">{item.title}</span><span className="block truncate text-xs text-white/60">{item.url}</span></button>
          <button type="button" onClick={() => changeBookmark(item.url, item.title)} className="rounded border border-white/20 px-2 py-1 text-xs text-white/80" aria-label={`Удалить закладку ${item.title}`}>Удалить</button>
        </li>)}</ul>}
      </section>}

      {/* Контент вкладки */}
      {renderPage()}
    </div>
  );
}
