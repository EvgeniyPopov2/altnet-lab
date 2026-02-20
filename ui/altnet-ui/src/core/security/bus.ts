import type { SecurityEvent, SecuritySeverity } from "./types";

type Listener = (ev: SecurityEvent) => void;

const listeners = new Set<Listener>();

function makeId(prefix = "sev"): string {
  const uuid =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}_${uuid}`;
}

export function subscribeSecurityEvents(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitSecurityEvent(ev: SecurityEvent): void {
  for (const l of Array.from(listeners)) {
    try {
      l(ev);
    } catch {
      // fail-silent: события безопасности не должны падать из-за UI-обработчика
    }
  }
}

export function pushSecurityEvent(input: Omit<SecurityEvent, "id" | "createdAt">): SecurityEvent {
  const ev: SecurityEvent = {
    id: makeId(),
    createdAt: Date.now(),
    ...input,
  };
  emitSecurityEvent(ev);
  return ev;
}

export function defaultTtlMs(severity: SecuritySeverity): number {
  switch (severity) {
    case "info":
      return 8000;
    case "warning":
      return 12000;
    case "critical":
      return 0; // sticky обычно
    default:
      return 8000;
  }
}
