import { parseSiteRoot, SITE_MAX_CAR_BYTES, verifySitePackage, type VerifiedSite } from "./ipfsSitePackage";

// Храним исходный CAR и проверяем его заново при каждом открытии по CID.
// Это локальный кэш, он не выполняет сетевых запросов и не подтверждает автора.
const DATABASE = "altnet-ipfs-site-cache";
const STORE = "cars";

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

export async function cacheVerifiedSite(car: Uint8Array, root: string): Promise<VerifiedSite> {
  if (!(car instanceof Uint8Array) || !car.length || car.length > SITE_MAX_CAR_BYTES) throw new Error("Некорректный размер архива сайта.");
  const snapshot = car.slice();
  const site = await verifySitePackage(snapshot, root);
  await transact<void>("readwrite", store => { store.put(snapshot.buffer, site.root); });
  return site;
}

export async function readCachedSite(root: string): Promise<VerifiedSite | null> {
  const canonical = parseSiteRoot(root).toString();
  const value = await transact<unknown>("readonly", (store, result) => {
    const request = store.get(canonical);
    request.onsuccess = () => result(request.result);
  });
  if (value === undefined) return null;
  if (!(value instanceof ArrayBuffer) || !value.byteLength || value.byteLength > SITE_MAX_CAR_BYTES) throw new Error("Локальная копия IPFS повреждена; данные не изменены.");
  return verifySitePackage(new Uint8Array(value), canonical);
}
