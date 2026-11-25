import { encryptTransfer } from "./encryptedTransfer";

// Только известные версии приложения. Неизвестное хранилище приводит к отказу,
// а не к незаметному исключению данных из будущего переноса.
const DATABASES = new Map([
  ["altnet-ipfs-site-cache", "cars"],
  ["altnet-published-sites", "records"],
  ["altnet-sitebuilder-drafts", "drafts"],
]);
const MAX_SIZE = 128 * 1024 * 1024;
const MAX_RECORDS = 10000;

type Value = { kind: "json"; value: unknown } | { kind: "bytes"; value: string };
type Snapshot = { version: 1; local: [string, string][]; databases: { name: string; records: [string, Value][] }[] };

function isBuffer(value: unknown): value is ArrayBuffer {
  try { Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, "byteLength")!.get!.call(value); return true; }
  catch { return false; }
}

function plain(value: unknown, seen = new WeakSet<object>(), depth = 0): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object" || depth > 64 || seen.has(value)) return false;
  const proto = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && proto !== Object.prototype && proto !== null) return false;
  if (Object.getOwnPropertySymbols(value).length) return false;
  if (Array.isArray(value) && (Object.keys(value).length !== value.length || !Object.keys(value).every((key, index) => key === String(index)))) return false;
  seen.add(value);
  const ok = Object.entries(value).every(([key, child]) => !["__proto__", "constructor", "prototype"].includes(key) && plain(child, seen, depth + 1));
  return ok;
}

function encodeValue(value: unknown): Value {
  if (isBuffer(value)) {
    if (value.byteLength > MAX_SIZE) throw new Error("Запись слишком велика для переноса.");
    const bytes = new Uint8Array(value);
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    return { kind: "bytes", value: btoa(binary) };
  }
  if (!plain(value)) throw new Error("Хранилище содержит неподдерживаемый тип; перенос остановлен.");
  return { kind: "json", value };
}

async function readDatabase(name: string, store: string, charge: (size: number) => void): Promise<{ name: string; records: [string, Value][] }> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    let settled = false;
    const request = indexedDB.open(name);
    const timer = setTimeout(() => finish(new Error("Хранилище не ответило.")), 10000);
    function finish(error?: Error) { if (settled) return; settled = true; clearTimeout(timer); if (error) reject(error); else resolve(request.result); }
    request.onupgradeneeded = () => { request.transaction?.abort(); finish(new Error("Хранилище изменилось во время чтения.")); };
    request.onblocked = () => finish(new Error("Хранилище занято другой вкладкой."));
    request.onerror = () => finish(new Error("Не удалось прочитать хранилище."));
    request.onsuccess = () => { if (settled) request.result.close(); else finish(); };
  });
  try {
    if (db.version !== 1 || db.objectStoreNames.length !== 1 || !db.objectStoreNames.contains(store)) throw new Error("Неизвестная структура хранилища; перенос остановлен.");
    return await new Promise((resolve, reject) => {
      const records: [string, Value][] = [];
      const tx = db.transaction(store, "readonly");
      let settled = false;
      const timer = setTimeout(() => { try { tx.abort(); } catch { /* уже завершена */ } finish(new Error("Чтение заняло слишком много времени.")); }, 30000);
      function finish(error?: Error) { if (settled) return; settled = true; clearTimeout(timer); if (error) reject(error); else resolve({ name, records }); }
      tx.onerror = () => finish(new Error("Не удалось прочитать записи."));
      tx.onabort = () => finish(new Error("Чтение хранилища прервано."));
      tx.oncomplete = () => finish();
      const request = tx.objectStore(store).openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        try {
          if (typeof cursor.key !== "string" || cursor.key.length > 2048 || records.length >= MAX_RECORDS) throw new Error("Неизвестные ключи хранилища; перенос остановлен.");
          const raw = cursor.value;
          if (isBuffer(raw)) charge(JSON.stringify(cursor.key).length * 3 + Math.ceil(raw.byteLength / 3) * 4 + 128);
          const value = encodeValue(raw);
          if (value.kind === "json") charge((JSON.stringify(cursor.key).length + JSON.stringify(value.value).length) * 3 + 128);
          records.push([cursor.key, value]);
          cursor.continue();
        } catch (error) { try { tx.abort(); } catch { /* уже завершена */ } finish(error instanceof Error ? error : new Error("Не удалось прочитать запись.")); }
      };
    });
  } finally { db.close(); }
}

