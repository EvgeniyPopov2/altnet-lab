import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useDragControls, useMotionValue } from "framer-motion";
import type { SecurityEvent, SecuritySeverity } from "../../core/security/types";
import { defaultTtlMs, subscribeSecurityEvents } from "../../core/security/bus";
import { dismiss } from "../../core/security/storage";

type UiEvent = SecurityEvent & { _receivedAt: number };

function borderBySeverity(s: SecuritySeverity): string {
  switch (s) {
    case "critical":
      return "border-red-500/60";
    case "warning":
      return "border-amber-500/60";
    case "info":
    default:
      return "border-slate-500/40";
  }
}

function titleBySeverity(s: SecuritySeverity): string {
  switch (s) {
    case "critical":
      return "Критично";
    case "warning":
      return "Важно";
    case "info":
    default:
      return "Подсказка";
  }
}

function btnClass(kind: string | undefined): string {
  switch (kind) {
    case "danger":
      return "bg-red-600 text-white hover:bg-red-500";
    case "primary":
      return "bg-slate-100 text-slate-900 hover:bg-white";
    case "secondary":
      return "bg-slate-700 text-white hover:bg-slate-600";
    case "ghost":
    default:
      return "bg-transparent text-slate-200 hover:text-white hover:bg-slate-800";
  }
}

const POS_KEY = "altnet.ui.securityCoach.pos.v1";

function safeLoadPos(): { x: number; y: number } | null {
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { x?: unknown; y?: unknown };
    if (typeof parsed.x !== "number" || typeof parsed.y !== "number") return null;
    if (!Number.isFinite(parsed.x) || !Number.isFinite(parsed.y)) return null;
    return { x: parsed.x, y: parsed.y };
  } catch {
    return null;
  }
}

function safeSavePos(x: number, y: number) {
  try {
    localStorage.setItem(POS_KEY, JSON.stringify({ x, y }));
  } catch {
    // ignore
  }
}

export function SecurityCoachHost() {
  const [events, setEvents] = useState<UiEvent[]>([]);

  // Drag/position (перетаскивание окна подсказок)
  const dragControls = useDragControls();
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  useEffect(() => {
    const pos = safeLoadPos();
    if (pos) {
      x.set(pos.x);
      y.set(pos.y);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persistPos = () => {
    safeSavePos(x.get(), y.get());
  };

  const resetPos = () => {
    x.set(0);
    y.set(0);
    safeSavePos(0, 0);
  };

  useEffect(() => {
    const unsub = subscribeSecurityEvents((ev) => {
      setEvents((prev) => {
        // дедуп внутри текущей сессии
        if (ev.dedupeKey && prev.some((xx) => xx.dedupeKey === ev.dedupeKey)) return prev;
        return [{ ...ev, _receivedAt: Date.now() }, ...prev].slice(0, 4);
      });
    });
    return unsub;
  }, []);

  // авто-dismiss по ttl
  useEffect(() => {
    const timers: number[] = [];
    for (const ev of events) {
      if (ev.sticky) continue;
      const ttl = ev.ttlMs ?? defaultTtlMs(ev.severity);
      if (ttl <= 0) continue;

      const t = window.setTimeout(() => {
        setEvents((prev) => prev.filter((x0) => x0.id !== ev.id));
      }, ttl);
      timers.push(t);
    }
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [events]);

  const hasAny = events.length > 0;
  const containerClass = useMemo(
    () =>
      // Важно: делаем как “toast stack”, но с одной «шапкой» (перетаскивание)
      "fixed bottom-4 right-4 z-[9999] w-[380px] max-w-[calc(100vw-2rem)] select-none",
    []
  );

  return (
    <AnimatePresence>
      {hasAny && (
        <motion.div
          className={containerClass}
          aria-live="polite"
          aria-relevant="additions"
          // animation: toast window slide + fade (по доктрине)
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          // drag
          drag
          dragControls={dragControls}
          dragListener={false}
          dragMomentum={false}
          style={{ x, y }}
          onDragEnd={persistPos}
        >
          {/* Header / drag handle */}
          <div
            className={[
              "mb-2 flex items-center justify-between gap-2",
              "rounded-xl border border-white/10 bg-slate-900/95 px-3 py-2 text-slate-100 shadow-lg backdrop-blur",
            ].join(" ")}
          >
            <div
              className="min-w-0 cursor-grab text-xs font-semibold uppercase tracking-wide text-slate-200"
              title="Перетащите, чтобы переместить окно подсказок"
              onPointerDown={(e) => {
                // Только шапкой, чтобы не мешать кнопкам внутри карточек
                dragControls.start(e);
              }}
            >
              Подсказки безопасности
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded-md px-2 py-1 text-xs text-slate-300 hover:bg-slate-800 hover:text-white"
                onClick={resetPos}
                title="Сбросить позицию"
              >
                Сброс
              </button>

              <button
                type="button"
                className="rounded-md px-2 py-1 text-slate-300 hover:bg-slate-800 hover:text-white"
                onClick={() => setEvents([])}
                aria-label="Закрыть все"
                title="Закрыть все"
              >
                ✕
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <AnimatePresence initial={false}>
              {events.map((ev) => (
                <motion.div
                  key={ev.id}
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 12 }}
                  transition={{ duration: 0.16, ease: "easeOut" }}
                  className={[
                    "rounded-xl border p-3 shadow-lg",
                    "bg-slate-900/95 text-slate-100 backdrop-blur",
                    borderBySeverity(ev.severity),
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs uppercase tracking-wide text-slate-300">
                        {titleBySeverity(ev.severity)} · {ev.code}
                      </div>
                      <div className="mt-1 text-sm font-semibold">{ev.title}</div>
                    </div>

                    <button
                      className="shrink-0 rounded-md px-2 py-1 text-slate-300 hover:bg-slate-800 hover:text-white"
                      onClick={() =>
                        setEvents((prev) => prev.filter((x0) => x0.id !== ev.id))
                      }
                      aria-label="Закрыть"
                      title="Закрыть"
                      type="button"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="mt-2 text-sm text-slate-200">{ev.message}</div>

                  {ev.details && ev.details.length > 0 && (
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-slate-300">
                      {ev.details.map((d, idx) => (
                        <li key={idx}>{d}</li>
                      ))}
                    </ul>
                  )}

                  {ev.actions && ev.actions.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {ev.actions.map((a, idx) => (
                        <button
                          key={a.id ?? idx}
                          type="button"
                          className={[
                            "rounded-lg px-3 py-1.5 text-xs transition",
                            btnClass(a.kind),
                          ].join(" ")}
                          onClick={() => {
                            try {
                              a.onClick?.();
                            } finally {
                              // не авто-закрываем: пусть решает пользователь
                            }
                          }}
                        >
                          {a.label}
                        </button>
                      ))}
                    </div>
                  )}

                  {ev.dedupeKey && (
                    <div className="mt-2 text-[11px] text-slate-400">
                      <button
                        type="button"
                        className="underline underline-offset-2 hover:text-slate-200"
                        onClick={() => dismiss(ev.dedupeKey!)}
                      >
                        Не показывать такие подсказки снова
                      </button>
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
