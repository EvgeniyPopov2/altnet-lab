import { useEffect, useMemo, useState } from "react";
import "./index.css";
import { AnimatePresence, motion } from "framer-motion";

import BrowserAlt from "./screens/BrowserAlt";
import SiteBuilder from "./screens/SiteBuilder";
import ExploreDiscover from "./screens/ExploreDiscover";
import Messages, { type DmContact } from "./screens/Messages";
import Servers, { type ServerItem } from "./screens/Servers";

import QuickSwitcher, { QSItem } from "./components/QuickSwitcher";
import NetStatus from "./components/NetStatus";
import { usePrivacyProfile } from "./core/settings/profile";
import { SecurityCoach } from "./core/security/coach";
import { usePanicMode } from "./core/security/usePanicMode";
import SecurityCoachHost from "./components/security/SecurityCoachHost";

type Section = "feed" | "messages" | "servers" | "explore" | "browser" | "reputation" | "profile";
type RailView = "global" | "messages" | "servers";

const RailBtn = ({
  icon,
  label,
  active,
  onClick,
}: {
  icon: string;
  label: string;
  active?: boolean;
  onClick: () => void;
}) => (
  <button
    title={label}
    onClick={onClick}
    className={`w-12 h-12 rounded-2xl flex items-center justify-center transition
      ${active ? "bg-indigo-600 text-white" : "bg-white/10 text-white/80 hover:bg-white/20 hover:text-white"}`}
  >
    <span className="text-lg">{icon}</span>
  </button>
);

const ListItem = ({
  title,
  subtitle,
  active,
  onClick,
}: {
  title: string;
  subtitle?: string;
  active?: boolean;
  onClick?: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`w-full text-left p-2 rounded-lg transition text-white/90
      ${active ? "bg-white/15" : "bg-white/5 hover:bg-white/10"}`}
  >
    <div className="text-sm font-medium truncate">{title}</div>
    {subtitle && <div className="text-xs text-white/60 truncate">{subtitle}</div>}
  </button>
);

