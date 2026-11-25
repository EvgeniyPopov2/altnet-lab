import { storeForDatabase, encodeValue, readDatabase, validateBrowserSnapshot, type BrowserSnapshot, type SnapshotValue } from "./browserSnapshot";
import { readStagedSnapshot, restoreMarker, setRestoreMarker } from "./stagedTransfer";

const STAGING = "altnet-migration-staging";
const CONFLICT = "Найдены несовместимые данные в целевом профиле; перенос остановлен.";

function equalValue(actual: unknown, expected: SnapshotValue): boolean {
  try { return JSON.stringify(encodeValue(actual)) === JSON.stringify(expected); } catch { return false; }
}

function decoded(value: SnapshotValue): unknown {
  if (value.kind === "json") return value.value;
  const binary = atob(value.value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function databaseNames(): Promise<string[]> {
  if (typeof indexedDB.databases !== "function") throw new Error("Безопасная проверка хранилищ недоступна.");
  return (await indexedDB.databases()).map(item => item.name).filter((name): name is string => !!name && name.toLowerCase().startsWith("altnet"));
}

async function preflight(snapshot: BrowserSnapshot, resume: boolean): Promise<void> {
  const local = new Map(snapshot.local);
  for (let i = 0; i < localStorage.length; i++) {
    const name = localStorage.key(i);
    if (name?.startsWith("altnet.") && (!resume || !local.has(name) || localStorage.getItem(name) !== local.get(name))) throw new Error(CONFLICT);
  }
  const expected = new Map(snapshot.databases.map(db => [db.name, db]));
  const names = await databaseNames();
  if (new Set(names).size !== names.length) throw new Error(CONFLICT);
  for (const name of names) {
    if (name === STAGING) continue;
    const wanted = expected.get(name);
    if (!resume || !wanted) throw new Error(CONFLICT);
    const existing = await readDatabase(name, storeForDatabase(name), () => {});
    const records = new Map(wanted.records);
    for (const [key, value] of existing.records) {
      if (!records.has(key) || JSON.stringify(records.get(key)) !== JSON.stringify(value)) throw new Error(CONFLICT);
    }
  }
}

async function applyDatabase(data: BrowserSnapshot["databases"][number]): Promise<void> {
  const storeName = storeForDatabase(data.name);
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    let done = false;
    const request = indexedDB.open(data.name, 1);
    const timer = setTimeout(() => finish(new Error("Хранилище не ответило.")), 10000);
    function finish(error?: Error) { if (done) return; done = true; clearTimeout(timer); if (error) reject(error); else resolve(request.result); }
    request.onupgradeneeded = event => {
      if (event.oldVersion !== 0 || request.result.objectStoreNames.length) { request.transaction?.abort(); finish(new Error(CONFLICT)); return; }
      request.result.createObjectStore(storeName);
    };
    request.onblocked = () => finish(new Error("Хранилище занято."));
    request.onerror = () => finish(new Error("Не удалось открыть хранилище."));
    request.onsuccess = () => { if (done) request.result.close(); else finish(); };
  });
  try {
    if (db.version !== 1 || db.objectStoreNames.length !== 1 || !db.objectStoreNames.contains(storeName)) throw new Error(CONFLICT);
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      let done = false;
      const timer = setTimeout(() => { try { tx.abort(); } catch { /* already closed */ } finish(new Error("Восстановление заняло слишком много времени.")); }, 30000);
      function finish(error?: Error) { if (done) return; done = true; clearTimeout(timer); if (error) reject(error); else resolve(); }
      if (store.keyPath !== null || store.autoIncrement || store.indexNames.length) { tx.abort(); finish(new Error(CONFLICT)); return; }
      const remaining = new Map(data.records);
      const cursor = store.openCursor();
      cursor.onsuccess = () => {
        const item = cursor.result;
        if (item) {
          if (typeof item.key !== "string" || !remaining.has(item.key) || !equalValue(item.value, remaining.get(item.key)!)) {
            tx.abort(); finish(new Error(CONFLICT)); return;
          }
          remaining.delete(item.key); item.continue(); return;
        }
        try { for (const [key, value] of remaining) store.add(decoded(value), key); }
        catch { tx.abort(); finish(new Error("Не удалось восстановить записи.")); }
      };
      tx.oncomplete = () => finish();
      tx.onabort = tx.onerror = () => finish(new Error("Восстановление хранилища прервано."));
    });
  } finally { db.close(); }
}

/** Только для нового, изолированного профиля, когда приложение и все его вкладки остановлены. */
export async function restoreStagedSnapshotForIsolatedOrigin(id: string, key: Uint8Array): Promise<void> {
  if (!navigator.locks?.request) throw new Error("Безопасная блокировка переноса недоступна.");
  await navigator.locks.request("altnet.data-migration.v1", { mode: "exclusive", ifAvailable: true }, async lock => {
    if (!lock) throw new Error("Другой перенос уже выполняется.");
    const bytes = await readStagedSnapshot(id, key);
    try {
      const snapshot = validateBrowserSnapshot(bytes);
      const marker = await restoreMarker();
      if (marker && marker.id !== id) throw new Error(CONFLICT);
      await preflight(snapshot, marker !== null);
      if (!marker) await setRestoreMarker(id, false);
      for (const database of snapshot.databases) await applyDatabase(database);
      for (const [name, value] of snapshot.local) {
        const previous = localStorage.getItem(name);
        if (previous !== null && previous !== value) throw new Error(CONFLICT);
        if (previous === null) localStorage.setItem(name, value);
        if (localStorage.getItem(name) !== value) throw new Error(CONFLICT);
      }
      await preflight(snapshot, true);
      // Проверка полноты отдельно от проверки отсутствия конфликтов.
      for (const [name, value] of snapshot.local) if (localStorage.getItem(name) !== value) throw new Error(CONFLICT);
      const names = await databaseNames();
      for (const database of snapshot.databases) {
        if (!names.includes(database.name)) throw new Error(CONFLICT);
        const actual = await readDatabase(database.name, storeForDatabase(database.name), () => {});
        if (actual.records.length !== database.records.length) throw new Error(CONFLICT);
      }
      await setRestoreMarker(id, true);
    } finally { bytes.fill(0); }
  });
}
