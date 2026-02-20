import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import type { PolicyDecision } from "../../core/policy/decisions";


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
  const decisionKey = decision.ok ? "OK" : decision.code;
  const [open, setOpen] = useState(false);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // Если решение стало "ok" — закрываем поповер.
  useEffect(() => {
    if (!denied && open) setOpen(false);
  }, [denied, open]);

  // Закрыть поповер по клику снаружи / Escape.
  useEffect(() => {
    if (!open) return;

    const onDown = (e: MouseEvent) => {
      const root = rootRef.current;
      const pop = popoverRef.current;
      const t = e.target as Node;

      if (root && root.contains(t)) return;
      if (pop && pop.contains(t)) return;

      setOpen(false);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    // capture=true: чтобы корректно отрабатывать даже внутри сложных контейнеров
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("keydown", onKey, true);

    return () => {
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  // Позиционирование popover в viewport (fixed + clamp).
  useLayoutEffect(() => {
    if (!open || !denied) return;

    const anchorEl = rootRef.current;
    const popEl = popoverRef.current;
    if (!anchorEl || !popEl) return;

    const anchor = anchorEl.getBoundingClientRect();
    const pop = popEl.getBoundingClientRect();

    const margin = 8;

    // align right edge with button right edge
    let left = anchor.right - pop.width;
    left = Math.max(margin, Math.min(left, window.innerWidth - pop.width - margin));

    // prefer below
    let top = anchor.bottom + margin;
    if (top + pop.height > window.innerHeight - margin) {
      // fallback above
      top = anchor.top - pop.height - margin;
    }
    top = Math.max(margin, Math.min(top, window.innerHeight - pop.height - margin));

    setPos({ top, left });
  }, [open, denied, decisionKey]);

  const btnClass = [
    "inline-flex items-center justify-center rounded-lg border transition",
    size === "sm" ? "h-7 w-7 text-sm" : "h-9 w-9 text-base",
    denied
      ? "border-white/10 bg-white/5 text-white/60 hover:bg-white/5"
      : "border-white/10 bg-white/10 text-white/90 hover:bg-white/20",
  ].join(" ");

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        type="button"
        className={btnClass}
        title={decision.ok ? title : decision.title}
        onClick={() => {
          if (denied) {
            onDenied?.(decision);
            setOpen((v) => !v);
          } else {
            onAllowed();
          }
        }}
      >
        {icon}
      </button>

      <AnimatePresence>
        {denied &&
          open &&
          createPortal(
            <motion.div
              ref={popoverRef}
              className="fixed z-[10000] w-[320px] rounded-2xl border border-white/10 bg-slate-950/90 p-3 shadow-xl backdrop-blur"
              style={{
                top: pos?.top ?? -9999,
                left: pos?.left ?? -9999,
              }}
              initial={{ opacity: 0, y: 6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.98 }}
              transition={{ duration: 0.16, ease: "easeOut" }}
              role="dialog"
              aria-label="Подсказка безопасности"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-wide text-white/60">
                    {decision.title}
                  </div>
                  <div className="mt-1 text-sm text-white/90">{decision.message}</div>
                </div>

                <button
                  className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/70 hover:bg-white/10"
                  onClick={() => setOpen(false)}
                  title="Закрыть"
                >
                  ✕
                </button>
              </div>

              {decision.details?.length ? (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-white/70">
                  {decision.details.map((d: string) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
              ) : null}

              <div className="mt-3 flex items-center justify-end gap-2">
                <button
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/80 hover:bg-white/10"
                  onClick={() => setOpen(false)}
                >
                  Понятно
                </button>
              </div>
            </motion.div>,
            document.body
          )}
      </AnimatePresence>
    </div>
  );
}