async function capture(): Promise<Uint8Array<ArrayBuffer>> {
  if (typeof indexedDB.databases !== "function") throw new Error("Браузер не поддерживает безопасную проверку хранилищ.");
  const local: [string, string][] = [];
  let budget = 1024;
  const charge = (size: number) => { budget += size; if (budget > MAX_SIZE) throw new Error("Данные слишком велики для этого способа переноса."); };
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith("altnet.")) continue;
    const value = localStorage.getItem(key);
    if (value === null || key.length > 2048 || local.length >= MAX_RECORDS) throw new Error("Локальное хранилище изменилось во время чтения.");
    charge(JSON.stringify([key, value]).length * 3 + 32);
    local.push([key, value]);
  }
  local.sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  const found = await indexedDB.databases();
  const names = found.map(item => item.name).filter((name): name is string => !!name && name.toLowerCase().startsWith("altnet"));
  if (names.some(name => !DATABASES.has(name)) || new Set(names).size !== names.length) throw new Error("Найдены неизвестные базы AltNet; перенос остановлен.");
  const databases: Snapshot["databases"] = [];
  for (const name of names.sort()) databases.push(await readDatabase(name, DATABASES.get(name)!, charge));
  const result = new TextEncoder().encode(JSON.stringify({ version: 1, local, databases } satisfies Snapshot));
  if (!result.length || result.length > MAX_SIZE) throw new Error("Данные слишком велики для этого способа переноса.");
  return result;
}

/** Не создаёт файлов и не изменяет источник; вызывающая сторона обязана остановить запись. */
export async function encryptStableBrowserSnapshot(key: Uint8Array): Promise<string> {
  const first = await capture();
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", first));
  first.fill(0);
  const second = await capture();
  try {
    const after = new Uint8Array(await crypto.subtle.digest("SHA-256", second));
    if (digest.some((byte, index) => byte !== after[index])) throw new Error("Данные изменились во время чтения; повторите перенос после остановки записи.");
    return await encryptTransfer(second, key);
  } finally { second.fill(0); }
}

/** Только проверка снимка в памяти. Запись в хранилища здесь не выполняется. */
export function validateBrowserSnapshot(bytes: Uint8Array): Snapshot {
  try {
    if (!ArrayBuffer.isView(bytes) || Object.prototype.toString.call(bytes) !== "[object Uint8Array]" || !bytes.length || bytes.length > MAX_SIZE) throw new Error();
    const data: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
    const keysAre = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
    if (!record(data) || !keysAre(data, ["version", "local", "databases"]) || data.version !== 1 || !Array.isArray(data.local) || !Array.isArray(data.databases) || data.local.length > MAX_RECORDS || data.databases.length > DATABASES.size) throw new Error();
    const localKeys = new Set<string>();
    for (const item of data.local) {
      if (!Array.isArray(item) || item.length !== 2 || typeof item[0] !== "string" || !item[0].startsWith("altnet.") || item[0].length > 2048 || typeof item[1] !== "string" || localKeys.has(item[0])) throw new Error();
      localKeys.add(item[0]);
    }
    const databaseNames = new Set<string>();
    for (const database of data.databases) {
      if (!record(database) || !keysAre(database, ["name", "records"]) || typeof database.name !== "string" || !DATABASES.has(database.name) || databaseNames.has(database.name) || !Array.isArray(database.records) || database.records.length > MAX_RECORDS) throw new Error();
      databaseNames.add(database.name);
      const recordKeys = new Set<string>();
      for (const item of database.records) {
        if (!Array.isArray(item) || item.length !== 2 || typeof item[0] !== "string" || item[0].length > 2048 || recordKeys.has(item[0]) || !record(item[1]) || !keysAre(item[1], ["kind", "value"])) throw new Error();
        recordKeys.add(item[0]);
        const value = item[1];
        if (value.kind === "json") { if (!plain(value.value)) throw new Error(); }
        else if (value.kind === "bytes") {
          if (typeof value.value !== "string" || value.value.length > Math.ceil(MAX_SIZE * 4 / 3) || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value.value) || btoa(atob(value.value)) !== value.value) throw new Error();
        } else throw new Error();
      }
    }
    return data as Snapshot;
  } catch {
    throw new Error("Снимок повреждён или содержит неподдерживаемые данные; хранилище не изменено.");
  }
}