export default function App() {
  const [section, setSection] = useState<Section>("feed");
  const [rail, setRail] = useState<RailView>("global");
  const [builderOpen, setBuilderOpen] = useState(false);
  const [qsOpen, setQsOpen] = useState(false);

  // === Профиль сети (глобальный, хранится в localStorage) ===
  const [profile, setProfile] = usePrivacyProfile();

  // === Паника (локальный fail-closed режим) ===
  const [panic, setPanic] = usePanicMode();

  // Данные (моки)
  const dmList: DmContact[] = useMemo(
    () => [
      { id: "henk", title: "Henk", subtitle: "в сети • 5 мин назад", caps: { supportsAnon: true, supportsFast: true } },
      { id: "valerych", title: "Валерыч", subtitle: "anon-only • не в сети", caps: { supportsAnon: true, supportsFast: false } },
      { id: "crystal", title: "Crystallick", subtitle: "fast-only • новое: 3", caps: { supportsAnon: false, supportsFast: true } },
      { id: "dencoldgrey", title: "dencoldgrey", subtitle: "Пишет…", caps: { supportsAnon: true, supportsFast: true } },
      { id: "curdone", title: "Curd_one", subtitle: "AFK", caps: { supportsAnon: true, supportsFast: true } },
    ],
    []
  );

  const serverList: ServerItem[] = useMemo(
    () => [
      { id: "wt", title: "War Thunder", subtitle: "текст/голос • 1.2k онлайн" },
      { id: "cheb", title: "Cheburashka Lab", subtitle: "вики/файлы • 302 онлайн" },
      { id: "altdev", title: "AltNet Dev", subtitle: "вики/чат • 53 онлайн" },
      { id: "mid", title: "Midjourney", subtitle: "image-gen • 12k онлайн" },
    ],
    []
  );

  const [selectedDmId, setSelectedDmId] = useState<string>(dmList[0]?.id ?? "henk");
  const [selectedServerId, setSelectedServerId] = useState<string>(serverList[0]?.id ?? "wt");

  const selectedDm = useMemo(() => dmList.find((d) => d.id === selectedDmId) ?? dmList[0], [dmList, selectedDmId]);
  const selectedServer = useMemo(
    () => serverList.find((s) => s.id === selectedServerId) ?? serverList[0],
    [serverList, selectedServerId]
  );

  // Заголовок шапки
  const headerTitle = useMemo(() => {
    switch (section) {
      case "feed":
        return "Лента";
      case "messages":
        return "Сообщения";
      case "servers":
        return "Серверы";
      case "explore":
        return "Путешествия";
      case "browser":
        return builderOpen ? "Конструктор сайта" : "Браузер .alt";
      case "reputation":
        return "Репутация";
      case "profile":
        return "Профиль";
      default:
        return "";
    }
  }, [section, builderOpen]);

  // Навигация
  const openFeed = () => {
    setSection("feed");
    setRail("global");
  };
  const openMessages = () => {
    setSection("messages");
    setRail("messages");
  };
  const openServers = () => {
    setSection("servers");
    setRail("servers");
  };
  const openExplore = () => {
    setSection("explore");
    setRail("global");
  };
  const openBrowser = () => {
    setSection("browser");
    setRail("global");
    setBuilderOpen(false);
  };
  const openReputation = () => {
    setSection("reputation");
    setRail("global");
  };
  const openProfile = () => {
    setSection("profile");
    setRail("global");
  };

  // Security Coach: показываем краткую подсказку при смене профиля
  useEffect(() => {
    SecurityCoach.intro(profile);
  }, [profile]);

  // Quick Switcher — цели
  const qsItems: QSItem[] = useMemo(() => {
    const base: QSItem[] = [
      { id: "s:feed", kind: "section", label: "Лента", action: openFeed },
      { id: "s:messages", kind: "section", label: "Сообщения", action: openMessages },
      { id: "s:servers", kind: "section", label: "Серверы", action: openServers },
      { id: "s:explore", kind: "section", label: "Путешествия", action: openExplore },
      { id: "s:browser", kind: "section", label: "Браузер .alt", action: openBrowser },
      { id: "s:reputation", kind: "section", label: "Репутация", action: openReputation },
      { id: "s:profile", kind: "section", label: "Профиль", action: openProfile },
    ];

    const dms: QSItem[] = dmList.map((d) => ({
      id: `dm:${d.id}`,
      kind: "dm",
      label: d.title,
      hint: "Личные сообщения",
      action: () => {
        setSelectedDmId(d.id);
        openMessages();
      },
    }));

    const servers: QSItem[] = serverList.map((s) => ({
      id: `sv:${s.id}`,
      kind: "server",
      label: s.title,
      hint: s.subtitle ?? "Сервер",
      action: () => {
        setSelectedServerId(s.id);
        openServers();
      },
    }));

    return [...base, ...dms, ...servers];
  }, [dmList, serverList]); // eslint-disable-line react-hooks/exhaustive-deps

  // Хоткей Ctrl/Cmd + K
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ctrlOrMeta = e.ctrlKey || e.metaKey;
      if (ctrlOrMeta && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setQsOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Плавная ширина бара
  const railWidthPx = rail === "global" ? 80 : 288;

  // Плашка профиля в шапке
  const ProfileSwitch = () => (
    <div className="hidden md:flex items-center gap-1 bg-white/10 rounded-xl p-1">
      <button
        onClick={() => setProfile("anon")}
        className={`px-2.5 py-1 rounded-lg text-sm ${profile === "anon" ? "bg-white/20 text-white" : "text-white/70 hover:bg-white/15"}`}
        title="Анонимный (Tor/I2P)"
      >
        🕶️ Анонимный
      </button>
      <button
        onClick={() => setProfile("fast")}
        className={`px-2.5 py-1 rounded-lg text-sm ${profile === "fast" ? "bg-white/20 text-white" : "text-white/70 hover:bg-white/15"}`}
        title="Приватный быстрый (Yggdrasil/WireGuard)"
      >
        ⚡ Быстрый
      </button>
    </div>
  );

  const PanicPill = () =>
    panic ? (
      <button
        type="button"
        onClick={() => setPanic(false)}
        className="hidden md:inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm border border-red-500/30 bg-red-500/15 hover:bg-red-500/20 text-red-200"
        title="Паника включена: сетевые действия блокируются. Нажмите, чтобы выключить."
      >
        🛑 Паника
      </button>
    ) : null;

  return (
    <div className="min-h-screen flex">
      {/* ЛЕВЫЙ БАР */}
      <motion.aside
        className="transition-all duration-200 bg-white/5 border-r border-white/10 flex flex-col gap-3 py-3"
        initial={false}
        animate={{ width: railWidthPx }}
        transition={{ type: "spring", stiffness: 260, damping: 30 }}
      >
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
              <button
                className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20"
                title="Назад к разделам"
                onClick={() => setRail("global")}
              >
                ←
              </button>
              <div className="text-white/80 font-semibold">Личные сообщения</div>
            </div>
            <div className="rounded-xl bg-white/5 border border-white/10 p-2 mb-2">
              <input
                placeholder="Найти или начать беседу"
                className="w-full bg-transparent outline-none text-sm text-white/90 placeholder-white/40"
              />
            </div>
            <div className="flex-1 overflow-y-auto space-y-1 pr-1">
              {dmList.map((d) => (
                <ListItem
                  key={d.id}
                  title={d.title}
                  subtitle={d.subtitle}
                  active={selectedDmId === d.id}
                  onClick={() => {
                    setSelectedDmId(d.id);
                    setSection("messages");
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {rail === "servers" && (
          <div className="h-full flex flex-col px-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <button
                  className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20"
                  title="Назад к разделам"
                  onClick={() => setRail("global")}
                >
                  ←
                </button>
                <div className="text-white/80 font-semibold">Серверы</div>
              </div>
              <button className="px-2 py-1 rounded-md bg-white/10 hover:bg-white/20 text-xs">➕ Создать</button>
            </div>
            <div className="rounded-xl bg-white/5 border border-white/10 p-2 mb-2">
              <input placeholder="Поиск серверов" className="w-full bg-transparent outline-none text-sm text-white/90 placeholder-white/40" />
            </div>
            <div className="flex-1 overflow-y-auto space-y-1 pr-1">
              {serverList.map((s) => (
                <ListItem
                  key={s.id}
                  title={s.title}
                  subtitle={s.subtitle}
                  active={selectedServerId === s.id}
                  onClick={() => {
                    setSelectedServerId(s.id);
                    setSection("servers");
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {/* Профиль — внизу */}
        <div className="mt-auto px-4">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500 flex items-center justify-center font-bold">E</div>
          <div className="mt-2 grid grid-cols-3 gap-1">
            <button className="h-8 rounded-lg bg-white/10 hover:bg-white/20 text-xs" title="Статус">
              ●
            </button>
            <button className="h-8 rounded-lg bg-white/10 hover:bg-white/20 text-xs" title="Настройки" onClick={openProfile}>
              ⚙️
            </button>
            <button
              className={`h-8 rounded-lg text-xs ${section === "profile" ? "bg-indigo-600" : "bg-white/10 hover:bg-white/20"}`}
              title="Профиль"
              onClick={openProfile}
            >
              👤
            </button>
          </div>
        </div>
      </motion.aside>

      {/* ПРАВО — КОНТЕНТ */}
      <div className="flex-1 flex flex-col">
        <header className="px-4 py-3 border-b border-white/10 bg-white/5 flex items-center justify-between">
          <motion.div
            className="text-lg font-semibold text-white/90"
            key={`hdr-${section}`}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15 }}
          >
            {headerTitle}
          </motion.div>
          <div className="flex items-center gap-2">
            <PanicPill />
            <ProfileSwitch />
            <button
              className="px-3 py-1.5 rounded-full text-sm bg-white/10 hover:bg-white/20"
              onClick={() => setQsOpen(true)}
              title="Быстрый переход (Ctrl+K)"
            >
              ⌘K / Ctrl+K
            </button>
            <button className="px-3 py-1.5 rounded-full text-sm bg-white/10 hover:bg-white/20">📥 Почта</button>
            <button className="px-3 py-1.5 rounded-full text-sm bg-white/10 hover:bg-white/20">❓ Поддержка</button>
          </div>
        </header>

        <div className="p-4">
          <AnimatePresence mode="wait">
            <motion.main
              key={section + (builderOpen ? "-builder" : "")}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
            >
              {section === "browser" &&
                (builderOpen ? <SiteBuilder onClose={() => setBuilderOpen(false)} /> : <BrowserAlt onOpenBuilder={() => setBuilderOpen(true)} />)}

              {section === "feed" && (
                <div className="space-y-4">
                  <NetStatus profile={profile} onChangeProfile={setProfile} />
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-white/80">Популярное рядом (моки) — позже.</div>
                </div>
              )}

              {section === "messages" && selectedDm && <Messages profile={profile} dm={selectedDm} />}

              {section === "servers" && selectedServer && <Servers profile={profile} server={selectedServer} />}

              {section === "explore" && <ExploreDiscover />}

              {section === "reputation" && (
                <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-white/80">Публичные метки, жалобы, арбитраж (моки).</div>
              )}

              {section === "profile" && (
                <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-white/80 space-y-4">
                  <div>
                    <div className="text-white/90 font-semibold">Сетевой профиль</div>
                    <div className="text-sm text-white/60 mt-1">Профиль влияет на транспорт и ограничения приватности (fail-closed).</div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setProfile("anon")}
                      className={`px-3 py-1.5 rounded-lg ${profile === "anon" ? "bg-indigo-600 text-white" : "bg-white/10 hover:bg-white/20"}`}
                    >
                      🕶️ Анонимный
                    </button>
                    <button
                      onClick={() => setProfile("fast")}
                      className={`px-3 py-1.5 rounded-lg ${profile === "fast" ? "bg-indigo-600 text-white" : "bg-white/10 hover:bg-white/20"}`}
                    >
                      ⚡ Быстрый
                    </button>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <div className="text-white/90 font-semibold">Безопасность</div>
                    <div className="mt-2 text-sm text-white/70">
                      Если вы подозреваете компрометацию устройства — включите «Панику». Это заблокирует сетевые действия и покажет чек‑лист.
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => SecurityCoach.suspectedCompromise()}
                        className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-semibold"
                      >
                        🛑 Я думаю, устройство скомпрометировано
                      </button>
                      {panic && (
                        <button
                          type="button"
                          onClick={() => setPanic(false)}
                          className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/90"
                        >
                          Выключить панику
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </motion.main>
          </AnimatePresence>
        </div>
      </div>

      {/* Quick Switcher */}
      <QuickSwitcher open={qsOpen} onClose={() => setQsOpen(false)} items={qsItems} />

      {/* Security Coach popover */}
      <SecurityCoachHost />
    </div>
  );
}
