import { parseSiteRoot, SITE_MAX_CAR_BYTES } from "./ipfsSitePackage";

export type OnionShareStatus =
  | { active: false; reason: string }
  | { active: true; onion: string; cid: string; reachability: "unverified" };

async function request(path: string, init: RequestInit): Promise<OnionShareStatus> {
  const token = document.querySelector<HTMLMetaElement>('meta[name="altnet-session"]')?.content;
  if (!token) throw new Error("Откройте AltNet через локальный клиент.");
  const response = await fetch(path, {
    ...init, mode: "same-origin", cache: "no-store", redirect: "error", referrerPolicy: "same-origin",
    headers: { ...init.headers, "X-AltNet-Session": token }, signal: AbortSignal.timeout(30000),
  });
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

export function shareStatus(): Promise<OnionShareStatus> {
  return request("/api/sites/share", { method: "GET" });
}

/** Вызывается только после проверки CAR и явного действия пользователя. */
export function startOnionShare(cid: string, car: Uint8Array): Promise<OnionShareStatus> {
  parseSiteRoot(cid);
  if (!car.length || car.length > SITE_MAX_CAR_BYTES) throw new Error("Некорректный размер пакета.");
  return request("/api/sites/share", { method: "POST", headers: { "Content-Type": "application/vnd.ipld.car", "X-AltNet-Site-CID": cid }, body: new Uint8Array(car).buffer });
}

export function stopOnionShare(): Promise<OnionShareStatus> {
  return request("/api/sites/share-stop", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
}
