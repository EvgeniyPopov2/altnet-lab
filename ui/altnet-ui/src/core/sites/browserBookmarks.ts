import { parseBrowserAddress } from "./browserNavigation";

export type BrowserBookmark = { url: string; title: string; createdAt: number };
export const BOOKMARKS_KEY = "altnet.browser.bookmarks.v1";
const MAX_BOOKMARKS = 200;
type StorageReader = Pick<Storage, "getItem">;
type StorageWriter = StorageReader & Pick<Storage, "setItem">;

/** Повреждённые данные не исправляются молча и не перезаписываются. */
export function readBookmarks(storage: StorageReader): BrowserBookmark[] {
  const raw = storage.getItem(BOOKMARKS_KEY);
  if (raw === null) return [];
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error("Список закладок повреждён. Данные не изменены."); }
  if (!Array.isArray(value) || value.length > MAX_BOOKMARKS) throw new Error("Список закладок повреждён. Данные не изменены.");
  const seen = new Set<string>();
  return value.map(item => {
    if (!item || typeof item !== "object" || typeof item.url !== "string" || typeof item.title !== "string" || !item.title.trim() || item.title.length > 200 ||
        typeof item.createdAt !== "number" || !Number.isFinite(item.createdAt)) throw new Error("Список закладок повреждён. Данные не изменены.");
    let address;
    try { address = parseBrowserAddress(item.url); } catch { throw new Error("Список закладок повреждён. Данные не изменены."); }
    if ((address.kind !== "site" && address.kind !== "ipfs") || address.url !== item.url || seen.has(item.url)) throw new Error("Список закладок повреждён. Данные не изменены.");
    seen.add(item.url);
    return { url: item.url, title: item.title, createdAt: item.createdAt };
  });
}

export function toggleBookmark(storage: StorageWriter, url: string, title: string, now = Date.now()): BrowserBookmark[] {
  const address = parseBrowserAddress(url);
  if (address.kind !== "site" && address.kind !== "ipfs") throw new Error("В закладки можно добавить только локальную страницу сайта.");
  const current = readBookmarks(storage);
  const exists = current.some(item => item.url === address.url);
  if (!exists && current.length >= MAX_BOOKMARKS) throw new Error("Достигнут предел: 200 закладок.");
  const safeTitle = String(title || "").trim().slice(0, 200) || (address.kind === "site" ? address.slug : address.root);
  if (!Number.isFinite(now)) throw new Error("Некорректное время создания закладки.");
  const next = exists ? current.filter(item => item.url !== address.url) : [{ url: address.url, title: safeTitle, createdAt: now }, ...current];
  storage.setItem(BOOKMARKS_KEY, JSON.stringify(next));
  return next;
}
