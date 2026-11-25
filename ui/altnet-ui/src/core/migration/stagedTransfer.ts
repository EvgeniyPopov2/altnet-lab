import { decryptTransfer } from "./encryptedTransfer";
import { validateBrowserSnapshot } from "./browserSnapshot";

// Только зашифрованная временная запись. Ключ и расшифрованные данные не сохраняются.
// Это не восстановление: существующие базы и localStorage приложения не меняются.
const DATABASE = "altnet-migration-staging";
const STORE = "encrypted";
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MARKER = "restore:active";
export type RestoreMarker = { version: 1; id: string; state: "applying" | "complete" };

async function openStage(): Promise<IDBDatabase> {
  return await new Promise((resolve, reject) => {
    let settled = false;
    const request = indexedDB.open(DATABASE, 1);
    const timer = setTimeout(() => finish(new Error("Хранилище переноса не ответило.")), 10000);
    function finish(error?: Error) { if (settled) return; settled = true; clearTimeout(timer); if (error) reject(error); else resolve(request.result); }
    request.onupgradeneeded = event => {
      if (event.oldVersion !== 0 || request.result.objectStoreNames.length) {
        request.transaction?.abort(); finish(new Error("Неизвестная структура хранилища переноса.")); return;
      }
      request.result.createObjectStore(STORE);
    };
    request.onerror = () => finish(new Error("Не удалось открыть хранилище переноса."));
    request.onblocked = () => finish(new Error("Хранилище переноса занято."));
    request.onsuccess = () => { if (settled) request.result.close(); else finish(); };
  });
}

async function stageTransaction<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore, result: (value: T) => void) => void): Promise<T> {
  const db = await openStage();
  try {
    if (db.version !== 1 || db.objectStoreNames.length !== 1 || !db.objectStoreNames.contains(STORE)) throw new Error("Неизвестная структура хранилища переноса.");
    return await new Promise((resolve, reject) => {
      let settled = false, value: T;
      const tx = db.transaction(STORE, mode);
      const timer = setTimeout(() => { try { tx.abort(); } catch { /* уже завершена */ } finish(new Error("Операция переноса заняла слишком много времени.")); }, 30000);
      function finish(error?: Error) { if (settled) return; settled = true; clearTimeout(timer); if (error) reject(error); else resolve(value); }
      tx.onerror = () => finish(new Error("Не удалось обработать зашифрованный снимок."));
      tx.onabort = () => finish(new Error("Операция переноса прервана."));
      tx.oncomplete = () => finish();
      try { action(tx.objectStore(STORE), result => { value = result; }); }
      catch { try { tx.abort(); } catch { /* уже завершена */ } finish(new Error("Не удалось обработать зашифрованный снимок.")); }
    });
  } finally { db.close(); }
}

/** Проверяет ключ и структуру до записи; не изменяет данные действующего приложения. */
export async function stageEncryptedSnapshot(envelope: string, key: Uint8Array): Promise<string> {
  const plaintext = await decryptTransfer(envelope, key);
  try { validateBrowserSnapshot(plaintext); } finally { plaintext.fill(0); }
  const id = crypto.randomUUID();
  await stageTransaction<void>("readwrite", store => { store.add({ version: 1, envelope }, id); });
  return id;
}

/** Повторно проверяет целостность; результат находится только в памяти вызывающего. */
export async function readStagedSnapshot(id: string, key: Uint8Array): Promise<Uint8Array> {
  if (typeof id !== "string" || ID.exec(id)?.[0] !== id) throw new Error("Некорректный идентификатор переноса.");
  const entry = await stageTransaction<unknown>("readonly", (store, result) => {
    const request = store.get(id);
    request.onsuccess = () => result(request.result);
  });
  if (!entry || typeof entry !== "object" || Array.isArray(entry) || Object.keys(entry).length !== 2 ||
      !("version" in entry) || entry.version !== 1 || !("envelope" in entry) || typeof entry.envelope !== "string") throw new Error("Снимок переноса недоступен.");
  const plaintext = await decryptTransfer(entry.envelope, key);
  try { validateBrowserSnapshot(plaintext); return plaintext; }
  catch (error) { plaintext.fill(0); throw error; }
}

export async function restoreMarker(): Promise<RestoreMarker | null> {
  const value = await stageTransaction<unknown>("readonly", (store, result) => {
    const request = store.get(MARKER); request.onsuccess = () => result(request.result);
  });
  if (value === undefined) return null;
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== 3 ||
      !("version" in value) || value.version !== 1 || !("id" in value) || typeof value.id !== "string" || ID.exec(value.id)?.[0] !== value.id ||
      !("state" in value) || (value.state !== "applying" && value.state !== "complete")) throw new Error("Повреждён журнал переноса.");
  return value as RestoreMarker;
}

/** Запись журнала допускается только для одного снимка. */
export async function setRestoreMarker(id: string, complete: boolean): Promise<void> {
  if (ID.exec(id)?.[0] !== id) throw new Error("Некорректный идентификатор переноса.");
  await stageTransaction<void>("readwrite", store => {
    const request = store.get(MARKER);
    request.onsuccess = () => {
      const current: unknown = request.result;
      if (current !== undefined && (!current || typeof current !== "object" || !("id" in current) || current.id !== id ||
          !("version" in current) || current.version !== 1 || !("state" in current) || (current.state !== "applying" && current.state !== "complete"))) {
        store.transaction.abort(); return;
      }
      if (current === undefined && complete) { store.transaction.abort(); return; }
      const value: RestoreMarker = { version: 1, id, state: complete ? "complete" : "applying" };
      if (current === undefined) store.add(value, MARKER); else store.put(value, MARKER);
    };
  });
}
