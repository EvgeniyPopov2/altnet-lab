import { useMemo, useState } from "react";

type ServerCard = {
  id: string;
  name: string;
  category: string;
  membersOnline: number;
  tags: string[];
  verified?: boolean;
};

const ALL_SERVERS: ServerCard[] = [
  { id: "1", name: "War Thunder", category: "Игры", membersOnline: 1240, tags: ["тактика", "сквад"] },
  { id: "2", name: "Midjourney", category: "Искусство", membersOnline: 12000, tags: ["image-gen", "ai"], verified: true },
  { id: "3", name: "AltNet Dev", category: "Технологии", membersOnline: 53, tags: ["p2p", "ipfs"] },
  { id: "4", name: "Cheburashka Lab", category: "Образование", membersOnline: 302, tags: ["вики", "файлы"] },
  { id: "5", name: "Synthwave Radio", category: "Музыка", membersOnline: 860, tags: ["lofi", "24/7"] },
];

const CATEGORIES = ["Все", "Игры", "Музыка", "Развлечения", "Технологии", "Образование", "Искусство"] as const;
type Category = typeof CATEGORIES[number];

export default function ExploreDiscover() {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<Category>("Все");

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return ALL_SERVERS.filter((sv) => {
      const byCat = cat === "Все" || sv.category === cat;
      const byText =
        !s ||
        sv.name.toLowerCase().includes(s) ||
        sv.tags.some((t) => t.toLowerCase().includes(s));
      return byCat && byText;
    });
  }, [q, cat]);

  return (
    <div className="space-y-4">
      {/* HERO */}
      <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-indigo-900/30 to-fuchsia-900/20 p-6">
        <div className="text-2xl font-bold text-white mb-1">Найдите сообщество по душе в AltNet</div>
        <div className="text-white/70 text-sm">
          Игры, музыка, обучение или уютные клубы — здесь найдётся место каждому.
        </div>

        <div className="mt-4 flex gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Поиск серверов, каналов или тегов…"
            className="flex-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 outline-none text-white/90 placeholder-white/40"
          />
          <button
            className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20"
            onClick={() => setQ("")}
            title="Сбросить"
          >
            Очистить
          </button>
        </div>

        {/* Чипы категорий */}
        <div className="mt-3 flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={`px-3 py-1.5 rounded-full text-sm transition
                ${cat === c ? "bg-indigo-600 text-white" : "bg-white/10 text-white/80 hover:bg-white/20"}`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* GRID */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filtered.map((sv) => (
          <div
            key={sv.id}
            className="rounded-2xl border border-white/10 bg-white/5 p-4 hover:bg-white/10 transition group"
          >
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center text-lg">
                🏷️
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <div className="font-semibold text-white/90 truncate">{sv.name}</div>
                  {sv.verified && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-600/80 text-white">✓ вериф.</span>
                  )}
                </div>
                <div className="text-xs text-white/60">{sv.category} • онлайн: {sv.membersOnline.toLocaleString("ru-RU")}</div>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-1">
              {sv.tags.map((t) => (
                <span key={t} className="text-xs px-2 py-1 rounded-full bg-white/10 text-white/70">{t}</span>
              ))}
            </div>
            <div className="mt-4 flex gap-2">
              <button className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm">Открыть</button>
              <button className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-sm">Предпросмотр</button>
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="col-span-full text-white/60 text-sm">
            Ничего не найдено. Попробуйте другую категорию или запрос.
          </div>
        )}
      </div>
    </div>
  );
}
