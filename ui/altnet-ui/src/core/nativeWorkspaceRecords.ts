/** Доступен только установленному интерфейсу AltNet в его нативном окне. */
type Change = { profile: "anon" | "fast"; cid: string; onion?: string } | { op: "read" | "add" | "put" | "delete" | "metadata" | "start" | "stop" | "status" | "mesh-configured" | "route-status"; key: string; value?: unknown };
type Records = { linuxSites?: boolean; batch(database: string, changes: Change[]): Promise<unknown[]> };
declare global { interface Window { altNetRecords?: Records } }

export function workspaceRecords(): Records | undefined {
  if (typeof window === "undefined" || window.location.protocol !== "resource:" || window.location.hostname !== "altnet-workspace") return;
  if (!window.altNetRecords && document.querySelector('meta[name="altnet-native-storage"]')) throw new Error("Личное хранилище AltNet недоступно. Перезапустите рабочее окно.");
  return window.altNetRecords;
}
