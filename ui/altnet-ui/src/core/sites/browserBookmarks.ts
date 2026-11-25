import { parseBrowserAddress } from "./browserNavigation";
import type { PrivacyProfile } from "../policy/types";

export type BrowserBookmark = { url: string; title: string; createdAt: number };
export const BOOKMARKS_KEY = "altnet.browser.bookmarks.v1";
const MAX_BOOKMARKS = 200;
type StorageReader = Pick<Storage, "getItem">;
type StorageWriter = StorageReader & Pick<Storage, "setItem">;

export function bookmarksKey(profile: PrivacyProfile): string {
  if (profile !== "anon" && profile !== "fast") throw new Error("Неизвестный профиль закладок.");
  return `${BOOKMARKS_KEY}.${profile}`;
}

/** Повреждённые данные не исправляются молча и не перезаписываются. */
export function readBookmarks(storage: StorageReader, profile?: PrivacyProfile): BrowserBookmark[] {
  const raw = storage.getItem(profile === undefined ? BOOKMARKS_KEY : bookmarksKey(profile));
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

export function toggleBookmark(storage: StorageWriter, url: string, title: string, now = Date.now(), profile?: PrivacyProfile): BrowserBookmark[] {
  const address = parseBrowserAddress(url);
  if (address.kind !== "site" && address.kind !== "ipfs") throw new Error("В закладки можно добавить только локальную страницу сайта.");
  const current = readBookmarks(storage, profile);
  const exists = current.some(item => item.url === address.url);
  if (!exists && current.length >= MAX_BOOKMARKS) throw new Error("Достигнут предел: 200 закладок.");
  const safeTitle = String(title || "").trim().slice(0, 200) || (address.kind === "site" ? address.slug : address.root);
  if (!Number.isFinite(now)) throw new Error("Некорректное время создания закладки.");
  const next = exists ? current.filter(item => item.url !== address.url) : [{ url: address.url, title: safeTitle, createdAt: now }, ...current];
  storage.setItem(profile === undefined ? BOOKMARKS_KEY : bookmarksKey(profile), JSON.stringify(next));
  return next;
}

/** Явное копирование старых общих закладок не удаляет и не меняет оригинал. */
export function copyLegacyBookmarks(storage: StorageWriter, profile: PrivacyProfile): BrowserBookmark[] {
  const legacy = readBookmarks(storage);
  const current = readBookmarks(storage, profile);
  const seen = new Set(current.map(item => item.url));
  const additions = legacy.filter(item => !seen.has(item.url));
  if (current.length + additions.length > MAX_BOOKMARKS) throw new Error("Слишком много закладок для копирования: предел 200.");
  const merged = [...current, ...additions];
  if (additions.length) storage.setItem(bookmarksKey(profile), JSON.stringify(merged));
  return merged;
}
