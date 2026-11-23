export type PublishedPage = { path: string; title: string; html: string };
export type SiteMetaRecord = { slug: string; title: string; createdAt: number; updatedAt: number; pageCount?: number };
export type SiteRecord = SiteMetaRecord & { html: string; pages?: PublishedPage[] };
const DATABASE = "altnet-published-sites";
const STORE = "records";
const META = "meta:";
const HTML = "html:";
const PAGES = "pages:";

async function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest, settled = false;
    try { request = indexedDB.open(DATABASE, 1); } catch (error) { reject(error); return; }
    const timeout = setTimeout(() => { if (!settled) { settled = true; reject(new Error("Хранилище публикаций не ответило.")); } }, 10000);
    const fail = (error: unknown) => { if (!settled) { settled = true; clearTimeout(timeout); reject(error); } };
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE); };
    request.onerror = () => fail(request.error || new Error("Не удалось открыть хранилище публикаций."));
    request.onblocked = () => fail(new Error("Хранилище публикаций занято другой вкладкой."));
    request.onsuccess = () => {
      if (settled) { request.result.close(); return; }
      settled = true; clearTimeout(timeout); request.result.onversionchange = () => request.result.close(); resolve(request.result);
    };
  });
}

async function transact<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore, result: (value: T) => void, fail: (error: unknown) => void) => void): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      let value: T, settled = false;
      const finish = (error?: unknown) => { if (settled) return; settled = true; clearTimeout(timer); error ? reject(error) : resolve(value); };
      const fail = (error: unknown) => { try { tx.abort(); } catch { /* уже завершено */ } finish(error || new Error("Операция с публикацией не выполнена.")); };
      const timer = setTimeout(() => fail(new Error("Хранилище публикаций не ответило вовремя.")), 30000);
      tx.oncomplete = () => finish();
      tx.onabort = () => finish(tx.error || new Error("Операция с публикацией прервана."));
      tx.onerror = () => finish(tx.error || new Error("Не удалось обработать публикацию."));
      try { run(tx.objectStore(STORE), result => { value = result; }, fail); } catch (error) { fail(error); }
    });
  } finally { db.close(); }
}

function isMeta(value: any, slug?: string): value is SiteMetaRecord {
  return value && typeof value.slug === "string" && /^[a-z0-9][a-z0-9-]{0,95}$/.test(value.slug) && (!slug || value.slug === slug) &&
    typeof value.title === "string" && typeof value.createdAt === "number" && Number.isFinite(value.createdAt) &&
    typeof value.updatedAt === "number" && Number.isFinite(value.updatedAt) &&
    (value.pageCount === undefined || (Number.isInteger(value.pageCount) && value.pageCount >= 2 && value.pageCount <= 500));
}

function isPages(value: unknown, html: string, count: number): value is PublishedPage[] {
  if (!Array.isArray(value) || value.length !== count) return false;
  const paths = new Set<string>();
  for (const page of value) {
    if (!page || typeof page !== "object" || typeof page.path !== "string" ||
        !/^[a-z0-9][a-z0-9-]{0,63}\.html$/.test(page.path) || paths.has(page.path) ||
        typeof page.title !== "string" || typeof page.html !== "string" || !page.html) return false;
    paths.add(page.path);
  }
  return value.some(page => page.path === "index.html" && page.html === html);
}

export async function listIndexedSites(): Promise<SiteMetaRecord[]> {
  return transact("readonly", (store, result, fail) => {
    const entries: SiteMetaRecord[] = [];
    const request = store.openCursor(IDBKeyRange.bound(META, META + "\uffff"));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) { result(entries); return; }
      if (!isMeta(cursor.value) || cursor.key !== META + cursor.value.slug) { fail(new Error("Список публикаций повреждён; данные не изменены.")); return; }
      entries.push(cursor.value); cursor.continue();
    };
  });
}

export async function readIndexedSite(slug: string): Promise<SiteRecord | null> {
  const value = await transact<{ meta?: unknown; html?: unknown; pages?: unknown }>("readonly", (store, result) => {
    const found: { meta?: unknown; html?: unknown; pages?: unknown } = {};
    const meta = store.get(META + slug), html = store.get(HTML + slug), pages = store.get(PAGES + slug);
    meta.onsuccess = () => { found.meta = meta.result; };
    html.onsuccess = () => { found.html = html.result; };
    pages.onsuccess = () => { found.pages = pages.result; };
    result(found);
  });
  if (value.meta === undefined && value.html === undefined) return null;
  if (!isMeta(value.meta, slug) || typeof value.html !== "string" || !value.html) throw new Error("Публикация повреждена; данные не изменены.");
  if (value.meta.pageCount !== undefined) {
    if (!isPages(value.pages, value.html, value.meta.pageCount)) throw new Error("Страницы публикации повреждены; данные не изменены.");
    return { ...value.meta, html: value.html, pages: value.pages };
  }
  return { ...value.meta, html: value.html };
}

export async function writeIndexedSite(site: SiteRecord, replace: boolean): Promise<void> {
  if (!isMeta(site) || typeof site.html !== "string" || !site.html) throw new Error("Некорректные данные публикации.");
  const { html, pages, pageCount: _pageCount, ...rest } = site;
  if (pages !== undefined && (!isPages(pages, html, pages.length) || pages.length < 2 || pages.length > 500)) throw new Error("Некорректный список страниц публикации.");
  const meta: SiteMetaRecord = { ...rest, ...(pages ? { pageCount: pages.length } : {}) };
  await transact<void>("readwrite", store => {
    if (replace) {
      store.put(meta, META + site.slug); store.put(html, HTML + site.slug);
      if (pages) store.put(pages, PAGES + site.slug); else store.delete(PAGES + site.slug);
    } else {
      store.add(meta, META + site.slug); store.add(html, HTML + site.slug);
      if (pages) store.add(pages, PAGES + site.slug);
    }
  });
}

export async function deleteIndexedSite(slug: string): Promise<void> {
  await transact<void>("readwrite", store => { store.delete(META + slug); store.delete(HTML + slug); store.delete(PAGES + slug); });
}
