import { useEffect, useMemo, useRef, useState } from "react";

import "./index.css";
import { AnimatePresence, motion } from "framer-motion";

import BrowserAlt from "./screens/BrowserAlt";
import SiteBuilder from "./screens/SiteBuilder";
import ExploreDiscover from "./screens/ExploreDiscover";
import Messages, { type DmContact } from "./screens/Messages";
import Servers, { type ServerItem } from "./screens/Servers";
import SecurityCenter from "./screens/SecurityCenter";
import Mail from "./screens/Mail";
import QuickSwitcher, { type QSItem } from "./components/QuickSwitcher";
import NetStatus from "./components/NetStatus";
import { usePrivacyProfile } from "./core/settings/profile";
import { SecurityCoach } from "./core/security/coach";
import { pushSecurityEvent } from "./core/security/bus";
import { dismiss, isDismissed } from "./core/security/storage";
import { usePanicMode } from "./core/security/usePanicMode";
import { SecurityCoachHost } from "./components/security/SecurityCoachHost";
import CallWindow, { type CallWindowModel } from "./components/rtc/CallWindow";
import VoiceVideoSettingsModal from "./components/settings/VoiceVideoSettingsModal";
type Section =
  | "feed"
  | "messages"
  | "servers"
  | "explore"
  | "browser"
  | "mail"
  | "reputation"
  | "security"
  | "profile";

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
  const [browserNav, setBrowserNav] = useState<{ url: string; token: number } | null>(null);
  const [qsOpen, setQsOpen] = useState(false);
  const [voiceVideoOpen, setVoiceVideoOpen] = useState(false);
  // === Профиль сети (глобальный, хранится в localStorage) ===
  const [profile, setProfile] = usePrivacyProfile();

  // Security Coach: короткая подсказка при смене профиля (можно отключить в тосте)
  useEffect(() => {
    SecurityCoach.intro(profile);
  }, [profile]);

  // === Паника (локальный fail-closed режим) ===
  const [panic, setPanic] = usePanicMode();

  // === Глобальное окно звонка (UI) ===
  const [call, setCall] = useState<CallWindowModel | null>(null);

  const openCall = (next: CallWindowModel) => {
    if (panic) {
      SecurityCoach.deniedByPolicy({
        ok: false,
        code: "PANIC_MODE",
        title: "Действие заблокировано",
        message: "Паника включена: звонки заблокированы (fail-closed).",
        details: ["Выключите «Панику», чтобы продолжить."],
      });
      return;
    }

    if (call) {
      SecurityCoach.deniedByPolicy({
        ok: false,
        code: "CALL_ALREADY_ACTIVE",
        title: "Уже есть активный звонок",
        message: "Сейчас поддерживаем один звонок за раз. Завершите текущий звонок, чтобы начать новый.",
        details: ["Если звонок «завис» — нажмите «Завершить» в окне звонка."],
      });
      return;
    }

    setCall(next);
  };

  useEffect(() => {
    if (panic && call) {
      setCall(null);
      SecurityCoach.deniedByPolicy({
        ok: false,
        code: "CALL_ENDED_BY_PANIC",
        title: "Звонок завершён",
        message: "Паника включена: текущий звонок завершён и сетевые действия заблокированы.",
        details: ["Выключите «Панику», когда будете готовы продолжить."],
      });
    }
  }, [panic, call]);


  // Данные (моки)
  const dmList: DmContact[] = useMemo(
    () => [
      { id: "henk", title: "Henk", subtitle: "в сети • 5 мин назад", caps: { contactId: "henk", supportsAnon: true, supportsFast: true } },
      { id: "valerych", title: "Валерыч", subtitle: "anon-only • не в сети", caps: { contactId: "valerych", supportsAnon: true, supportsFast: false } },
      { id: "crystal", title: "Crystallick", subtitle: "fast-only • новое: 3", caps: { contactId: "crystal", supportsAnon: false, supportsFast: true } },
      { id: "dencoldgrey", title: "dencoldgrey", subtitle: "Пишет…", caps: { contactId: "dencoldgrey", supportsAnon: true, supportsFast: true } },
      { id: "curdone", title: "Curd_one", subtitle: "AFK", caps: { contactId: "curdone", supportsAnon: true, supportsFast: true } },
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


  const dashboardStats = useMemo(
    () => ({
      directMessages: dmList.length,
      servers: serverList.length,
      alerts: panic ? 3 : 1,
      activeProfileLabel: profile === "anon" ? "Анонимный" : "Быстрый",
    }),
    [dmList.length, serverList.length, panic, profile]
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
      case "mail":
        return "Почта";
      case "reputation":
        return "Репутация";
      case "security":
        return "Центр безопасности";
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
    const openMail = () => {
    setSection("mail");
    setRail("global");
  };

  const openReputation = () => {
    setSection("reputation");
    setRail("global");
  };
  const openProfile = () => {
    setSection("profile");
    setRail("global");
  };

  const openSecurityCenter = () => {
    setSection("security");
    setRail("global");
  };

  // Если пользователь включил "Панику" — мягко направляем в Security Center
  // (один раз на включение, с возможностью отключить подсказку).
  const prevPanicRef = useRef<boolean>(panic);
  useEffect(() => {
    const prev = prevPanicRef.current;
    prevPanicRef.current = panic;

    if (!prev && panic) {
      const dedupeKey = "panic/security-center";
      if (isDismissed(dedupeKey)) return;

      pushSecurityEvent({
        severity: "warning",
        code: "PANIC_SECURITY_CENTER",
        title: "Паника включена",
        message:
          "Сеть отключена (fail-closed). Рекомендуем открыть Security Center: проверить устройства, отозвать неизвестные и выполнить ротацию.",
        details: [
          "Это подсказка UI (мок). В проде она будет запускаться по сигналам TAL/crypto и состоянию доверия устройств.",
          "Ротация ключей/сессий не спасает, если скомпрометирован корень доверия — в этом случае требуется отзыв устройства.",
        ],
        dedupeKey,
        ttlMs: 15000,
        actions: [
          { label: "Открыть Security Center", kind: "primary", onClick: () => openSecurityCenter() },
          { label: "Не показывать снова", kind: "ghost", onClick: () => dismiss(dedupeKey) },
        ],
      });
    }
  }, [panic]);


  // Quick Switcher — цели
  const qsItems: QSItem[] = useMemo(
    () => [
      { id: "s:feed", kind: "section", label: "Лента", action: openFeed },
      { id: "s:messages", kind: "section", label: "Сообщения", action: openMessages },
      { id: "s:servers", kind: "section", label: "Серверы", action: openServers },
      { id: "s:explore", kind: "section", label: "Путешествия", action: openExplore },
      { id: "s:browser", kind: "section", label: "Браузер .alt", action: openBrowser },
      { id: "s:mail", kind: "section", label: "Почта", action: openMail },
      { id: "s:reputation", kind: "section", label: "Репутация", action: openReputation },
      { id: "s:security", kind: "section", label: "Центр безопасности", action: openSecurityCenter },
      { id: "s:profile", kind: "section", label: "Профиль", action: openProfile },
      { id: "dm:henk", kind: "dm", label: "Henk", hint: "Личные сообщения", action: openMessages },
      { id: "dm:valerych", kind: "dm", label: "Валерыч", hint: "Личные сообщения", action: openMessages },

      { id: "sv:wt", kind: "server", label: "War Thunder", hint: "текст/голос • 1.2k онлайн", action: openServers },
      { id: "sv:altdev", kind: "server", label: "AltNet Dev", hint: "вики/чат • 53 онлайн", action: openServers },
      { id: "sv:mid", kind: "server", label: "Midjourney", hint: "image-gen • 12k онлайн", action: openServers },
    ],
    []
  );

  // Хоткей Ctrl/Cmd + K
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ctrlOrMeta = e.ctrlKey || e.metaKey;
      if (ctrlOrMeta && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setQsOpen(!qsOpen);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [qsOpen]);

  // Плавная ширина бара
  const railWidthPx = rail === "global" ? 80 : 288;

  const ProfileSwitch = () => (
    <div className="hidden md:flex items-center gap-1 bg-white/10 rounded-xl p-1">
      <button
        onClick={() => setProfile("anon")}
        className={`px-2.5 py-1 rounded-lg text-sm ${profile === "anon" ? "bg-white/20 text-white" : "text-white/70 hover:bg-white/15"}`}
        title="Анонимный (Tor/I2P)"
        type="button"
      >
        🕶️ Анонимный
      </button>
      <button
        onClick={() => setProfile("fast")}
        className={`px-2.5 py-1 rounded-lg text-sm ${profile === "fast" ? "bg-white/20 text-white" : "text-white/70 hover:bg-white/15"}`}
        title="Приватный быстрый (Yggdrasil/WireGuard)"
        type="button"
      >
        ⚡ Быстрый
      </button>
    </div>
  );

  const PanicPill = () => (
    <button
      type="button"
      onClick={() => setPanic(!panic)}
      className={[
      "px-3 py-1.5 rounded-full text-sm border",
      panic
        ? "bg-red-600/90 border-red-500 text-white hover:bg-red-600"
        : "bg-white/10 border-white/10 text-white/80 hover:bg-white/20",
      ].join(" ")}
      title={panic ? "Паника включена (fail-closed)" : "Включить панику (fail-closed)"}
    >
      {panic ? "🛑 Паника" : "🛡️ Паника"}
    </button>
  );

  return (
    <div className="h-screen flex overflow-hidden">
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
            <RailBtn icon="⭐" label="Репутация" active={section === "reputation"} onClick={openReputation} />
            <RailBtn icon="🛡️" label="Безопасность" active={section === "security"} onClick={openSecurityCenter} />
            <RailBtn icon="👤" label="Профиль" active={section === "profile"} onClick={openProfile} />
          </div>
        )}

        {rail === "messages" && (
          <div className="flex flex-col h-full px-3">
            <div className="mb-2 flex items-center gap-2">
       
        <div className="text-xs text-white/60">Личные сообщения</div>
      </div>
            <div className="rounded-xl bg-white/5 border border-white/10 p-2 mb-2">
              <input placeholder="Поиск" className="w-full bg-transparent outline-none text-sm text-white/90 placeholder-white/40" />
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
          <div className="flex flex-col h-full px-3">
            <div className="text-xs text-white/60 px-2 mb-2">Серверы</div>
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
            <button className="h-8 rounded-lg bg-white/10 hover:bg-white/20 text-xs" title="Статус" type="button">
              ●
            </button>
            <button className="h-8 rounded-lg bg-white/10 hover:bg-white/20 text-xs" title="Настройки" onClick={openProfile} type="button">
              ⚙️
            </button>
            <button
              className={`h-8 rounded-lg text-xs ${section === "profile" ? "bg-indigo-600" : "bg-white/10 hover:bg-white/20"}`}
              title="Профиль"
              onClick={openProfile}
              type="button"
            >
              👤
            </button>
          </div>
        </div>
      </motion.aside>

      {/* ПРАВО — КОНТЕНТ */}
      <div className="flex-1 flex flex-col">
        <header className="px-4 py-3 border-b border-white/10 bg-white/5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {rail !== "global" && (
              <button
                type="button"
                className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white/80"
                title="Назад к разделам"
                onClick={() => setRail("global")}
              >
                ←
              </button>
            )}

            <motion.div
              className="text-lg font-semibold text-white/90"
              key={`hdr-${section}`}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.15 }}
            >
              {headerTitle}
            </motion.div>
          </div>

          <div className="flex items-center gap-2">
            <PanicPill />
            <ProfileSwitch />
            <button
              className="px-3 py-1.5 rounded-full text-sm bg-white/10 hover:bg-white/20"
              onClick={() => setQsOpen(true)}
              title="Быстрый переход (Ctrl+K)"
              type="button"
            >
              ⌘K / Ctrl+K
            </button>
            <button
              className={`px-3 py-1.5 rounded-full text-sm ${section === "mail" ? "bg-indigo-600/30 hover:bg-indigo-600/40" : "bg-white/10 hover:bg-white/20"
                }`}
              type="button"
              onClick={openMail}
              title="Открыть почту"
            >
              📥 Почта
            </button>

            <button className="px-3 py-1.5 rounded-full text-sm bg-white/10 hover:bg-white/20" type="button">
              ❓ Поддержка
            </button>
          </div>
        </header>

        <div className="flex-1 p-4 overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.main
              key={section + (builderOpen ? "-builder" : "")}
              className="h-full min-h-0"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
            >
              {section === "browser" &&
                (builderOpen ? (
                  <SiteBuilder
                    onClose={() => setBuilderOpen(false)}
                    onPublished={(url) => {
                      setBuilderOpen(false);
                      setBrowserNav({ url, token: Date.now() });
                    }}
                  />
                ) : (
                  <BrowserAlt onOpenBuilder={() => setBuilderOpen(true)} navRequest={browserNav} />
                ))}

              {section === "feed" && (
                <div className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-4">
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <div className="text-xs uppercase tracking-wide text-white/50">Профиль</div>
                      <div className="mt-2 text-lg font-semibold text-white/90">{dashboardStats.activeProfileLabel}</div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <div className="text-xs uppercase tracking-wide text-white/50">DM</div>
                      <div className="mt-2 text-lg font-semibold text-white/90">{dashboardStats.directMessages}</div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <div className="text-xs uppercase tracking-wide text-white/50">Серверы</div>
                      <div className="mt-2 text-lg font-semibold text-white/90">{dashboardStats.servers}</div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <div className="text-xs uppercase tracking-wide text-white/50">Сигналы безопасности</div>
                      <div className="mt-2 text-lg font-semibold text-white/90">{dashboardStats.alerts}</div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-indigo-400/30 bg-indigo-500/10 p-5 text-white/90">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-sm text-indigo-100/80">AltNet Control Center</div>
                        <div className="text-lg font-semibold">Быстрый запуск и проверка контуров приватности</div>
                      </div>
                      <div className="text-xs text-indigo-100/70">Новый блок демо-интерфейса</div>
                    </div>
                    <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                      <button type="button" onClick={openMessages} className="rounded-xl bg-white/10 hover:bg-white/20 px-3 py-2 text-sm text-left">💬 Открыть DM</button>
                      <button type="button" onClick={openServers} className="rounded-xl bg-white/10 hover:bg-white/20 px-3 py-2 text-sm text-left">🧩 Открыть серверы</button>
                      <button type="button" onClick={openSecurityCenter} className="rounded-xl bg-white/10 hover:bg-white/20 px-3 py-2 text-sm text-left">🛡️ Security Center</button>
                      <button type="button" onClick={() => setProfile(profile === "anon" ? "fast" : "anon")} className="rounded-xl bg-white/10 hover:bg-white/20 px-3 py-2 text-sm text-left">🔁 Переключить профиль</button>
                    </div>
                  </div>

                  <NetStatus profile={profile} onChangeProfile={setProfile} />
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-white/80">Популярное рядом (моки) — позже.</div>
                </div>
              )}

              {section === "messages" && selectedDm && (
                <Messages
                  profile={profile}
                  dm={selectedDm}
                  onStartCall={openCall}
                  onOpenVoiceVideoSettings={() => setVoiceVideoOpen(true)}
                />
              )}

              {section === "servers" && selectedServer && (
                <Servers
                  profile={profile}
                  server={selectedServer}
                  onStartCall={openCall}
                  onOpenVoiceVideoSettings={() => setVoiceVideoOpen(true)}
                />
              )}



              {section === "explore" && <ExploreDiscover />}
              {section === "mail" && <Mail profile={profile} />}
              {section === "reputation" && (
                <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-white/80">Публичные метки, жалобы, арбитраж (моки).</div>
              )}
              {section === "security" && <SecurityCenter />}
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
                      type="button"
                    >
                      🕶️ Анонимный
                    </button>
                    <button
                      onClick={() => setProfile("fast")}
                      className={`px-3 py-1.5 rounded-lg ${profile === "fast" ? "bg-indigo-600 text-white" : "bg-white/10 hover:bg-white/20"}`}
                      type="button"
                    >
                      ⚡ Быстрый
                    </button>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <div className="text-white/90 font-semibold">Безопасность</div>
                    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                      <div className="text-white/90 font-semibold">Голос и видео</div>
                      <div className="mt-2 text-sm text-white/70">
                        Настройки микрофона, видео и режимов ввода (VAD/PTT). Часть опций может блокироваться policy профиля.
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setVoiceVideoOpen(true)}
                          className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/90 text-sm"
                        >
                          🎙️ Открыть «Голос и видео»
                        </button>
                      </div>
                    </div>

                    <div className="mt-2 text-sm text-white/70">
                      Если вы подозреваете компрометацию устройства — включите «Панику». Это заблокирует сетевые действия и покажет чек‑лист.
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          // Критическая кнопка должна давать немедленный эффект:
                          // включаем «Панику» сразу, а не только через подсказку.
                          setPanic(true);
                          SecurityCoach.suspectedCompromise();
                        }}
                        className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-semibold"
                      >
                        🛑 Я думаю, устройство скомпрометировано
                      </button>
                      <button
                        type="button"
                        onClick={openSecurityCenter}
                        className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/90 text-sm"
                      >
                        🛡️ Открыть Security Center
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
      {/* Call Window */}
      <CallWindow call={call} onEnd={() => setCall(null)} />
      {/* Voice & Video Settings */}
      <VoiceVideoSettingsModal
        open={voiceVideoOpen}
        profile={profile}
        onClose={() => setVoiceVideoOpen(false)}
      />

    </div>
  );
}
