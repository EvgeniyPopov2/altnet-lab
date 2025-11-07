// ui/altnet-ui/src/builder/exporter.ts
// Экспорт статического сайта в ZIP: index.html + styles.css + manifest.json + assets/*
// Безопасность: CSP, запрет inline-скриптов, белый список URL, best-effort загрузка картинок.
// Дополнительно: дедупликация ассетов по SHA-256 и безопасные rel для внешних ссылок.

import JSZip from "jszip";
import { serializeBlock } from "./registry";
import { fetchAndCleanImage, placeholderDataUrl, sanitizeHref, externalLinkRels } from "./cdr";

export type BlockInstance = {
  id?: string;
  type: string;
  props?: Record<string, any>;
};

export type SiteModel = {
  title?: string;
  description?: string;
  blocks: BlockInstance[];
};

export type ExportOptions = {
  bundleAssets?: boolean; // по умолчанию true
  onProgress?: (done: number, total: number) => void;
};

const esc = (html: string = "") =>
  html.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Локальный совместимый санитайзер URL, сохраняя твоё поведение.
 * - Пропускаем data: для image/video/audio (как у тебя было)
 * - Всё остальное — прокидываем через sanitizeHref() из cdr.ts (белый список схем).
 */
function sanitizeUrl(u?: string, fallback = "#"): string {
  let s = (u || "").trim();
  if (!s) return fallback;

  // убираем пробелы внутри (часто пишут "javascript: alert(1)")
  s = s.replace(/\s+/g, "");
  const lower = s.toLowerCase();

  // data: для медиа (разрешаем, как было)
  if (lower.startsWith("data:image/") || lower.startsWith("data:video/") || lower.startsWith("data:audio/")) {
    return s;
  }

  // остальное — через глобальный санитайзер (он отбросит javascript:, file:, vbscript:, и т.п.)
  const safe = sanitizeHref(s);
  return safe || fallback;
}

// -------- Стили (оффлайн) --------
const BASE_CSS = `
:root{--bg:#0b0d12;--fg:#e7e9f0;--muted:#9aa3b2;--accent:#5865f2;--card:#12141c}
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:var(--bg);color:var(--fg);font:16px/1.6 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial}
a{color:var(--accent);text-decoration:none}
.container{max-width:960px;margin:0 auto;padding:24px}
.section{padding:32px 0;border-bottom:1px solid rgba(255,255,255,0.06)}
h1{font-size:40px;line-height:1.2;margin:0 0 16px}
h2{font-size:28px;line-height:1.3;margin:0 0 12px}
p{margin:8px 0}
.muted{color:var(--muted)}
.hero{padding:72px 0;text-align:center;background:linear-gradient(180deg,rgba(88,101,242,0.12),rgba(88,101,242,0.02))}
.hero h1{font-size:48px;margin:0 0 12px}
.hero p{font-size:18px;color:var(--muted)}
.btn{display:inline-block;padding:10px 16px;border-radius:10px;background:var(--accent);color:white;font-weight:600}
.btn:focus-visible{outline:3px solid var(--accent);outline-offset:2px}
.btn.secondary{background:#2a2e45}
img.responsive{max-width:100%;height:auto;border-radius:12px;box-shadow:0 6px 20px rgba(0,0,0,0.25)}
.card{background:var(--card);border:1px solid rgba(255,255,255,0.06);border-radius:16px;padding:20px}
footer{opacity:.8;padding:24px 0;text-align:center;font-size:14px}
.site-title{font-size:28px;line-height:1.2;margin:16px 0 12px;opacity:.85}
header.container{padding-top:12px;padding-bottom:0}
.mt-8{margin-top:8px}
.mt-16{margin-top:16px}
.mt-24{margin-top:24px}
.mb-8{margin-bottom:8px}
.mb-16{margin-bottom:16px}
.mb-24{margin-bottom:24px}
`.trim();

const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#0b0d12"/><path d="M20 36l8 8 16-24" fill="none" stroke="#5865F2" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

