const LS_KEY = "altnet.panic.v1";

export function getPanicMode(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(LS_KEY) === "1";
}

export function setPanicMode(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LS_KEY, enabled ? "1" : "0");
  } catch {
    // ignore
  }
  window.dispatchEvent(
    new CustomEvent("altnet:panic", { detail: { enabled } })
  );
}

export function onPanicModeChange(cb: (enabled: boolean) => void): () => void {
  const handler = (e: Event) => {
    const ce = e as CustomEvent<{ enabled: boolean }>;
    cb(Boolean(ce.detail?.enabled));
  };
  window.addEventListener("altnet:panic", handler as EventListener);
  return () => window.removeEventListener("altnet:panic", handler as EventListener);
}
