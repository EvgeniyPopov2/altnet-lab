import { useEffect, useMemo, useRef, useState } from "react";

type Tab = {
  id: string;
  title: string;
  url: string;
};

export default function BrowserAlt({ onOpenBuilder }: { onOpenBuilder: () => void }) {
  // Начальные вкладки
  const [tabs, setTabs] = useState<Tab[]>([
    { id: crypto.randomUUID(), title: ".alt старт", url: "alt://home" },
  ]);
  const [activeId, setActiveId] = useState<string>(() => tabs[0].id);
  const addressRef = useRef<HTMLInputElement>(null);

  const activeTab = useMemo(
    () => tabs.find((t) => t.id === activeId) ?? tabs[0],
    [tabs, activeId]
  );

  const setActiveUrl = (url: string) => {
    setTabs((prev) =>
      prev.map((t) =>
        t.id === activeId ? { ...t, url, title: inferTitle(url) } : t
      )
    );
  };

  const inferTitle = (url: string) => {
    try {
      // простая эвристика под .alt адреса
      if (url.startsWith("alt://")) {
        const path = url.slice("alt://".length) || "home";
        return path.split(/[/?#]/)[0] || ".alt";
      }
      // если http(s) — взять хост
      const u = new URL(url);
      return u.host || url;
    } catch {
      return url || ".alt";
    }
  };

  const newTab = (url = "alt://home") => {
    const t: Tab = { id: crypto.randomUUID(), title: inferTitle(url), url };
    setTabs((prev) => [...prev, t]);
    setActiveId(t.id);
    setTimeout(() => addressRef.current?.focus(), 0);
  };

  const closeTab = (id: string) => {
    if (tabs.length === 1) return; // не закрываем последнюю
    setTabs((prev) => prev.filter((t) => t.id !== id));
    if (id === activeId) {
      // переключиться на соседнюю
      const idx = tabs.findIndex((t) => t.id === id);
      const next = tabs[idx + 1] ?? tabs[idx - 1];
      if (next) setActiveId(next.id);
    }
  };

  // Хоткеи: Ctrl+T (новая), Ctrl+W (закрыть), Ctrl+L (фокус адреса)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ctrlOrMeta = e.ctrlKey || e.metaKey;
      if (!ctrlOrMeta) return;
      const k = e.key.toLowerCase();
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
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, tabs]);

  // Отправка адреса
  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const value = addressRef.current?.value?.trim();
    if (!value) return;
    let url = value;
    if (!value.includes("://")) {
      // по умолчанию считаем .alt адрес
      url = "alt://" + value.replace(/^\/+/, "");
    }
    setActiveUrl(url);
  };

  // Простой плейсхолдер «контента страницы»
  const renderPage = () => {
    const url = activeTab?.url || "alt://home";
    if (url.startsWith("alt://home")) {
      return (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-white/80">
          <div className="text-white/90 text-xl font-semibold mb-2">Домашняя .alt</div>
          <div className="text-white/70 text-sm">
            Это плейсхолдер .alt-браузера. Введи адрес <code className="text-white/90">alt://имя</code> или нажми «Создать сайт».
          </div>
        </div>
      );
    }
    if (url.startsWith("alt://site/")) {
      const name = url.slice("alt://site/".length).split(/[?#]/)[0] || "безымянный";
      return (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-white/80">
          <div className="text-white/90 text-xl font-semibold mb-2">Сайт «{name}»</div>
          <div className="text-white/70 text-sm">
            Заглушка просмотра статического сайта (экспорт из Конструктора будет открываться здесь).
          </div>
        </div>
      );
    }
    if (url.startsWith("http://") || url.startsWith("https://")) {
      return (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-white/80">
          <div className="text-white/90 text-xl font-semibold mb-2">Внешний адрес</div>
          <div className="text-white/70 text-sm">Эмуляция запроса: <span className="text-white/90">{url}</span></div>
        </div>
      );
    }
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-white/80">
        <div className="text-white/90 text-xl font-semibold mb-2">Неподдерживаемый адрес</div>
        <div className="text-white/70 text-sm">URL: <span className="text-white/90">{url}</span></div>
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
                onClick={(e) => { e.stopPropagation(); closeTab(t.id); }}
                className="opacity-60 group-hover:opacity-100"
                title="Закрыть вкладку"
              >
                ✕
              </span>
            </button>
          ))}
          <button
            onClick={() => newTab()}
            className="ml-1 px-2 py-1 rounded-md bg-white/10 hover:bg-white/20"
            title="Новая вкладка (Ctrl+T)"
          >
            +
          </button>
        </div>
      </div>

      {/* Адресная строка + Создать сайт */}
      <form onSubmit={onSubmit} className="flex gap-2">
        <input
          ref={addressRef}
          defaultValue={activeTab?.url}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={(e) => {
            // синхронизация value при потере фокуса (если меняли активную вкладку)
            if (e.currentTarget.value !== activeTab?.url) {
              e.currentTarget.value = activeTab?.url ?? "";
            }
          }}
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
        <button
          type="button"
          onClick={onOpenBuilder}
          className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white"
          title="Открыть конструктор сайта"
        >
          Создать сайт
        </button>
      </form>

      {/* Контент вкладки */}
      {renderPage()}
    </div>
  );
}