// -------- Рендер --------
function renderBlocksToHtml(blocks: BlockInstance[]): string {
  return (blocks || [])
    .map((b) => {
      try {
        return serializeBlock(b.type, b.props || {});
      } catch {
        return `<section class="section"><p class="muted">[Неизвестный блок: ${esc(String(b?.type || ""))}]</p></section>`;
      }
    })
    .join("\n");
}

// Вставляет rel="noopener noreferrer nofollow" на все <a>, если ещё не задан
function ensureRelOnLinks(html: string): string {
  return html.replace(/<a\b([^>]*?)>/gi, (m, attrs) => {
    if (/\brel\s*=/i.test(attrs)) return m; // уже есть rel — не трогаем
    return `<a${attrs} rel="noopener noreferrer nofollow">`;
  });
}

function buildIndexHtml(model: SiteModel): string {
  const title = esc(model.title || "AltNet Site");
  const desc = esc(model.description || "") || "Статический экспорт сайта, созданного в AltNet Конструкторе.";
  const bodyRaw = renderBlocksToHtml(model.blocks || []);
  const body = ensureRelOnLinks(bodyRaw);

  const CSP = [
    "default-src 'self'",
    "script-src 'none'",
    "connect-src 'none'",
    "img-src 'self' https: data: ipfs: altfs:",
    "media-src 'self' https: data: ipfs: altfs:",
    "style-src 'self'",
    "font-src 'self'",
    "object-src 'none'",
    "frame-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");

  const header =
    model.title && model.title.trim()
      ? `<header class="container"><h1 class="site-title">${esc(model.title)}</h1></header>`
      : "";

  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${title}</title>
<meta name="description" content="${desc}"/>
<meta http-equiv="Content-Security-Policy" content="${CSP}"/>
<meta name="referrer" content="no-referrer"/>
<meta name="color-scheme" content="dark light"/>
<link rel="stylesheet" href="./styles.css"/>
<link rel="icon" href="./favicon.svg" type="image/svg+xml"/>
</head>
<body>
  ${header}
  <main class="container">
    ${body}
  </main>
  <footer>
    Сгенерировано в AltNet · ${new Date().toISOString()}
  </footer>
</body>
</html>`;
}

function buildManifest(model: SiteModel, assets: string[]): string {
  const data = {
    name: model.title || "AltNet Site",
    short_name: model.title || "AltNet",
    description: model.description || "Статический экспорт сайта, созданного в AltNet Конструкторе.",
    generatedAt: new Date().toISOString(),
    version: "1.0.0",
    assets,
  };
  return JSON.stringify(data, null, 2);
}

function isHttpUrl(s: string) {
  const l = s.toLowerCase();
  return l.startsWith("https://") || l.startsWith("http://");
}

function deepClone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x));
}

/**
 * Подтягиваем http(s)-картинки в assets/ с дедупликацией по SHA-256.
 * Имена вида: img-<hash8>.<ext> возвращаются из fetchAndCleanImage().
 */
async function bundleImages(
  modelIn: SiteModel,
  zip: JSZip,
  onProgress?: (d: number, t: number) => void
): Promise<{ model: SiteModel; assets: string[] }> {
  const model = deepClone(modelIn);
  const assets: string[] = [];
  const totalCandidates: Array<{ idx: number; url: string }> = [];

  model.blocks.forEach((b, i) => {
    if (b?.type === "image") {
      const src = String(b?.props?.src || "");
      if (isHttpUrl(src)) totalCandidates.push({ idx: i, url: src });
    }
  });

  const total = totalCandidates.length;
  let done = 0;
  onProgress?.(done, total);

  // hash -> filename (для дедупликации)
  const byHash = new Map<string, string>();

  for (const { idx, url } of totalCandidates) {
    try {
      const { name, blob, hash } = await fetchAndCleanImage(url); // попытка re-encode → PNG, remove EXIF
      let filename = byHash.get(hash);
      if (!filename) {
        filename = name;                  // уже "img-<hash8>.<ext>"
        byHash.set(hash, filename);
        zip.file(`assets/${filename}`, blob);
        assets.push(`assets/${filename}`);
      }
      // Переписываем src блока на локальный файл
      model.blocks[idx].props = { ...(model.blocks[idx].props || {}), src: `./assets/${filename}` };
    } catch {
      // Если не удалось скачать/перекодировать — ставим плейсхолдер (data:)
      model.blocks[idx].props = { ...(model.blocks[idx].props || {}), src: placeholderDataUrl() };
    } finally {
      done++;
      onProgress?.(done, total);
    }
  }

  return { model, assets };
}

// -------- Публичный API --------
export async function exportSiteZip(modelIn: SiteModel, options?: ExportOptions): Promise<Blob> {
  const opts: ExportOptions = { bundleAssets: true, ...(options || {}) };
  const zip = new JSZip();

  // 1) Санация URL на уровне модели + rel для внешних ссылок (не ломает, если serializeBlock это игнорит).
  const sanitized: SiteModel = {
    title: modelIn.title,
    description: modelIn.description,
    blocks: (modelIn.blocks || []).map((b) => {
      const p = { ...(b.props || {}) };

      if (b.type === "image" && typeof p.src === "string") {
        p.src = sanitizeUrl(p.src);
      }

      if (b.type === "button") {
        const href = sanitizeUrl(p.href || "#");
        const rel = externalLinkRels(href);
        p.href = href;
        if (rel) p.rel = rel;
      }

      if (b.type === "hero") {
        const href = sanitizeUrl(p.ctaHref || "#");
        const rel = externalLinkRels(href);
        p.ctaHref = href;
        if (rel) p.ctaRel = rel;
      }

      return { type: b.type, props: p };
    }),
  };

  // 2) При необходимости — подтянуть https-картинки в assets/ и переписать ссылки (с дедупом).
  let model = sanitized;
  let assets: string[] = [];
  if (opts.bundleAssets) {
    const res = await bundleImages(sanitized, zip, opts.onProgress);
    model = res.model;
    assets = res.assets;
  }

  // 3) Файлы ZIP
  zip.file("favicon.svg", FAVICON_SVG);
  zip.file("index.html", buildIndexHtml(model));
  zip.file("styles.css", BASE_CSS);
  zip.file("manifest.json", buildManifest(model, assets));
  zip.folder("assets"); // если ассетов нет — просто пустая папка

  return await zip.generateAsync({ type: "blob" });
}

export function downloadBlob(blob: Blob, filename: string = "altnet-site.zip") {
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(href);
}

// Адаптер из твоего конструктора → модель экспорта с маппингом типов и фильтрацией URL
export function adaptFromSiteBuilderDoc(builderDoc: any): SiteModel {
  const blocksRaw: any[] = Array.isArray(builderDoc?.blocks) ? builderDoc.blocks : [];
  const blocks: BlockInstance[] = blocksRaw.map((b) => {
    switch (b?.type) {
      case "hero": {
        const href = sanitizeUrl(b.ctaLink || "#");
        const rel = externalLinkRels(href);
        const target = href.startsWith("http") ? "_blank" : undefined; // ДОБАВКА
        return {
          type: "hero",
          props: {
            title: String(b.title || ""),
            subtitle: String(b.subtitle || ""),
            ctaLabel: String(b.ctaText || "Подробнее"),
            ctaHref: href,
            ...(rel ? { ctaRel: rel } : {}),
            ...(target ? { ctaTarget: target } : {}), // ДОБАВКА
          },
        };
      }
      case "h1":
        return { type: "h1", props: { text: String(b.text || "") } };
      case "p":
        return { type: "text", props: { text: String(b.text || "") } };
      case "img":
        return { type: "image", props: { src: sanitizeUrl(b.cid || ""), alt: String(b.alt || "") } };
      case "btn": {
        const href = sanitizeUrl(b.href || "#");
        const rel = externalLinkRels(href);
        const target = href.startsWith("http") ? "_blank" : undefined; // ДОБАВКА
        return { type: "button", props: { label: String(b.label || "Кнопка"), href, ...(rel ? { rel } : {}), ...(target ? { target } : {}), } };
      }
      default:
        return { type: "unknown", props: { raw: b } };
    }
  });

  return {
    title: builderDoc?.title || "Мой сайт",
    description: builderDoc?.description || "",
    blocks,
  };
}
