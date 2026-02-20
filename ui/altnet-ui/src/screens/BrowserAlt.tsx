import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Plus, RotateCw, X } from "lucide-react";
import {
  deletePublishedSite,
  getPublishedSite,
  listPublishedSites,
  type PublishedSiteMeta,
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
  const slug = rest.split(/[?#]/)[0];
  return slug ? slug : null;
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
  const publishedSites = useMemo<PublishedSiteMeta[]>(
    () => listPublishedSites(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [publishedToken]
  );

  const activeTab = useMemo(
    () => tabs.find((t) => t.id === activeId) ?? tabs[0],
    [tabs, activeId]
  );

  useEffect(() => {
    if (!activeTab) return;
    setAddressValue(activeTab.url);
  }, [activeTab?.id, activeTab?.url]);

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
    } catch {
      // fail-silent
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

        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-white/80">
          <div className="flex items-center justify-between gap-3">
            <div className="text-white/90 font-semibold">Опубликованные сайты</div>
            <div className="text-white/50 text-xs">{publishedSites.length} шт.</div>
          </div>

          {publishedSites.length === 0 ? (
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
                      onClick={() => {
                        deletePublishedSite(s.slug);
                        setPublishedToken(Date.now());
                      }}
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

  const renderSite = (slug: string) => {
    const site = getPublishedSite(slug);
    const url = `alt://site/${slug}`;

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

    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
        <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-white/90 font-semibold truncate">{site.title}</div>
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
              onClick={() => {
                deletePublishedSite(slug);
                setPublishedToken(Date.now());
                setActiveUrl("alt://home");
              }}
              className="px-2 py-1 rounded-md bg-white/10 hover:bg-white/20 text-white/80 text-xs"
              title="Удалить локальную публикацию"
            >
              Удалить
            </button>
          </div>
        </div>

        <iframe
          key={`${activeTab.id}:${activeTab.reloadToken}:${publishedToken}`}
          title={site.title}
          sandbox=""
          srcDoc={site.html}
          className="w-full h-[70vh] bg-white"
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
      const slug = parseSiteSlug(url) ?? "";
      return renderSite(slug);
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
