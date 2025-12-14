import { useEffect, useMemo, useState } from "react";
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

export function SecurityCoachHost() {
  const [events, setEvents] = useState<UiEvent[]>([]);

  useEffect(() => {
    const unsub = subscribeSecurityEvents((ev) => {
      setEvents((prev) => {
        // дедуп внутри текущей сессии
        if (ev.dedupeKey && prev.some((x) => x.dedupeKey === ev.dedupeKey)) return prev;
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
        setEvents((prev) => prev.filter((x) => x.id !== ev.id));
      }, ttl);
      timers.push(t);
    }
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [events]);

  const hasAny = events.length > 0;
  const containerClass = useMemo(
    () => "fixed bottom-4 right-4 z-[9999] w-[380px] max-w-[calc(100vw-2rem)] space-y-2",
    []
  );

  if (!hasAny) return null;

  return (
    <div className={containerClass} aria-live="polite" aria-relevant="additions">
      {events.map((ev) => (
        <div
          key={ev.id}
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
              onClick={() => setEvents((prev) => prev.filter((x) => x.id !== ev.id))}
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
                  className={["rounded-lg px-3 py-1.5 text-xs transition", btnClass(a.kind)].join(" ")}
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
        </div>
      ))}
    </div>
  );
}
