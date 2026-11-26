import { workspaceRecords } from "../nativeWorkspaceRecords";
import { SITE_MAX_CAR_BYTES, verifySitePackage, type VerifiedSite } from "./ipfsSitePackage";
import { parseBrowserRoot } from "./siteCid";
import type { PrivacyProfile } from "../policy/types";

export async function verifyCar(car: Uint8Array, root: string): Promise<VerifiedSite> {
  const cid = parseBrowserRoot(root);
  if (cid.code === 0x71) return verifySitePackage(car, cid.toString());
  const { verifyUnixfsSite } = await import("./unixfsSite");
  return verifyUnixfsSite(car, cid.toString());
}

// Храним исходный CAR и проверяем его заново при каждом открытии по CID.
// Это локальный кэш, он не выполняет сетевых запросов и не подтверждает автора.
const DATABASE = "altnet-ipfs-site-cache";
const STORE = "cars";

export function ipfsCacheKey(root: string, profile?: PrivacyProfile): string {
  const canonical = parseBrowserRoot(root).toString();
  if (profile === undefined) return canonical; // Старый общий список сохраняется без изменений.
  if (profile !== "anon" && profile !== "fast") throw new Error("Неизвестный профиль кэша IPFS.");
  return `profile:${profile}:${canonical}`;
}

async function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const request = indexedDB.open(DATABASE, 1);
    const timer = setTimeout(() => fail(new Error("Хранилище IPFS не ответило.")), 10000);
    function fail(error: unknown) { if (!settled) { settled = true; clearTimeout(timer); reject(error); } }
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE); };
    request.onerror = () => fail(request.error || new Error("Не удалось открыть хранилище IPFS."));
    request.onblocked = () => fail(new Error("Хранилище IPFS занято другой вкладкой."));
    request.onsuccess = () => {
      if (settled) { request.result.close(); return; }
      settled = true; clearTimeout(timer); request.result.onversionchange = () => request.result.close(); resolve(request.result);
    };
  });
}

async function transact<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore, result: (value: T) => void) => void): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      let value: T, settled = false;
      const timer = setTimeout(() => { try { tx.abort(); } catch { /* транзакция уже завершена */ } finish(new Error("Хранилище IPFS не ответило.")); }, 30000);
      function finish(error?: unknown) { if (settled) return; settled = true; clearTimeout(timer); if (error !== undefined) reject(error); else resolve(value); }
      tx.oncomplete = () => finish();
      tx.onabort = () => finish(tx.error || new Error("Операция с IPFS прервана."));
      tx.onerror = () => finish(tx.error || new Error("Не удалось обработать кэш IPFS."));
      try { action(tx.objectStore(STORE), result => { value = result; }); } catch (error) { try { tx.abort(); } catch { /* уже завершено */ } finish(error); }
    });
  } finally { db.close(); }
}

export async function cacheVerifiedSite(car: Uint8Array, root: string, profile?: PrivacyProfile): Promise<VerifiedSite> {
  if (!(car instanceof Uint8Array) || !car.length || car.length > SITE_MAX_CAR_BYTES) throw new Error("Некорректный размер архива сайта.");
  const snapshot = car.slice();
  const site = await verifyCar(snapshot, root);
  const key = ipfsCacheKey(site.root, profile), native = workspaceRecords();
  if (native) await native.batch(DATABASE,[{op:"put",key,value:snapshot.buffer}]);
  else await transact<void>("readwrite", store => { store.put(snapshot.buffer, key); });
  return site;
}

async function readCar(key: string): Promise<unknown> {
  const native = workspaceRecords();
  if (native) return (await native.batch(DATABASE,[{op:"read",key}]))[0];
  return transact<unknown>("readonly", (store, result) => {
    const request = store.get(key);
    request.onsuccess = () => result(request.result);
  });
}

export async function readCachedSite(root: string, profile?: PrivacyProfile): Promise<VerifiedSite | null> {
  const canonical = parseBrowserRoot(root).toString();
  const value = await readCar(ipfsCacheKey(canonical, profile));
  if (value === undefined) return null;
  if (!(value instanceof ArrayBuffer) || !value.byteLength || value.byteLength > SITE_MAX_CAR_BYTES) throw new Error("Локальная копия IPFS повреждена; данные не изменены.");
  return verifyCar(new Uint8Array(value), canonical);
}

export async function deleteCachedSite(root: string, profile?: PrivacyProfile): Promise<void> {
  const canonical = parseBrowserRoot(root).toString();
  const key = ipfsCacheKey(canonical, profile), native = workspaceRecords();
  if (native) await native.batch(DATABASE, [{ op: "delete", key }]);
  else await transact<void>("readwrite", store => { store.delete(key); });
}

/** Копирует старую запись только по запросу, с повторной проверкой и без замены новой. */
export async function copyLegacyCachedSite(root: string, profile: PrivacyProfile): Promise<VerifiedSite | null> {
  const canonical = parseBrowserRoot(root).toString();
  const key = ipfsCacheKey(canonical, profile);
  const value = await readCar(canonical);
  if (value === undefined) return null;
  if (!(value instanceof ArrayBuffer) || !value.byteLength || value.byteLength > SITE_MAX_CAR_BYTES) throw new Error("Старая копия IPFS повреждена; данные не изменены.");
  const snapshot = value.slice(0);
  const site = await verifyCar(new Uint8Array(snapshot), canonical);
  // add выполняется в транзакции и не перезаписывает существующую запись,
  // даже если другая вкладка создала её после начала проверки.
  try {
    const native = workspaceRecords();
    if (native) await native.batch(DATABASE,[{op:"add",key,value:snapshot}]);
    else await transact<void>("readwrite", store => { store.add(snapshot, key); });
  } catch (error) {
    if (error instanceof DOMException && error.name === "ConstraintError") throw new Error("В этом профиле уже есть копия IPFS; данные не изменены.");
    throw error;
  }
  return site;
}
