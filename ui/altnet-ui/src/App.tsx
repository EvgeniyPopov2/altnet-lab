import { useState } from "react"
import "./index.css"
import AltNetWireframes from "./screens/AltNetWireframes"

type Section = "feed" | "messages" | "servers" | "explore" | "browser" | "reputation" | "profile"

const NavButton = ({ active, onClick, children }: { active?: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button
    onClick={onClick}
    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition
      ${active ? "bg-indigo-600 text-white" : "bg-white/5 text-white/80 hover:bg-white/10"}`}
  >
    {children}
  </button>
)

export default function App() {
  const [section, setSection] = useState<Section>("feed")
  const [devOpen, setDevOpen] = useState(false)

  return (
    <div className="min-h-screen flex">
      {/* Левый бар с серверами */}
      <aside className="w-16 bg-white/5 border-r border-white/10 flex flex-col items-center gap-3 py-3">
        <div className="w-10 h-10 rounded-2xl bg-indigo-600 flex items-center justify-center font-bold">A</div>
        <div className="w-10 h-10 rounded-2xl bg-white/10" title="Сервер #1" />
        <div className="w-10 h-10 rounded-2xl bg-white/10" title="Сервер #2" />
        <div className="w-10 h-10 rounded-2xl bg-white/10" title="Сервер #3" />
        <div className="mt-auto" />
        <button
          className="text-[10px] text-white/50 hover:text-white/80 underline mb-1"
          onClick={() => setDevOpen((v) => !v)}
          title="Показать/скрыть прототипные вайрфреймы (для разработчика)"
        >
          DEV: вайрфреймы
        </button>
      </aside>

      {/* Колонка навигации (как список серверных/общих разделов) */}
      <nav className="w-64 bg-white/5 border-r border-white/10 p-3 space-y-2">
        <div className="text-white/60 text-xs uppercase tracking-wide px-1">Навигация</div>
        <NavButton active={section === "feed"} onClick={() => setSection("feed")}>🏠 Лента</NavButton>
        <NavButton active={section === "messages"} onClick={() => setSection("messages")}>💬 Сообщения</NavButton>
        <NavButton active={section === "servers"} onClick={() => setSection("servers")}>🧩 Серверы</NavButton>
        <NavButton active={section === "explore"} onClick={() => setSection("explore")}>🧭 Путешествия</NavButton>
        <NavButton active={section === "browser"} onClick={() => setSection("browser")}>🌐 Браузер .alt</NavButton>
        <NavButton active={section === "reputation"} onClick={() => setSection("reputation")}>🛡️ Репутация</NavButton>
        <NavButton active={section === "profile"} onClick={() => setSection("profile")}>👤 Профиль</NavButton>
      </nav>

      {/* Основная область */}
      <div className="flex-1 flex flex-col">
        {/* Верхняя панель с «Почта» и «Поддержка» */}
        <header className="px-4 py-3 border-b border-white/10 bg-white/5 flex items-center justify-between">
          <div>
            <div className="text-xl font-bold tracking-tight">AltNet</div>
            <div className="text-xs text-white/60">Децентрализованно. Приватно. Без телеметрии.</div>
          </div>
          <div className="flex gap-2">
            <button className="px-3 py-1.5 rounded-full text-sm bg-white/10 hover:bg-white/20">📥 Почта</button>
            <button className="px-3 py-1.5 rounded-full text-sm bg-white/10 hover:bg-white/20">❓ Поддержка</button>
          </div>
        </header>

        {/* Контент */}
        <main className="p-4">
          {section === "feed" && (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
              <div className="text-white/80">
                Раздел «Лента». Здесь будет популярное рядом и «Состояние сети». (Добавим детальный виджет в следующем шаге.)
              </div>
            </div>
          )}

          {section === "messages" && (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-white/80">
              Раздел «Сообщения». Список чатов и окно диалога (моки).
            </div>
          )}

          {section === "servers" && (
            <div className="grid lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2 rounded-2xl border border-white/10 bg-white/5 p-6">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-white/90 font-semibold">Серверы (сообщества)</div>
                  <button className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-sm">
                    ➕ Создать сервер
                  </button>
                </div>
                <div className="text-white/70 text-sm">
                  Каталог серверов, каналы, роли. Мастер создания будет открываться отсюда.
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-white/80">
                Подсказки и надёжность хранения (кеш/пины/зеркала).
              </div>
            </div>
          )}

          {section === "explore" && (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-white/80">
              Раздел «Путешествия» (каталог сообществ и мини-приложений).
            </div>
          )}

          {section === "browser" && (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-white/80">
              Раздел «Браузер .alt». Адресная строка и предпросмотр сайтов AltNet.
            </div>
          )}

          {section === "reputation" && (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-white/80">
              Раздел «Репутация» (общественные метки, жалобы, арбитраж).
            </div>
          )}

          {section === "profile" && (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-white/80">
              Раздел «Профиль»: аватар, статус, темы, экспорт профиля.
            </div>
          )}

          {/* DEV: быстрый доступ к старым вайрфреймам (для разработки) */}
          {devOpen && (
            <div className="mt-4 rounded-2xl border border-indigo-600/40 bg-indigo-900/10 p-3">
              <div className="text-xs text-white/60 mb-2">DEV · Вайрфреймы (прототипные вкладки):</div>
              <AltNetWireframes />
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
