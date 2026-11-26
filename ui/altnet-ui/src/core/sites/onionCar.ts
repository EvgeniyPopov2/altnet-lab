import { workspaceRecords } from "../nativeWorkspaceRecords";
import { SITE_MAX_CAR_BYTES } from "./ipfsSitePackage";
import { parseBrowserRoot } from "./siteCid";
import type { PrivacyProfile } from "../policy/types";

/** Запрос к локальному клиенту; к onion подключается только его Tor-транспорт. */
export async function fetchOnionCar(onion: string, cid: string, profile: PrivacyProfile, signal?: AbortSignal): Promise<Uint8Array> {
  if (profile !== "anon") throw new Error("Быстрый маршрут пока не подключён. Для получения сайта через Tor выберите анонимный профиль.");
  if (parseBrowserRoot(cid).toString() !== cid) throw new Error("Используйте канонический CIDv1.");
  if (!/^[a-z2-7]{56}\.onion$/.test(onion)) throw new Error("Введите полный адрес onion v3 без протокола и пути.");
  return fetchCar("onion-car", { onion, cid, profile }, signal);
}

export async function fetchMeshCar(cid: string, profile: PrivacyProfile, signal?: AbortSignal): Promise<Uint8Array> {
  if (profile !== "fast" || parseBrowserRoot(cid).toString() !== cid) throw new Error("Нужны быстрый профиль и канонический CIDv1.");
  return fetchCar("mesh-car", { cid, profile }, signal);
}

async function fetchCar(path: "onion-car" | "mesh-car", body: { cid: string; profile: PrivacyProfile; onion?: string }, signal?: AbortSignal): Promise<Uint8Array> {
  const native = workspaceRecords();
  if (native?.linuxSites) {
    signal?.throwIfAborted();
    const [data] = await native.batch("site-transport", [body]);
    signal?.throwIfAborted();
    if (!(data instanceof ArrayBuffer) || !data.byteLength || data.byteLength > SITE_MAX_CAR_BYTES) throw new Error("Некорректный ответ узла.");
    return new Uint8Array(data);
  }
  const token = document.querySelector<HTMLMetaElement>('meta[name="altnet-session"]')?.content;
  if (!token) throw new Error("Откройте AltNet через локальный клиент.");
  const response = await fetch("/api/sites/" + path, {
    method: "POST", mode: "same-origin", cache: "no-store", redirect: "error", referrerPolicy: "same-origin",
    headers: { "X-AltNet-Session": token, "Content-Type": "application/json" },
    body: JSON.stringify(body), signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(135000)]) : AbortSignal.timeout(135000),
  });
  if (response.status === 404) throw new Error("Запущенный клиент не поддерживает загрузку сайтов. Перезапустите AltNet, чтобы применить обновление.");
  if (path === "mesh-car" && !response.ok) throw new Error("Пакет недоступен через настроенный узел Yggdrasil. Проверьте интерфейс и доступность узла.");
  if (!response.ok) throw new Error("Не удалось получить пакет через Tor. Проверьте адреса, подключение и доступность узла.");
  const length = response.headers.get("content-length");
  if (!length || !/^\d+$/.test(length) || Number(length) < 1 || Number(length) > SITE_MAX_CAR_BYTES || !response.body) {
    throw new Error("Некорректный размер пакета сайта.");
  }
  const expected = Number(length);
  const result = new Uint8Array(expected);
  const reader = response.body.getReader();
  let offset = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (offset + value.length > expected) throw new Error("Пакет сайта превышает заявленный размер.");
      result.set(value, offset);
      offset += value.length;
    }
  } finally { reader.releaseLock(); }
  if (offset !== expected) throw new Error("Пакет сайта получен не полностью.");
  return result;
}
