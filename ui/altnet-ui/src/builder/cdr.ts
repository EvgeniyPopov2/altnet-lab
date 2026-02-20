// src/builder/cdr.ts
// Лёгкий CDR/санитайз для экспорта статики: хэш-имена, дедуп, безопасные ссылки.

export const ALLOWED_LINK_SCHEMES = [
  "#", "/", "./", "../",
  "https:", "http:",
  "mailto:", "tel:",
  "ipfs:", "ipld:", "altfs:", "alt:"
] as const;

export function sanitizeHref(raw: string): string {
  const v = (raw ?? "").trim();
  if (!v) return "#";
  const lower = v.toLowerCase();

  // Якоря: запрещаем конструкции вида "#javascript:...", "#https://..." и прочие схемы после '#'
  if (lower.startsWith("#")) {
    const rest = lower.slice(1);
    if (!rest) return "#";
    const bannedAfterHash = [
      "javascript:", "data:", "vbscript:", "file:",
      "http:", "https:", "ipfs:", "ipld:", "alt:", "altfs:"
    ];
    if (bannedAfterHash.some(p => rest.startsWith(p))) return "#";
    // обычный якорь типа "#section-1" оставляем как есть
    return "#"+rest;
  }

  // относительные пути считаем безопасными
  if (lower.startsWith("./") || lower.startsWith("../") || lower.startsWith("/")) return v;

  // допустимые явные схемы
  const allowed = ["https:", "http:", "mailto:", "tel:", "ipfs:", "ipld:", "altfs:", "alt:"];
  if (allowed.some(s => lower.startsWith(s))) return v;

  // всё остальное отбрасываем до "#"
  return "#";
}


export function externalLinkRels(href: string): string | undefined {
  const h = href.trim().toLowerCase();
  // внешними считаем http(s) без относительных путей
  if (h.startsWith("http://") || h.startsWith("https://")) {
    return "noopener noreferrer nofollow";
  }
  return undefined;
}

// ---------- Хэширование и работа с картинками ----------

export async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buf);
  const b = new Uint8Array(digest);
  return Array.from(b).map(x => x.toString(16).padStart(2, "0")).join("");
}

/** Имя файла вида: <prefix>-<hash8>.<ext> */
export function makeNameFromHash(hashHex: string, prefix: string, ext: string) {
  return `${prefix}-${hashHex.slice(0, 8)}.${ext}`;
}

/** Перекодировать Blob->PNG через canvas, срезая EXIF (если возможно). */
export async function tryReencodeToPng(blob: Blob): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bmp.width;
    canvas.height = bmp.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return blob;
    ctx.drawImage(bmp, 0, 0);
    const out = await new Promise<Blob>((resolve) => canvas.toBlob(b => resolve(b || blob), "image/png", 0.92));
    return out || blob;
  } catch {
    return blob; // CORS/другие ошибки — вернём как есть
  }
}

type FetchOpts = { timeoutMs?: number; toPng?: boolean; preferredExt?: string };
const DEFAULT_FETCH_OPTS: FetchOpts = { timeoutMs: 10000, toPng: true, preferredExt: "png" };

/**
 * Скачивает картинку, по возможности перекодирует в PNG, считает SHA-256 и возвращает {name, blob}.
 * Дедуп делается на уровне вызывающего кода по хэшам.
 */
export async function fetchAndCleanImage(url: string, opts: FetchOpts = DEFAULT_FETCH_OPTS): Promise<{ name: string; blob: Blob; hash: string; }> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_FETCH_OPTS.timeoutMs!);
  let resp: Response;

  try {
    resp = await fetch(url, { signal: controller.signal, mode: "cors" as RequestMode });
  } finally {
    clearTimeout(t);
  }

  if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
  let blob = await resp.blob();

  if (opts.toPng) {
    blob = await tryReencodeToPng(blob);
  }

  const buf = await blob.arrayBuffer();
  const hash = await sha256Hex(buf);

  // Определяем расширение
  const ext = (opts.preferredExt || guessExtFromType(blob.type) || "bin");
  const name = makeNameFromHash(hash, "img", ext);
  return { name, blob, hash };
}

export function guessExtFromType(mime: string | undefined | null): string | null {
  const m = (mime || "").toLowerCase();
  if (m.includes("png")) return "png";
  if (m.includes("jpeg") || m.includes("jpg")) return "jpg";
  if (m.includes("webp")) return "webp";
  if (m.includes("gif")) return "gif";
  return null;
}

/** Простой data:URI плейсхолдер (серый прямоугольник 960×540). */
export function placeholderDataUrl(): string {
  const c = document.createElement("canvas");
  c.width = 960; c.height = 540;
  const g = c.getContext("2d")!;
  g.fillStyle = "#d1d5db";
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = "#6b7280";
  g.font = "bold 72px system-ui, -apple-system, Segoe UI, Roboto, Arial";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("960 × 540", c.width / 2, c.height / 2);
  return c.toDataURL("image/png");
}
