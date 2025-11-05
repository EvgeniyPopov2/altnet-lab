import { useEffect, useMemo, useRef, useState } from "react";

export type QSItem = {
  id: string;
  kind: "section" | "dm" | "server";
  label: string;
  hint?: string;
  action: () => void;
};

export default function QuickSwitcher({
  open,
  onClose,
  items,
}: {
  open: boolean;
  onClose: () => void;
  items: QSItem[];
}) {
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQ("");
      setIdx(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
      if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(i + 1, filtered.length - 1)); }
      if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
      if (e.key === "Enter") {
        e.preventDefault();
        filtered[idx]?.action();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, idx]); // eslint-disable-line

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    const arr = !s
      ? items
      : items.filter((x) =>
          x.label.toLowerCase().includes(s) ||
          (x.hint && x.hint.toLowerCase().includes(s))
        );
    // Стабильная группировка: Разделы → ЛС → Серверы
    const order = { section: 0, dm: 1, server: 2 } as const;
    return arr.slice().sort((a, b) => order[a.kind] - order[b.kind]);
  }, [q, items]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center pt-24">
      <div className="w-[680px] rounded-2xl border border-white/10 bg-neutral-900 shadow-xl overflow-hidden">
        {/* Поисковая строка */}
        <div className="p-3 border-b border-white/10 flex items-center gap-2">
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Переход… Раздел, ЛС, сервер (Ctrl+K)"
            className="flex-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 outline-none text-white/90 placeholder-white/40"
          />
          <span className="text-xs text-white/50 px-2 py-1 rounded-md bg-white/5 border border-white/10">Esc</span>
        </div>

        {/* Список */}
        <div className="max-h-[420px] overflow-y-auto p-2">
          {filtered.length === 0 && (
            <div className="px-3 py-6 text-sm text-white/60">Ничего не найдено.</div>
          )}
          {filtered.map((it, i) => (
            <button
              key={it.id}
              onMouseEnter={() => setIdx(i)}
              onClick={() => { it.action(); onClose(); }}
              className={`w-full text-left px-3 py-2 rounded-xl mb-1 transition
                ${i === idx ? "bg-white/15" : "bg-white/5 hover:bg-white/10"}`}
            >
              <div className="flex items-center gap-2">
                <span className="text-white/80 text-sm">
                  {it.kind === "section" && "▸"}
                  {it.kind === "dm" && "💬"}
                  {it.kind === "server" && "🧩"}
                </span>
                <div className="flex-1">
                  <div className="text-white/90">{it.label}</div>
                  {it.hint && <div className="text-xs text-white/60">{it.hint}</div>}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
