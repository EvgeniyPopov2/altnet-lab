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
  ogImage?: string;
  theme?: {
    accent?: string;       // HEX или css-цвет (напр. #5865F2)
    container?: number;    // ширина контейнера в px (напр. 960)
  };
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

// -------- Стили (оффлайн) — с подстановкой темы --------
function buildStylesCss(theme?: { accent?: string; container?: number }) {
  const accent = (theme?.accent || "#5865F2").trim();
  const container = Number.isFinite(theme?.container) ? Number(theme!.container) : 960;

  return `
:root{
  --bg:#0b0d12;
  --fg:#e7e9f0;
  --muted:#9aa3b2;
  --accent:${accent};
  --card:#12141c;
  --radius:14px;
  --radius-sm:10px;
  --shadow:0 10px 30px rgba(0,0,0,.25);
  --shadow-soft:0 6px 20px rgba(0,0,0,.18);
}
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:var(--bg);color:var(--fg);font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Noto Sans,"Helvetica Neue",Arial,"Apple Color Emoji","Segoe UI Emoji";-webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:none}
img{display:block;max-width:100%;height:auto}

.container{width:100%;max-width:${container}px;margin:0 auto;padding:24px}
header.container{padding-top:14px;padding-bottom:0}
.site-title{font-size:28px;line-height:1.2;margin:16px 0 12px;opacity:.9}

/* Секции */
.section{padding:40px 0;border-bottom:1px solid rgba(255,255,255,0.06)}
.t-left{text-align:left}.t-center{text-align:center}.t-right{text-align:right}

/* Типографика (Elementor-like scale) */
h1{font-size:56px;line-height:1.1;margin:0 0 16px;font-weight:800;letter-spacing:-0.02em}
h2{font-size:36px;line-height:1.15;margin:0 0 12px;font-weight:800;letter-spacing:-0.01em}
h3{font-size:24px;line-height:1.2;margin:0 0 10px;font-weight:700}
h4{font-size:20px;line-height:1.2;margin:0 0 8px;font-weight:700}
p{margin:8px 0;font-size:16px;color:var(--fg)}
.muted{color:var(--muted)}

/* Hero */
.hero{
  padding:80px 0;
  text-align:center;
  background:linear-gradient(180deg,rgba(88,101,242,0.14),rgba(88,101,242,0.03));
  border-bottom:1px solid rgba(255,255,255,0.06);
}
.hero h1{font-size:64px;margin:0 0 10px}
.hero p{font-size:18px;color:var(--muted)}

/* Кнопки */
.btn{
  display:inline-block;
  padding:12px 18px;
  border-radius:var(--radius-sm);
  background:var(--accent);
  color:#fff;
  font-weight:700;
  letter-spacing:.2px;
  border:1px solid rgba(255,255,255,.08);
  box-shadow:var(--shadow-soft);
  transition:transform .12s ease, box-shadow .12s ease, opacity .12s ease;
}
.btn:hover{transform:translateY(-1px);box-shadow:var(--shadow)}
.btn:active{transform:translateY(0);opacity:.95}
.btn:focus-visible{outline:3px solid var(--accent);outline-offset:2px}
.btn.secondary{background:#2a2e45}

/* Карточки/изображения */
img.responsive{border-radius:var(--radius);box-shadow:var(--shadow-soft)}
.card{
  background:var(--card);
  border:1px solid rgba(255,255,255,0.06);
  border-radius:var(--radius);
  padding:22px;
  box-shadow:var(--shadow-soft);
}

/* Мини-сетка для Cols2 */
.row{display:flex;flex-wrap:wrap;margin-left:-10px;margin-right:-10px;align-items:center}
.col{padding-left:10px;padding-right:10px;margin-bottom:18px}
.c-xs-12{width:100%}
@media(min-width:640px){
  .c-md-5{width:41.6667%}
  .c-md-6{width:50%}
  .c-md-7{width:58.3333%}
}
.order-1{order:1}.order-2{order:2}
@media(max-width:767px){.order-1,.order-2{order:initial}}

/* Ютилити-отступы / разделители */
.mt-8{margin-top:8px}.mt-16{margin-top:16px}.mt-24{margin-top:24px}
.mb-8{margin-bottom:8px}.mb-16{margin-bottom:16px}.mb-24{margin-bottom:24px}
.spacer-xs{height:8px}.spacer-sm{height:16px}.spacer-md{height:24px}.spacer-lg{height:40px}.spacer-xl{height:64px}
.divider{height:1px;border:0;background:rgba(255,255,255,0.08);margin:16px 0}

footer{opacity:.8;padding:26px 0;text-align:center;font-size:14px}
/* Section band */
.section-band{
  padding:40px 0;
  border-bottom:1px solid rgba(255,255,255,0.06);
}
.section-band.pad-sm{padding:24px 0}
.section-band.pad-md{padding:40px 0}
.section-band.pad-lg{padding:64px 0}

/* themes (локальные) */
.section-band.theme-auto{ /* оставляем фон страницы */ }
.section-band.theme-light{background:#f5f7fb;color:#0b0d12}
.section-band.theme-light .muted{color:#586070}
.section-band.theme-dark{background:#0b0d12;color:#e7e9f0}
.section-band.theme-dark .muted{color:#9aa3b2}

/* backgrounds */
.section-band.bg-none{}
.section-band.bg-subtle{
  background:linear-gradient(180deg,rgba(88,101,242,0.07),rgba(88,101,242,0.02));
}
.section-band.bg-card{
  background:var(--card);
  border:1px solid rgba(255,255,255,0.06);
  border-left:0;border-right:0;
}
.section-band.bg-accent{background:color-mix(in oklab, var(--accent) 12%, transparent)}
/* Grid 1–4 */
.grid-wrap{display:grid;gap:16px}
.grid-wrap.gc-1{grid-template-columns:1fr}
.grid-wrap.gc-2{grid-template-columns:repeat(2,1fr)}
.grid-wrap.gc-3{grid-template-columns:repeat(3,1fr)}
.grid-wrap.gc-4{grid-template-columns:repeat(4,1fr)}

.grid-card{
  background:var(--card);
  border:1px solid rgba(255,255,255,0.06);
  border-radius:var(--radius);
  overflow:hidden;
  box-shadow:var(--shadow-soft);
}
.grid-card img{display:block;width:100%;height:auto}
.grid-card .body{padding:12px 14px;color:var(--muted)}
`.trim();
}


