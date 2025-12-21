import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { PolicyDecision } from "../../core/policy/types";

type Size = "sm" | "md";

export function GuardedActionButton({
  icon,
  title,
  decision,
  onAllowed,
  onDenied,
  size = "md",
}: {
  icon: ReactNode;
  title: string;
  decision: PolicyDecision;
  onAllowed: () => void;
  onDenied?: (d: PolicyDecision) => void;
  size?: Size;
}) {
  const denied = !decision.ok;
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Закрыть поповер по клику снаружи / Escape.
  useEffect(() => {
    if (!open) return;

    const onDown = (e: MouseEvent) => {
      const el = rootRef.current;
      if (!el) return;
      if (!el.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const btnClass = [
    "inline-flex items-center justify-center rounded-lg border transition",
    size === "sm" ? "px-2.5 py-1.5 text-sm" : "px-3 py-1.5 text-sm",
    denied
      ? "bg-white/5 border-white/10 text-white/60 cursor-help hover:bg-white/5"
      : "bg-white/10 border-white/10 text-white/90 hover:bg-white/20",
  ].join(" ");

  return (
    <div ref={rootRef} className="relative inline-flex">
      <button
        type="button"
        className={btnClass}
        aria-disabled={denied}
        title={title}
        onClick={() => {
          if (denied) {
            // Важно: не делаем disabled={true}, чтобы кнопка оставалась кликабельной
            // и могла показать “почему заблокировано”.
            onDenied?.(decision);
            setOpen((v) => !v);
            return;
          }
          onAllowed();
        }}
      >
        {icon}
      </button>

      <AnimatePresence>
        {denied && open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.16 }}
            className="absolute z-50 right-0 top-full mt-2 w-[320px] rounded-2xl border border-white/10 bg-slate-950/90 p-3 shadow-xl backdrop-blur"
            role="dialog"
            aria-label="Почему действие заблокировано"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-white/90 truncate">
                  {decision.title || "Действие заблокировано"}
                </div>
                <div className="text-xs text-white/70 mt-1 leading-relaxed">
                  {decision.message}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setOpen(false)}
                className="shrink-0 rounded-lg px-2 py-1 text-xs text-white/70 hover:text-white/90 hover:bg-white/10"
                title="Закрыть"
              >
                ✕
              </button>
            </div>

            {decision.details && decision.details.length > 0 && (
              <div className="mt-2">
                <div className="text-[11px] uppercase tracking-wide text-white/40">Как исправить</div>
                <ul className="mt-1 space-y-1 text-xs text-white/70 list-disc pl-5">
                  {decision.details.map((d) => (
                    <li key={d} className="leading-relaxed">
                      {d}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/80 hover:bg-white/10"
              >
                Понятно
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
