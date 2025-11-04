import { useState, type ReactNode } from "react";

/* Утилиты */
const Pill = ({ active, onClick, children }: { active?: boolean; onClick?: () => void; children: ReactNode }) => (
  <button onClick={onClick} className={`px-3 py-1.5 rounded-full text-sm ${active ? "bg-indigo-600 text-white" : "bg-white/10 text-white/80 hover:bg-white/20"}`}>
    {children}
  </button>
);
const Card = ({ title, children, right }: { title: ReactNode; children: ReactNode; right?: ReactNode }) => (
  <div className="rounded-2xl border border-white/10 bg-white/5 p-4 md:p-6">
    <div className="mb-2 flex items-center justify-between">
      <div className="text-white/90 font-semibold">{title}</div>
      {right}
    </div>
    {children}
  </div>
);

/* Экран вайрфреймов */
export default function AltNetWireframes() {
  const [tab, setTab] = useState<"feed" | "messages" | "servers" | "explore" | "browser" | "mail" | "reputation" | "help" | "profile">("feed")
  const [showWizard, setShowWizard] = useState(false)

  return (
    <div className="min-h-[60vh]">
      <div className="flex flex-wrap gap-2 mb-4">
        <Pill active={tab === "feed"} onClick={() => setTab("feed")}>🏠 Лента</Pill>
        <Pill active={tab === "messages"} onClick={() => setTab("messages")}>💬 Сообщения</Pill>
        <Pill active={tab === "servers"} onClick={() => setTab("servers")}>🧩 Серверы</Pill>
        <Pill active={tab === "explore"} onClick={() => setTab("explore")}>🧭 Путешествия</Pill>
        <Pill active={tab === "browser"} onClick={() => setTab("browser")}>🌐 Браузер .alt</Pill>
        <Pill active={tab === "mail"} onClick={() => setTab("mail")}>📥 Почта</Pill>
        <Pill active={tab === "reputation"} onClick={() => setTab("reputation")}>🛡️ Репутация</Pill>
        <Pill active={tab === "help"} onClick={() => setTab("help")}>❓ Помощь</Pill>
        <Pill active={tab === "profile"} onClick={() => setTab("profile")}>👤 Профиль</Pill>
      </div>

      {tab === "feed" && (
        <Card title="Лента: популярное рядом">
          <div className="text-white/70 text-sm">Здесь будут карточки постов и «Состояние сети».</div>
        </Card>
      )}

      {tab === "servers" && (
        <div className="grid md:grid-cols-2 gap-4">
          <Card
            title="Серверы (сообщества)"
            right={<button className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-sm" onClick={()=>setShowWizard(true)}>➕ Создать сервер</button>}
          >
            <div className="text-white/70 text-sm">Каталог, каналы, роли. Кнопка сверху запускает мастер.</div>
          </Card>
          <Card title="Подсказки">
            <ul className="text-white/80 text-sm list-disc ml-5 space-y-1">
              <li>«Хранители» — добровольные зеркала (NAS/роутеры).</li>
              <li>Открытые серверы видны в «Путешествиях».</li>
            </ul>
          </Card>

          {showWizard && (
            <div className="md:col-span-2 rounded-2xl border border-indigo-500/40 bg-indigo-900/10 p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="text-white/90 font-semibold">Мастер создания сервера (болванка)</div>
                <button className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-sm" onClick={()=>setShowWizard(false)}>Закрыть</button>
              </div>
              <ol className="list-decimal ml-5 text-white/80 text-sm space-y-1">
                <li>Имя сервера</li>
                <li>Каналы</li>
                <li>Роли</li>
                <li>Зеркала (пины)</li>
              </ol>
            </div>
          )}
        </div>
      )}

      {tab === "messages" && <Card title="Сообщения"><div className="text-white/70 text-sm">Список чатов и окно диалога.</div></Card>}
      {tab === "explore" && <Card title="Путешествия"><div className="text-white/70 text-sm">Каталог сообществ и мини-приложений.</div></Card>}
      {tab === "browser" && <Card title="Браузер .alt"><div className="text-white/70 text-sm">Адресная строка и предпросмотр.</div></Card>}
      {tab === "mail" && <Card title="Почта (E2E)"><div className="text-white/70 text-sm">Список писем, просмотр, вложения (CID).</div></Card>}
      {tab === "reputation" && <Card title="Репутация"><div className="text-white/70 text-sm">Голоса, жалобы, публичные метки.</div></Card>}
      {tab === "help" && <Card title="Помощь"><div className="text-white/70 text-sm">FAQ и контакты.</div></Card>}
      {tab === "profile" && <Card title="Профиль"><div className="text-white/70 text-sm">Аватар, статус, темы, экспорт профиля.</div></Card>}
    </div>
  )
}