// Иконка для single-file (data:)
const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect width="128" height="128" rx="28" fill="#5865F2"/><path d="M64 36c-12 0-22 9-22 20 0 9 7 16 16 19v9l14-9c8-3 14-10 14-19 0-11-10-20-22-20z" fill="#fff"/></svg>`;
const FAVICON_DATA = `data:image/svg+xml;utf8,${encodeURIComponent(FAVICON_SVG)}`;

function blobToDataUrl(b: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = rej;
    r.readAsDataURL(b);
  });
}

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

function buildIndexHtml(model: SiteModel, ogImage?: string): string {
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
<meta property="og:title" content="${title}"/>
<meta property="og:description" content="${desc}"/>
<meta property="og:type" content="website"/>
${ogImage ? `<meta property="og:image" content="${esc(ogImage)}"/>` : ""}
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:title" content="${title}"/>
<meta name="twitter:description" content="${desc}"/>
${ogImage ? `<meta name="twitter:image" content="${esc(ogImage)}"/>` : ""}
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

function pickOgImage(model: SiteModel, assets: string[]): string {
  // 1) если есть подтянутые ассеты — берём первый файл в assets/
  const first = assets.find(a => /^assets\//.test(a));
  if (first) return `./${first}`;

  // 2) иначе — ищем первый image-блок с http(s)
  const img = (model.blocks || []).find(b => b.type === "image" && typeof (b as any)?.props?.src === "string") as any;
  const src = img?.props?.src || "";
  if (/^https?:\/\//i.test(src)) return src;

  // 3) запасной вариант
  return "./favicon.svg";
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

  const ogImage = pickOgImage(model, assets);

  // 3) Файлы ZIP
  zip.file("favicon.svg", FAVICON_SVG);
  zip.file("index.html", buildIndexHtml(model, ogImage));
  zip.file("styles.css", buildStylesCss(model.theme));
  zip.file("manifest.json", buildManifest(model, assets));
  zip.folder("assets"); // если ассетов нет — просто пустая папка

  return await zip.generateAsync({ type: "blob" });
}

// Экспорт одним HTML-файлом (всё inline: CSS + изображения), без JS.
export async function exportSingleHtml(modelIn: SiteModel, options?: ExportOptions): Promise<Blob> {
  const opts: ExportOptions = { bundleAssets: true, ...(options || {}) };

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

  // Инлайн картинок http(s) → data:
  const model = JSON.parse(JSON.stringify(sanitized)) as SiteModel;
  if (opts.bundleAssets) {
    for (const b of model.blocks) {
      if (b.type === "image") {
        const src = String(b.props?.src || "");
        if (isHttpUrl(src)) {
          try {
            const { blob } = await fetchAndCleanImage(src);
            const dataUrl = await blobToDataUrl(blob);
            b.props = { ...(b.props || {}), src: dataUrl };
          } catch {
            b.props = { ...(b.props || {}), src: placeholderDataUrl() };
          }
        }
      }
    }
  }

  // Готовый index.html → single-file: inline CSS, data:-favicon, CSP без script
  let html = buildIndexHtml(model);
  html = html
    .replace(`<link rel="stylesheet" href="./styles.css"/>`, `<style>${buildStylesCss(model.theme)}</style>`)
    .replace(`style-src 'self'`, `style-src 'unsafe-inline'`)
    .replace(`href="./favicon.svg"`, `href="${FAVICON_DATA}"`);

  return new Blob([html], { type: "text/html" });
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

export function adaptFromSiteBuilderDoc(builderDoc: any): SiteModel {
  const rawBlocks: any[] = Array.isArray(builderDoc?.blocks) ? builderDoc.blocks : [];

  const blocks: BlockInstance[] = rawBlocks.map((b: any): BlockInstance => {
    const id = typeof b?.id === "string" ? b.id : undefined;
    const t = String(b?.type || "").toLowerCase();

    switch (t) {
      case "hero": {
        const href = sanitizeUrl(b?.ctaLink ?? b?.ctaHref ?? "#");
        const target = href.startsWith("http") ? "_blank" : "_self";
        const rel = externalLinkRels(href);
        const align = ["left", "center", "right"].includes(b?.align) ? b.align : "left";
        const src = typeof b?.src === "string" ? b.src : (typeof b?.img === "string" ? b.img : "");
        return {
          id,
          type: "hero",
          props: {
            title: String(b?.title ?? ""),
            subtitle: String(b?.subtitle ?? ""),
            text: String(b?.text ?? ""),
            align,
            src,
            alt: String(b?.alt ?? ""),
            ctaLabel: String(b?.ctaText ?? b?.ctaLabel ?? "Подробнее"),
            ctaHref: href,
            ctaTarget: target,
            ctaRel: rel,
          },
        };
      }

      case "h1":
        return {
          id,
          type: "h1",
          props: {
            text: String(b?.text ?? ""),
            align: ["left", "center", "right"].includes(b?.align) ? b.align : "left",
          },
        };

      case "heading": {
        const level = (["h2", "h3", "h4"].includes(b?.level) ? b.level : "h2") as "h2" | "h3" | "h4";
        const align = (["left", "center", "right"].includes(b?.align) ? b.align : "left") as "left" | "center" | "right";
        return {
          id,
          type: "heading",
          props: {
            text: String(b?.text ?? ""),
            level,
            align,
          },
        };
      }

      case "p":
      case "text":
        return {
          id,
          type: "text",
          props: {
            text: String(b?.text ?? ""),
            align: ["left", "center", "right"].includes(b?.align) ? b.align : "left",
          },
        };

      case "img":
      case "image":
        return {
          id,
          type: "image",
          props: {
            src: sanitizeUrl(b?.cid ?? b?.src ?? ""),
            alt: String(b?.alt ?? ""),
          },
        };

      case "btn":
      case "button": {
        const href = sanitizeUrl(b?.href ?? b?.ctaHref ?? "#");
        const target = href.startsWith("http") ? "_blank" : "_self";
        const rel = externalLinkRels(href);
        return {
          id,
          type: "button",
          props: {
            label: String(b?.label ?? b?.ctaText ?? "Кнопка"),
            href,
            target,
            rel,
            align: ["left", "center", "right"].includes(b?.align) ? b.align : "center",
          },
        };
      }

      case "cols2": {
        const ratio = ["5-7", "6-6", "7-5"].includes(b?.ratio) ? b.ratio : "6-6";
        return {
          id,
          type: "cols2",
          props: {
            title: String(b?.title ?? ""),
            text: String(b?.text ?? ""),
            img: sanitizeUrl(b?.img ?? ""),
            alt: String(b?.alt ?? ""),
            ratio,
            reverse: Boolean(b?.reverse),
          },
        };
      }

      case "spacer": {
        const size = ["xs", "sm", "md", "lg", "xl"].includes(b?.size) ? b.size : "md";
        return { id, type: "spacer", props: { size } };
      }

      case "divider":
        return { id, type: "divider", props: {} };

      case "section": {
        const align = ["left", "center", "right"].includes(b?.align) ? b.align : "left";
        const theme = ["auto", "light", "dark"].includes(b?.theme) ? b.theme : "auto";
        const pad = ["sm", "md", "lg"].includes(b?.pad) ? b.pad : "md";
        const bg = ["none", "subtle", "card", "accent"].includes(b?.bg) ? b.bg : "none";
        return {
          id,
          type: "section",
          props: {
            title: String(b?.title ?? ""),
            text: String(b?.text ?? ""),
            align, theme, pad, bg,
          },
        };
      }  

      case "grid": {
        const cols = [1, 2, 3, 4].includes(Number(b?.cols)) ? (Number(b.cols) as 1 | 2 | 3 | 4) : 3;
        const itemsSrc = Array.isArray(b?.items) ? b.items : [];
        const items = itemsSrc.map((it: any) => ({
          src: sanitizeUrl(String(it?.src ?? "")),
          alt: String(it?.alt ?? ""),
          caption: String(it?.caption ?? ""),
        }));
        return { id, type: "grid", props: { cols, items } };
      }

      default:
        // Фейл-сейф: пусть отрендерится диагностический блок, но не ломаем экспорт
        return { id, type: "unknown", props: { raw: b } };
    }
  });

  return {
    title: String(builderDoc?.title ?? "Мой сайт"),
    description: String(builderDoc?.description ?? ""),
    ogImage: typeof builderDoc?.ogImage === "string" ? builderDoc.ogImage : "",
    theme: {
      accent: typeof builderDoc?.theme?.accent === "string" ? builderDoc.theme.accent : undefined,
      container: Number.isFinite(builderDoc?.theme?.container) ? Number(builderDoc.theme.container) : undefined,
    },
    blocks,
  };
}
