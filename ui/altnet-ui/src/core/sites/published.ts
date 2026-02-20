type PublishedSiteMetaV1 = {
  slug: string;
  title: string;
  createdAt: number;
  updatedAt: number;
};

export type PublishedSiteMeta = PublishedSiteMetaV1;

export type PublishedSite = PublishedSiteMetaV1 & {
  html: string;
};

const LS_INDEX_KEY = "altnet.sites.published.index.v1";
const LS_SITE_PREFIX = "altnet.sites.published.site.v1:";
const MAX_SITES = 20;

function safeParseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function readIndex(): PublishedSiteMeta[] {
  if (typeof window === "undefined") return [];
  const parsed = safeParseJson<PublishedSiteMeta[]>(window.localStorage.getItem(LS_INDEX_KEY));
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((x) => x && typeof x.slug === "string" && typeof x.title === "string")
    .map((x) => ({
      slug: x.slug,
      title: x.title,
      createdAt: typeof x.createdAt === "number" ? x.createdAt : Date.now(),
      updatedAt: typeof x.updatedAt === "number" ? x.updatedAt : Date.now(),
    }));
}

function writeIndex(items: PublishedSiteMeta[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LS_INDEX_KEY, JSON.stringify(items));
  } catch {
    // fail-silent
  }
}

function siteKey(slug: string): string {
  return LS_SITE_PREFIX + slug;
}

function readSiteRaw(slug: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(siteKey(slug));
  } catch {
    return null;
  }
}

function writeSiteRaw(slug: string, html: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(siteKey(slug), html);
  } catch {
    // quota/blocked storage
  }
}

function deleteSiteRaw(slug: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(siteKey(slug));
  } catch {
    // fail-silent
  }
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

export function listPublishedSites(): PublishedSiteMeta[] {
  const idx = readIndex();
  return idx.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getPublishedSite(slug: string): PublishedSite | null {
  const clean = String(slug || "").trim();
  if (!clean) return null;

  const idx = readIndex();
  const meta = idx.find((x) => x.slug === clean);
  if (!meta) return null;

  const html = readSiteRaw(clean);
  if (typeof html !== "string" || html.length === 0) return null;

  return { ...meta, html };
}

export function upsertPublishedSite(input: { title: string; html: string; slug?: string }): PublishedSiteMeta {
  const idx = readIndex();
  const existing = new Set(idx.map((x) => x.slug));

  const base = slugify(input.slug || input.title);
  const slug =
    input.slug && existing.has(input.slug) ? input.slug : ensureUniqueSlug(base, existing);

  const now = Date.now();
  const prev = idx.find((x) => x.slug === slug);

  const meta: PublishedSiteMeta = {
    slug,
    title: input.title || prev?.title || slug,
    createdAt: prev?.createdAt ?? now,
    updatedAt: now,
  };

  writeSiteRaw(slug, input.html);

  const nextIdx = [meta, ...idx.filter((x) => x.slug !== slug)]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_SITES);

  writeIndex(nextIdx);

  // Если обрезали по MAX_SITES — удаляем html “вытеснённых”
  const keep = new Set(nextIdx.map((x) => x.slug));
  for (const m of idx) {
    if (!keep.has(m.slug)) {
      deleteSiteRaw(m.slug);
    }
  }

  return meta;
}

export function deletePublishedSite(slug: string): void {
  const clean = String(slug || "").trim();
  if (!clean) return;
  const idx = readIndex();
  writeIndex(idx.filter((x) => x.slug !== clean));
  deleteSiteRaw(clean);
}
