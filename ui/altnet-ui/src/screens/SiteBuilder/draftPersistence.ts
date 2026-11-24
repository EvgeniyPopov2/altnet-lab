import { INDEXED_DB_MARKER, STORAGE_KEY } from "./storage";
import type { Doc } from "./types";

const DATABASE = "altnet-sitebuilder-drafts";
const STORE = "drafts";
const CURRENT = "current";

export async function openDraftDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let request: IDBOpenDBRequest;
    try { request = indexedDB.open(DATABASE, 1); }
    catch (error) { reject(error); return; }
    const timer = setTimeout(() => { if (!settled) { settled = true; reject(new Error("Хранилище не ответило.")); } }, 10000);
    const fail = (error: unknown) => { if (!settled) { settled = true; clearTimeout(timer); reject(error); } };
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE); };
    request.onerror = () => fail(request.error || new Error("Не удалось открыть хранилище."));
    request.onblocked = () => fail(new Error("Хранилище занято другой вкладкой."));
    request.onsuccess = () => {
      if (settled) { request.result.close(); return; }
      settled = true; clearTimeout(timer);
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
  });
}

export async function writeIndexedDraft(json: string): Promise<void> {
  const db = await openDraftDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      let settled = false;
      const finish = (error?: unknown) => { if (settled) return; settled = true; clearTimeout(timer); if (error !== undefined) reject(error); else resolve(); };
      const timer = setTimeout(() => { try { tx.abort(); } catch { /* уже завершено */ } finish(new Error("Сохранение заняло слишком много времени.")); }, 30000);
      tx.oncomplete = () => finish();
      tx.onabort = () => finish(tx.error || new Error("Сохранение прервано."));
      tx.onerror = () => finish(tx.error || new Error("Не удалось сохранить черновик."));
      try { tx.objectStore(STORE).put(json, CURRENT); }
      catch (error) { try { tx.abort(); } catch { /* уже завершено */ } finish(error || new Error("Не удалось записать черновик.")); }
    });
  } finally { db.close(); }
}

export async function readIndexedDraft(): Promise<string | undefined> {
  const db = await openDraftDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const request = tx.objectStore(STORE).get(CURRENT);
      let value: unknown;
      let settled = false;
      const finish = (error?: unknown) => { if (settled) return; settled = true; clearTimeout(timer); if (error !== undefined) reject(error); else resolve(typeof value === "string" ? value : undefined); };
      const timer = setTimeout(() => { try { tx.abort(); } catch { /* уже завершено */ } finish(new Error("Чтение заняло слишком много времени.")); }, 30000);
      request.onsuccess = () => { value = request.result; };
      tx.oncomplete = () => finish();
      tx.onabort = () => finish(tx.error || new Error("Чтение прервано."));
      tx.onerror = () => finish(tx.error || new Error("Не удалось прочитать черновик."));
    });
  } finally { db.close(); }
}

export type SaveStatus = "saved" | "saving" | "indexeddb" | "failed";
type Job = { sequence: number; json: string; doc: Doc };

/** Пишет большие черновики последовательно и не даёт старой операции заменить новую версию. */
export class DraftWriter {
  private sequence = 0;
  private pending?: Job;
  private running = false;
  private listeners = new Set<(status: SaveStatus) => void>();
  private waiters: Array<() => void> = [];
  private unsaved?: Doc;
  private preferIndexedDb = false;
  private storage: Pick<Storage, "setItem">;
  private write: (json: string) => Promise<void>;
  status: SaveStatus = "saved";
  constructor(storage: Pick<Storage, "setItem">, write: (json: string) => Promise<void>) { this.storage = storage; this.write = write; }

  subscribe(listener: (status: SaveStatus) => void): () => void {
    this.listeners.add(listener); listener(this.status);
    return () => { this.listeners.delete(listener); };
  }
  private setStatus(status: SaveStatus) { this.status = status; this.listeners.forEach(listener => listener(status)); }
  getUnsaved(): Doc | undefined { return this.unsaved; }
  invalidate(): void { this.sequence++; this.pending = undefined; this.unsaved = undefined; this.preferIndexedDb = false; this.setStatus("saved"); }

  save(doc: Doc): void {
    const sequence = ++this.sequence;
    this.pending = undefined;
    this.unsaved = doc;
    let json: string;
    try { json = JSON.stringify(doc); }
    catch { this.setStatus("failed"); return; }
    if (!this.preferIndexedDb) {
      try {
        this.storage.setItem(STORAGE_KEY, json);
        this.unsaved = undefined;
        this.setStatus("saved");
        return;
      } catch { /* Большой документ или недоступное синхронное хранилище. */ }
    }
    this.pending = { sequence, json, doc };
    this.setStatus("saving");
    void this.pump();
  }

  private async pump(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      while (this.pending) {
        const job = this.pending; this.pending = undefined;
        try {
          await this.write(job.json);
          if (job.sequence !== this.sequence) continue;
          this.storage.setItem(STORAGE_KEY, INDEXED_DB_MARKER);
          this.preferIndexedDb = true;
          this.unsaved = undefined;
          this.setStatus("indexeddb");
        } catch {
          if (job.sequence === this.sequence) {
            if (this.preferIndexedDb) {
              try {
                this.storage.setItem(STORAGE_KEY, job.json);
                this.preferIndexedDb = false;
                this.unsaved = undefined;
                this.setStatus("saved");
                continue;
              } catch { /* Сохраняем предыдущую копию и сообщаем об ошибке. */ }
            }
            this.unsaved = job.doc; this.setStatus("failed");
          }
        }
      }
    } finally {
      this.running = false;
      for (const waiter of this.waiters.splice(0)) waiter();
    }
  }
  waitForIdle(): Promise<void> {
    return this.running ? new Promise(resolve => this.waiters.push(resolve)) : Promise.resolve();
  }
}

let sharedWriter: DraftWriter | undefined;
export function getSharedDraftWriter(): DraftWriter {
  if (!sharedWriter) {
    sharedWriter = new DraftWriter(window.localStorage, writeIndexedDraft);
    window.addEventListener("beforeunload", event => {
      if (sharedWriter?.status !== "saving" && sharedWriter?.status !== "failed") return;
      event.preventDefault(); event.returnValue = "";
    });
  }
  return sharedWriter;
}
