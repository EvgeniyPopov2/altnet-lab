import { parseSiteRoot, SITE_MAX_CAR_BYTES } from "./ipfsSitePackage";

import { workspaceRecords } from "../nativeWorkspaceRecords";

export type OnionShareStatus =
  | { active: false; reason: string }
  | { active: true; onion: string; cid: string; reachability: "unverified"; mesh?: boolean };

async function request(path: string, init: RequestInit): Promise<OnionShareStatus> {
  const token = document.querySelector<HTMLMetaElement>('meta[name="altnet-session"]')?.content;
  if (!token) throw new Error("Откройте AltNet через локальный клиент.");
  const response = await fetch(path, {
    ...init, mode: "same-origin", cache: "no-store", redirect: "error", referrerPolicy: "same-origin",
    headers: { ...init.headers, "X-AltNet-Session": token }, signal: AbortSignal.timeout(30000),
  });
  if (response.status === 404) throw new Error("Запущенный клиент не поддерживает раздачу сайтов. Перезапустите AltNet, чтобы применить обновление.");
  if (!response.ok) throw new Error("Локальный клиент не выполнил запрос. Проверьте подключение Tor и состояние раздачи.");
  const status: unknown = await response.json();
  if (!status || typeof status !== "object" || !("active" in status)) throw new Error("Некорректный ответ клиента.");
  if (status.active === false && "reason" in status && typeof status.reason === "string") return { active: false, reason: status.reason };
  if (status.active === true && "onion" in status && typeof status.onion === "string" && /^[a-z2-7]{56}\.onion$/.test(status.onion)
      && "cid" in status && typeof status.cid === "string" && "reachability" in status && status.reachability === "unverified") {
    parseSiteRoot(status.cid);
    return { active: true, onion: status.onion, cid: status.cid, reachability: "unverified" };
  }
  throw new Error("Некорректный ответ клиента.");
}

async function linuxShare(op: "status" | "stop" | "start", key = "", value?: unknown): Promise<OnionShareStatus> {
  const records = workspaceRecords();
  if (!records?.linuxSites) throw new Error("Служба публикации недоступна.");
  const [status] = await records.batch("site-publication", [{op, key, value}]);
  return status as OnionShareStatus;
}

export function shareStatus(): Promise<OnionShareStatus> {
  if (workspaceRecords()?.linuxSites) return linuxShare("status");
  return request("/api/sites/share", { method: "GET" });
}

/** Вызывается только после проверки CAR и явного действия пользователя. */
export function startOnionShare(cid: string, car: Uint8Array, mesh = false): Promise<OnionShareStatus> {
  parseSiteRoot(cid);
  if (!car.length || car.length > SITE_MAX_CAR_BYTES) throw new Error("Некорректный размер пакета.");
  if (workspaceRecords()?.linuxSites) return linuxShare("start", cid, {mode:mesh ? "both" : "tor", car:new Uint8Array(car).buffer});
  if (mesh) throw new Error("Раздача через Yggdrasil недоступна.");
  return request("/api/sites/share", { method: "POST", headers: { "Content-Type": "application/vnd.ipld.car", "X-AltNet-Site-CID": cid }, body: new Uint8Array(car).buffer });
}

export function stopOnionShare(): Promise<OnionShareStatus> {
  if (workspaceRecords()?.linuxSites) return linuxShare("stop");
  return request("/api/sites/share-stop", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
}
