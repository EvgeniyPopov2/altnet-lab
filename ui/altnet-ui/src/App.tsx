import { useEffect, useState } from "react";
import "./index.css";
import BrowserAlt from "./screens/BrowserAlt";
import SiteBuilder from "./screens/SiteBuilder";
import ExploreDiscover from "./screens/ExploreDiscover";
import QuickSwitcher, { QSItem } from "./components/QuickSwitcher"; // [QS]

type Section = "feed" | "messages" | "servers" | "explore" | "browser" | "reputation" | "profile";
type RailView = "global" | "messages" | "servers";

const RailBtn = ({ icon, label, active, onClick }: { icon: string; label: string; active?: boolean; onClick: () => void }) => (
  <button
    title={label}
    onClick={onClick}
    className={`w-12 h-12 rounded-2xl flex items-center justify-center transition
      ${active ? "bg-indigo-600 text-white" : "bg-white/10 text-white/80 hover:bg-white/20 hover:text-white"}`}
  >
    <span className="text-lg">{icon}</span>
  </button>
);

const ListItem = ({ title, subtitle }: { title: string; subtitle?: string }) => (
  <div className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition text-white/90">
    <div className="text-sm font-medium truncate">{title}</div>
    {subtitle && <div className="text-xs text-white/60 truncate">{subtitle}</div>}
  </div>
);

