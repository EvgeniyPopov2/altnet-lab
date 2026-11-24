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
  // Обратная косая черта и управляющие символы меняют трактовку URL браузером.
  if ((v.includes("\\") || /[^\x20-\x7e\u0080-\uffff]/.test(v)) || v.startsWith("//")) return "#";
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
    return v;
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

/** Настройки ссылки кнопки; неизвестные значения сохраняют прежнее поведение. */
export function buttonLinkOptions(href: string, open: unknown, indexing: unknown): { target: "_self" | "_blank"; rel?: string } {
  const external = /^https?:/i.test(href);
  const target = open === "new" ? "_blank" : open === "same" ? "_self" : external ? "_blank" : "_self";
  const rel: string[] = [];
  if (external || target === "_blank" || indexing === "follow") rel.push("noopener", "noreferrer");
  if (indexing === "nofollow" || (indexing !== "follow" && external)) rel.push("nofollow");
  return { target, ...(rel.length ? { rel: rel.join(" ") } : {}) };
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

/** Перекодировать Blob в PNG перед включением в экспорт. */
export async function tryReencodeToPng(blob: Blob): Promise<Blob> {
  if (blob.size > 10 * 1024 * 1024) throw new Error("Изображение превышает лимит 10 МиБ.");
  const allowedTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
  if (!allowedTypes.has(blob.type.toLowerCase())) throw new Error("Формат изображения не поддерживается.");
  const bmp = await createImageBitmap(blob);
  try {
    if (!bmp.width || !bmp.height || bmp.width * bmp.height > 16_000_000) {
      throw new Error("Изображение превышает допустимые размеры.");
    }
    const canvas = document.createElement("canvas");
    canvas.width = bmp.width;
    canvas.height = bmp.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Не удалось подготовить изображение.");
    ctx.drawImage(bmp, 0, 0);
    const out = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!out || out.type !== "image/png" || out.size === 0) throw new Error("Не удалось перекодировать изображение.");
    return out;
  } finally {
    bmp.close();
  }
}

type FetchOpts = { timeoutMs?: number; toPng?: boolean; preferredExt?: string };
const DEFAULT_FETCH_OPTS: FetchOpts = { timeoutMs: 10000, toPng: true, preferredExt: "png" };
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/**
 * Скачивает картинку, по возможности перекодирует в PNG, считает SHA-256 и возвращает {name, blob}.
 * Дедуп делается на уровне вызывающего кода по хэшам.
 */
export async function fetchAndCleanImage(url: string, opts: FetchOpts = DEFAULT_FETCH_OPTS): Promise<{ name: string; blob: Blob; hash: string; }> {
  if (opts.toPng === false) throw new Error("Экспорт изображения требует очистки.");
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_FETCH_OPTS.timeoutMs!);
  try {
    const resp = await fetch(url, { signal: controller.signal, mode: "cors" as RequestMode });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const reader = resp.body?.getReader();
    if (!reader) throw new Error("Не удалось прочитать изображение.");
    const parts: Uint8Array<ArrayBuffer>[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_IMAGE_BYTES) {
          controller.abort();
          throw new Error("Изображение превышает лимит 10 МиБ.");
        }
        parts.push(new Uint8Array(value));
      }
    } finally {
      reader.releaseLock();
    }
    const blob = await tryReencodeToPng(new Blob(parts, { type: resp.headers.get("content-type")?.split(";")[0] || "" }));
    const buf = await blob.arrayBuffer();
    const hash = await sha256Hex(buf);
    const name = makeNameFromHash(hash, "img", "png");
    return { name, blob, hash };
  } finally {
    clearTimeout(t);
  }
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
