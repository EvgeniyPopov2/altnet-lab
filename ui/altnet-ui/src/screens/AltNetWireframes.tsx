import { useState, type ReactNode } from "react";

const Pill = ({ active, onClick, children }: { active?: boolean; onClick?: () => void; children: ReactNode }) => (
  <button
    onClick={onClick}
    className={`px-3 py-1.5 rounded-full text-sm ${active ? "bg-indigo-600 text-white" : "bg-white/10 text-white/80 hover:bg-white/20"}`}
  >
    {children}
  </button>
);

const Card = ({ title, children }: { title: ReactNode; children: ReactNode }) => (
  <div className="rounded-2xl border border-white/10 bg-white/5 p-4 md:p-6">
    <div className="text-white/90 font-semibold mb-2">{title}</div>
    {children}
  </div>
);

export default function AltNetWireframes() {
  const [tab, setTab] = useState<
    "feed" | "messages" | "servers" | "explore" | "browser" | "mail" | "wizard" | "reputation" | "help" | "profile"
  >("feed");

  return (
    <div className="min-h-[70vh]">
      <div className="flex flex-wrap gap-2 mb-4">
        <Pill active={tab === "feed"} onClick={() => setTab("feed")}>🏠 Лента</Pill>
        <Pill active={tab === "messages"} onClick={() => setTab("messages")}>💬 Сообщения</Pill>
        <Pill active={tab === "servers"} onClick={() => setTab("servers")}>🧩 Серверы</Pill>
        <Pill active={tab === "explore"} onClick={() => setTab("explore")}>🧭 Путешествия</Pill>
        <Pill active={tab === "browser"} onClick={() => setTab("browser")}>🌐 Браузер .alt</Pill>
        <Pill active={tab === "mail"} onClick={() => setTab("mail")}>📥 Почта</Pill>
        <Pill active={tab === "wizard"} onClick={() => setTab("wizard")}>🛠️ Создать сервер</Pill>
        <Pill active={tab === "reputation"} onClick={() => setTab("reputation")}>🛡️ Репутация</Pill>
        <Pill active={tab === "help"} onClick={() => setTab("help")}>❓ Помощь</Pill>
        <Pill active={tab === "profile"} onClick={() => setTab("profile")}>👤 Профиль</Pill>
      </div>

      {tab === "feed" && (
        <div className="grid md:grid-cols-2 gap-4">
          <Card title="Лента: популярное рядом">
            <div className="text-white/70 text-sm">Здесь будут карточки постов, превью и реакции (добавим далее).</div>
          </Card>
          <Card title="Состояние сети (моки)">
            <ul className="text-white/80 text-sm list-disc ml-5 space-y-1">
              <li>Пиров рядом: 3 · по миру: 1.1k</li>
              <li>Транспорты: Yggdrasil 🟢 · QUIC 🟢 · Tor ⚪</li>
              <li>Кеш: 0.0 ГБ / 10 ГБ · Пины: 0</li>
            </ul>
          </Card>
        </div>
      )}

      {tab === "messages" && <Card title="Сообщения"><div className="text-white/70 text-sm">Список чатов и окно диалога.</div></Card>}
      {tab === "servers" && <Card title="Серверы"><div className="text-white/70 text-sm">Каталог серверов и каналы.</div></Card>}
      {tab === "explore" && <Card title="Путешествия"><div className="text-white/70 text-sm">Поиск сообществ и мини-приложений.</div></Card>}
      {tab === "browser" && <Card title="Браузер .alt"><div className="text-white/70 text-sm">Адресная строка и предпросмотр сайтов AltNet.</div></Card>}
      {tab === "mail" && <Card title="Почта (E2E)"><div className="text-white/70 text-sm">Список писем, просмотр, вложения (CID).</div></Card>}
      {tab === "wizard" && <Card title="Мастер создания сервера"><div className="text-white/70 text-sm">Шаги: имя → каналы → роли → зеркала.</div></Card>}
      {tab === "reputation" && <Card title="Репутация"><div className="text-white/70 text-sm">Голоса, жалобы, публичные метки.</div></Card>}
      {tab === "help" && <Card title="Помощь"><div className="text-white/70 text-sm">FAQ: хранение, отличие от Discord/Telegram.</div></Card>}
      {tab === "profile" && <Card title="Профиль"><div className="text-white/70 text-sm">Аватар, статус, темы, экспорт профиля.</div></Card>}
    </div>
  );
}