export default function App() {
  const [section, setSection] = useState<Section>("feed");
  const [rail, setRail] = useState<RailView>("global");
  const [builderOpen, setBuilderOpen] = useState(false);

  // [QS] состояние
  const [qsOpen, setQsOpen] = useState(false);

  const openFeed = () => { setSection("feed"); setRail("global"); };
  const openMessages = () => { setSection("messages"); setRail("messages"); };
  const openServers = () => { setSection("servers"); setRail("servers"); };
  const openExplore = () => { setSection("explore"); setRail("global"); };
  const openBrowser = () => { setSection("browser"); setRail("global"); setBuilderOpen(false); };
  const openReputation = () => { setSection("reputation"); setRail("global"); };
  const openProfile = () => { setSection("profile"); setRail("global"); };

  const railWidth = rail === "global" ? "w-20" : "w-72";

  // [QS] список целей
  const qsItems: QSItem[] = [
    { id: "s:feed", kind: "section", label: "Лента", action: openFeed },
    { id: "s:messages", kind: "section", label: "Сообщения", action: openMessages },
    { id: "s:servers", kind: "section", label: "Серверы", action: openServers },
    { id: "s:explore", kind: "section", label: "Путешествия", action: openExplore },
    { id: "s:browser", kind: "section", label: "Браузер .alt", action: openBrowser },
    { id: "s:reputation", kind: "section", label: "Репутация", action: openReputation },
    { id: "dm:henk", kind: "dm", label: "Henk", hint: "Личные сообщения", action: openMessages },
    { id: "dm:valerych", kind: "dm", label: "Валерыч", hint: "Личные сообщения", action: openMessages },
    { id: "sv:wt", kind: "server", label: "War Thunder", hint: "текст/голос • 1.2k онлайн", action: openServers },
    { id: "sv:altdev", kind: "server", label: "AltNet Dev", hint: "вики/чат • 53 онлайн", action: openServers },
    { id: "sv:mid", kind: "server", label: "Midjourney", hint: "image-gen • 12k онлайн", action: openServers },
  ];

  // [QS] хоткей Ctrl+K
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ctrlOrMeta = e.ctrlKey || e.metaKey;
      if (ctrlOrMeta && (e.key.toLowerCase() === "k")) {
        e.preventDefault();
        setQsOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="min-h-screen flex">
      {/* ЛЕВЫЙ БАР */}
      <aside className={`${railWidth} transition-all duration-200 bg-white/5 border-r border-white/10 flex flex-col gap-3 py-3`}>
        {rail === "global" && (
          <div className="flex flex-col items-center gap-3">
            <RailBtn icon="🏠" label="Лента" active={section === "feed"} onClick={openFeed} />
            <RailBtn icon="💬" label="Сообщения" active={section === "messages"} onClick={openMessages} />
            <RailBtn icon="🧩" label="Серверы" active={section === "servers"} onClick={openServers} />
            <RailBtn icon="🧭" label="Путешествия" active={section === "explore"} onClick={openExplore} />
            <RailBtn icon="🌐" label="Браузер .alt" active={section === "browser"} onClick={openBrowser} />
            <RailBtn icon="🛡️" label="Репутация" active={section === "reputation"} onClick={openReputation} />
          </div>
        )}

        {rail === "messages" && (
          <div className="h-full flex flex-col px-3">
            <div className="flex items-center gap-2 mb-2">
              <button className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20" title="Назад к разделам" onClick={()=>setRail("global")}>←</button>
              <div className="text-white/80 font-semibold">Личные сообщения</div>
            </div>
            <div className="rounded-xl bg-white/5 border border-white/10 p-2 mb-2">
              <input placeholder="Найти или начать беседу" className="w-full bg-transparent outline-none text-sm text-white/90 placeholder-white/40"/>
            </div>
            <div className="flex-1 overflow-y-auto space-y-1 pr-1">
              <ListItem title="Henk" subtitle="в сети • 5 мин назад" />
              <ListItem title="Валерыч" subtitle="не в сети" />
              <ListItem title="dencoldgrey" subtitle="Пишет…" />
              <ListItem title="Curd_one" subtitle="AFK" />
              <ListItem title="Crystallick" subtitle="новое: 3" />
            </div>
          </div>
        )}

        {rail === "servers" && (
          <div className="h-full flex flex-col px-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <button className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20" title="Назад к разделам" onClick={()=>setRail("global")}>←</button>
                <div className="text-white/80 font-semibold">Серверы</div>
              </div>
              <button className="px-2 py-1 rounded-md bg-white/10 hover:bg-white/20 text-xs">➕ Создать</button>
            </div>
            <div className="rounded-xl bg-white/5 border border-white/10 p-2 mb-2">
              <input placeholder="Поиск серверов" className="w-full bg-transparent outline-none text-sm text-white/90 placeholder-white/40"/>
            </div>
            <div className="flex-1 overflow-y-auto space-y-1 pr-1">
              <ListItem title="War Thunder" subtitle="текст/голос • 1.2k онлайн" />
              <ListItem title="Cheburashka Lab" subtitle="вики/файлы • 302 онлайн" />
              <ListItem title="AltNet Dev" subtitle="вики/чат • 53 онлайн" />
              <ListItem title="Midjourney" subtitle="image-gen • 12k онлайн" />
            </div>
          </div>
        )}

        <div className="mt-auto px-4">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500 flex items-center justify-center font-bold">E</div>
          <div className="mt-2 grid grid-cols-3 gap-1">
            <button className="h-8 rounded-lg bg-white/10 hover:bg-white/20 text-xs" title="Статус">●</button>
            <button className="h-8 rounded-lg bg-white/10 hover:bg-white/20 text-xs" title="Настройки">⚙️</button>
            <button className={`h-8 rounded-lg text-xs ${section==="profile"?"bg-indigo-600":"bg-white/10 hover:bg-white/20"}`} title="Профиль" onClick={openProfile}>👤</button>
          </div>
        </div>
      </aside>

      {/* ПРАВО — КОНТЕНТ */}
      <div className="flex-1 flex flex-col">
        <header className="px-4 py-3 border-b border-white/10 bg-white/5 flex items-center justify-between">
          <div className="text-lg font-semibold text-white/90">
            {section === "feed" && "Лента"}
            {section === "messages" && "Сообщения"}
            {section === "servers" && "Серверы"}
            {section === "explore" && "Путешествия"}
            {section === "browser" && (builderOpen ? "Конструктор сайта" : "Браузер .alt")}
            {section === "reputation" && "Репутация"}
            {section === "profile" && "Профиль"}
          </div>
          <div className="flex items-center gap-2">
            {/* [QS] кнопка вызова */}
            <button className="px-3 py-1.5 rounded-full text-sm bg-white/10 hover:bg-white/20" onClick={() => setQsOpen(true)} title="Быстрый переход (Ctrl+K)">⌘K / Ctrl+K</button>
            <button className="px-3 py-1.5 rounded-full text-sm bg-white/10 hover:bg-white/20">📥 Почта</button>
            <button className="px-3 py-1.5 rounded-full text-sm bg-white/10 hover:bg-white/20">❓ Поддержка</button>
          </div>
        </header>

        <main className="p-4">
          {section === "browser" && (builderOpen
            ? <SiteBuilder onClose={() => setBuilderOpen(false)} />
            : <BrowserAlt onOpenBuilder={() => setBuilderOpen(true)} />
          )}

          {section === "feed" && (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-white/80">
              Популярное рядом и «Состояние сети» добавим в следующем шаге.
            </div>
          )}

          {section === "messages" && (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-white/80">
              Окно диалога: ввод, стикеры, вложения → CID (моки).
            </div>
          )}

          {section === "servers" && (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-white/80">
              Каналы выбранного сервера (текст/вики/файлы/голос) — моки.
            </div>
          )}

          {section === "explore" && <ExploreDiscover />}

          {section === "reputation" && (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-white/80">
              Публичные метки, жалобы, арбитраж (моки).
            </div>
          )}

          {section === "profile" && (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-white/80">
              Аватар, статус, темы, переключатель профилей сети (Анонимный/Приватный быстрый).
            </div>
          )}
        </main>
      </div>

      {/* [QS] Модалка */}
      <QuickSwitcher open={qsOpen} onClose={() => setQsOpen(false)} items={qsItems} />
    </div>
  );
}
