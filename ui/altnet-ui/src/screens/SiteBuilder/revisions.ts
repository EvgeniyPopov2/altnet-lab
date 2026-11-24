import { openDraftDatabase } from "./draftPersistence";
import { validateDraft } from "./storage";
import type { Doc } from "./types";

export type RevisionMeta = { id: string; createdAt: number; title: string; label: string; bytes: number };
const META = "revision-meta:";
const DATA = "revision-data:";
const safeId = (id: string) => /^[a-zA-Z0-9_-]{1,100}$/.test(id);

async function transact<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore, result: (value: T) => void, fail: (error: unknown) => void) => void): Promise<T> {
  const db = await openDraftDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction("drafts", mode);
      let value: T, settled = false;
      const finish = (error?: unknown) => { if (settled) return; settled = true; clearTimeout(timer); if (error !== undefined) reject(error); else resolve(value); };
      const fail = (error: unknown) => { try { tx.abort(); } catch { /* уже завершено */ } finish(error || new Error("Операция с версией не выполнена.")); };
      const timer = setTimeout(() => fail(new Error("Операция с версией заняла слишком много времени.")), 30000);
      tx.oncomplete = () => finish();
      tx.onabort = () => finish(tx.error || new Error("Операция с версией прервана."));
      tx.onerror = () => finish(tx.error || new Error("Не удалось обработать версию."));
      try { run(tx.objectStore("drafts"), result => { value = result; }, fail); }
      catch (error) { fail(error); }
    });
  } finally { db.close(); }
}

export async function createRevision(doc: Doc, label: string): Promise<void> {
  const json = JSON.stringify(doc);
  const id = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
  if (!safeId(id)) throw new Error("Не удалось создать идентификатор версии.");
  const meta: RevisionMeta = { id, createdAt: Date.now(), title: String(doc.title || ""), label: label.trim().slice(0, 80), bytes: new Blob([json]).size };
  await transact<void>("readwrite", store => { store.add(json, DATA + id); store.add(meta, META + id); });
}

export async function listRevisions(): Promise<RevisionMeta[]> {
  return transact<RevisionMeta[]>("readonly", (store, result, fail) => {
    const entries: RevisionMeta[] = [];
    const request = store.openCursor(IDBKeyRange.bound(META, META + "\uffff"));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) { result(entries.sort((a, b) => b.createdAt - a.createdAt)); return; }
      const value = cursor.value as Partial<RevisionMeta> | null;
      if (!value || typeof value.id !== "string" || !safeId(value.id) || cursor.key !== META + value.id ||
          typeof value.createdAt !== "number" || !Number.isFinite(value.createdAt) || typeof value.title !== "string" ||
          typeof value.label !== "string" || typeof value.bytes !== "number" || !Number.isFinite(value.bytes)) {
        fail(new Error("Список версий повреждён; сохранённые данные не изменены.")); return;
      }
      entries.push(value as RevisionMeta); cursor.continue();
    };
  });
}

export async function readRevision(id: string): Promise<Doc> {
  if (!safeId(id)) throw new Error("Некорректный идентификатор версии.");
  const raw = await transact<unknown>("readonly", (store, result) => {
    const request = store.get(DATA + id);
    request.onsuccess = () => result(request.result);
  });
  if (typeof raw !== "string") throw new Error("Данные версии не найдены.");
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error("Версия повреждена; текущая страница не изменена."); }
  const checked = validateDraft(parsed);
  if (checked.status !== "loaded") throw new Error("Версия повреждена; текущая страница не изменена.");
  return checked.doc;
}

export async function deleteRevision(id: string): Promise<void> {
  if (!safeId(id)) throw new Error("Некорректный идентификатор версии.");
  await transact<void>("readwrite", store => { store.delete(DATA + id); store.delete(META + id); });
}
