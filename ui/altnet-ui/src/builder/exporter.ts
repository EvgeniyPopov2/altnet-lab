// ui/altnet-ui/src/builder/exporter.ts
// Экспорт статического сайта в ZIP: index.html + styles.css + manifest.json + assets/*
// Безопасность: CSP, запрет inline-скриптов, белый список URL, best-effort загрузка картинок.

import JSZip from "jszip";
import { serializeBlock } from "./registry";

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

// Белый список схем для href/src; всё остальное → "#"
function sanitizeUrl(u?: string, fallback = "#"): string {
  let s = (u || "").trim();
  if (!s) return fallback;

  // убираем пробелы внутри (часто пишут "javascript: alert(1)")
  s = s.replace(/\s+/g, "");
  const lower = s.toLowerCase();

  // 1) чистый javascript: → запрет
  if (lower.startsWith("javascript:")) return fallback;

  // 2) якоря. недопускаем "#javascript:..." → "#"
  if (lower.startsWith("#")) {
    const rest = lower.slice(1);
    if (!rest || rest.startsWith("javascript:")) return "#";
    return s; // обычные якоря оставляем
  }

  // 3) белый список
  const allowed = [
    "https://", "http://",
    "ipfs://", "altfs://",
    "data:image/", "data:video/", "data:audio/",
    "/", "./", "../"
  ];
  if (allowed.some(p => lower.startsWith(p))) return s;

  return fallback;
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
.btn.secondary{background:#2a2e45}
img.responsive{max-width:100%;height:auto;border-radius:12px;box-shadow:0 6px 20px rgba(0,0,0,0.25)}
.card{background:var(--card);border:1px solid rgba(255,255,255,0.06);border-radius:16px;padding:20px}
footer{opacity:.8;padding:24px 0;text-align:center;font-size:14px}
.site-title{font-size:28px;line-height:1.2;margin:16px 0 12px;opacity:.85}
header.container{padding-top:12px;padding-bottom:0}
`.trim();

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

function buildIndexHtml(model: SiteModel): string {
  const title = esc(model.title || "AltNet Site");
  const desc = esc(model.description || "") || "Статический экспорт сайта, созданного в AltNet Конструкторе.";
  const body = renderBlocksToHtml(model.blocks || []);

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

// -------- Ассеты (best-effort) --------
const mimeToExt: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  // SVG в <img> безопасен, но часто ломает CORS; можно включить при необходимости:
  "image/svg+xml": "svg",
};

function isHttpUrl(s: string) {
  const l = s.toLowerCase();
  return l.startsWith("https://") || l.startsWith("http://");
}

async function tryFetchImageToZip(zip: JSZip, url: string, nameBase: string): Promise<{ savedPath?: string }> {
  try {
    const resp = await fetch(url, { mode: "cors" });
    if (!resp.ok) return {};
    const ct = resp.headers.get("content-type") || "";
    const ext = mimeToExt[ct.split(";")[0].trim()];
    if (!ext) return {}; // неизвестный MIME — не трогаем
    const buf = await resp.arrayBuffer();
    const path = `assets/${nameBase}.${ext}`;
    zip.file(path, buf);
    return { savedPath: `./${path}` };
  } catch {
    return {};
  }
}

function deepClone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x));
}

async function bundleImages(modelIn: SiteModel, zip: JSZip, onProgress?: (d: number, t: number) => void): Promise<{ model: SiteModel; assets: string[] }> {
  const model = deepClone(modelIn);
  const assets: string[] = [];

  // собираем кандидатов (только type=image и http(s))
  const candidates: Array<{ b: BlockInstance; idx: number }> = [];
  model.blocks.forEach((b, i) => {
    if (b?.type === "image") {
      const src = String(b?.props?.src || "");
      if (isHttpUrl(src)) candidates.push({ b, idx: i });
    }
  });

  const total = candidates.length;
  let done = 0;
  onProgress?.(done, total);

  for (let i = 0; i < candidates.length; i++) {
    const { b, idx } = candidates[i];
    const src = String(b?.props?.src || "");
    const base = `img-${i + 1}`;
    const res = await tryFetchImageToZip(zip, src, base);
    if (res.savedPath) {
      model.blocks[idx].props = { ...(model.blocks[idx].props || {}), src: res.savedPath };
      assets.push(res.savedPath.replace("./", ""));
    }
    done++;
    onProgress?.(done, total);
  }

  return { model, assets };
}

// -------- Публичный API --------
export async function exportSiteZip(modelIn: SiteModel, options?: ExportOptions): Promise<Blob> {
  const opts: ExportOptions = { bundleAssets: true, ...(options || {}) };
  const zip = new JSZip();

  // 1) Санация URL на уровне модели (доп. защита)
  const sanitized: SiteModel = {
    title: modelIn.title,
    description: modelIn.description,
    blocks: (modelIn.blocks || []).map((b) => {
      const p = { ...(b.props || {}) };
      if (b.type === "image" && typeof p.src === "string") p.src = sanitizeUrl(p.src);
      if (b.type === "button" && typeof p.href === "string") p.href = sanitizeUrl(p.href || "#");
      if (b.type === "hero") {
        if (typeof p.ctaHref === "string") p.ctaHref = sanitizeUrl(p.ctaHref || "#");
      }
      return { type: b.type, props: p };
    }),
  };

  // 2) При необходимости — подтянуть https-картинки в assets/ и переписать ссылки
  let model = sanitized;
  let assets: string[] = [];
  if (opts.bundleAssets) {
    const res = await bundleImages(sanitized, zip, opts.onProgress);
    model = res.model;
    assets = res.assets;
  }

  // 3) Файлы ZIP
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
      case "hero":
        return {
          type: "hero",
          props: {
            title: String(b.title || ""),
            subtitle: String(b.subtitle || ""),
            ctaLabel: String(b.ctaText || "Подробнее"),
            ctaHref: sanitizeUrl(b.ctaLink || "#"),
          },
        };
      case "h1":
        return { type: "h1", props: { text: String(b.text || "") } };
      case "p":
        return { type: "text", props: { text: String(b.text || "") } };
      case "img":
        return { type: "image", props: { src: sanitizeUrl(b.cid || ""), alt: String(b.alt || "") } };
      case "btn":
        return { type: "button", props: { label: String(b.label || "Кнопка"), href: sanitizeUrl(b.href || "#") } };
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
