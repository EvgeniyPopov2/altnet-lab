import { deleteIndexedSite, listIndexedSites, readIndexedSite, writeIndexedSite } from "./publishedDb";
import type { PublishedPage } from "./publishedDb";

type PublishedSiteMetaV1 = {
  slug: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  pageCount?: number;
};

export type PublishedSiteMeta = PublishedSiteMetaV1;

export type PublishedSite = PublishedSiteMetaV1 & {
  html: string;
  pages?: PublishedPage[];
  storageWarning?: string;
};

const LS_INDEX_KEY = "altnet.sites.published.index.v1";
const LS_SITE_PREFIX = "altnet.sites.published.site.v1:";
function readIndex(): PublishedSiteMeta[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(LS_INDEX_KEY);
  if (raw === null) return [];
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error("Старый список публикаций повреждён; данные не изменены."); }
  if (!Array.isArray(parsed) || !parsed.every(x => x && typeof x.slug === "string" && typeof x.title === "string")) throw new Error("Старый список публикаций повреждён; данные не изменены.");
  if (new Set(parsed.map(x => x.slug)).size !== parsed.length) throw new Error("Старый список содержит повторяющиеся адреса; данные не изменены.");
  return parsed
    .map((x) => ({
      ...x,
      slug: x.slug,
      title: x.title,
      createdAt: typeof x.createdAt === "number" ? x.createdAt : Date.now(),
      updatedAt: typeof x.updatedAt === "number" ? x.updatedAt : Date.now(),
    }));
}

function writeIndex(items: PublishedSiteMeta[]): void {
  if (typeof window === "undefined") throw new Error("Хранилище публикаций недоступно.");
  window.localStorage.setItem(LS_INDEX_KEY, JSON.stringify(items));
}

function siteKey(slug: string): string {
  return LS_SITE_PREFIX + slug;
}

function readSiteRaw(slug: string): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(siteKey(slug));
}

function deleteSiteRaw(slug: string): void {
  if (typeof window === "undefined") throw new Error("Хранилище публикаций недоступно.");
  window.localStorage.removeItem(siteKey(slug));
}

// Простейшая транслитерация RU -> LAT, чтобы slug был человекочитаемым
const RU2LAT: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "yo",
  ж: "zh",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "h",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "sch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
};

function translitRu(input: string): string {
  return input
    .split("")
    .map((ch) => {
      const low = ch.toLowerCase();
      if (low in RU2LAT) return RU2LAT[low];
      return ch;
    })
    .join("");
}

export function slugify(input: string): string {
  const raw = translitRu(String(input || ""))
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);

  if (raw.length >= 3) return raw;
  return `site-${Date.now().toString(36)}`;
}

function ensureUniqueSlug(base: string, existing: Set<string>): string {
  if (!existing.has(base)) return base;
  for (let i = 2; i < 1000; i++) {
    const s = `${base}-${i}`;
    if (!existing.has(s)) return s;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export async function listPublishedSites(): Promise<{ sites: PublishedSiteMeta[]; warning: string }> {
  let indexed: PublishedSiteMeta[] = [], legacy: PublishedSiteMeta[] = [];
  const failures: string[] = [];
  try { indexed = await listIndexedSites(); } catch { failures.push("новое хранилище"); }
  try { legacy = readIndex(); } catch { failures.push("старый список"); }
  const combined = new Map(legacy.map(site => [site.slug, site]));
  for (const site of indexed) combined.set(site.slug, site);
  return { sites: [...combined.values()].sort((a, b) => b.updatedAt - a.updatedAt), warning: failures.length ? `Не удалось прочитать ${failures.join(" и ")}; показаны доступные публикации.` : "" };
}

function getLegacySite(slug: string): PublishedSite | null {
  const clean = String(slug || "").trim();
  if (!clean) return null;
  const idx = readIndex();
  const meta = idx.find((x) => x.slug === clean);
  if (!meta) return null;
  const html = readSiteRaw(clean);
  if (typeof html !== "string" || html.length === 0) throw new Error("Старая публикация повреждена или её содержимое недоступно.");
  return { ...meta, html };
}

export async function getPublishedSite(slug: string): Promise<PublishedSite | null> {
  const clean = String(slug || "").trim();
  if (!clean) return null;
  try {
    const site = await readIndexedSite(clean);
    return site || getLegacySite(clean);
  } catch (error) {
    const legacy = getLegacySite(clean);
    if (legacy) return { ...legacy, storageWarning: "Новое хранилище недоступно; показана старая локальная копия." };
    throw error;
  }
}

export async function upsertPublishedSite(input: { title: string; html: string; slug?: string; pages?: PublishedPage[] }): Promise<PublishedSiteMeta> {
  const indexed = await listIndexedSites();
  const combined = new Map(readIndex().map(site => [site.slug, site]));
  for (const site of indexed) combined.set(site.slug, site);
  const idx = [...combined.values()];
  const existing = new Set(idx.map((x) => x.slug));

  const base = slugify(input.slug || input.title);
  const slug =
    input.slug && existing.has(input.slug) ? input.slug : ensureUniqueSlug(base, existing);

  const now = Date.now();
  const prev = idx.find((x) => x.slug === slug);

  const meta: PublishedSiteMeta = {
    ...prev,
    slug,
    title: input.title || prev?.title || slug,
    createdAt: prev?.createdAt ?? now,
    updatedAt: now,
    pageCount: input.pages?.length,
  };

  await writeIndexedSite({ ...meta, html: input.html, pages: input.pages }, indexed.some(site => site.slug === slug));
  return meta;
}

export async function deletePublishedSite(slug: string): Promise<void> {
  const clean = String(slug || "").trim();
  if (!clean) return;
  await listIndexedSites();
  const idx = readIndex();
  if (idx.some(site => site.slug === clean)) {
    writeIndex(idx.filter((x) => x.slug !== clean));
    try {
      deleteSiteRaw(clean);
    } catch (error) {
      // Содержимое ещё на месте. Вернём запись в каталог, если это возможно.
      try { writeIndex(idx); }
      catch { throw new Error("Содержимое старой публикации сохранено, но не удалось вернуть её в список. Не очищайте данные браузера."); }
      throw error;
    }
  }
  await deleteIndexedSite(clean);
}
