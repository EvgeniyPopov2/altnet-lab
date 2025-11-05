// ui/altnet-ui/src/builder/exporter.ts
// Экспорт статического сайта в ZIP: index.html + styles.css + manifest.json.
// Включает CSP и фильтрацию URL (href/src) через белый список.

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

const esc = (html: string = "") =>
  html
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// Разрешённые схемы/префиксы; всё остальное → "#"
function sanitizeUrl(u?: string, fallback = "#"): string {
  const s = (u || "").trim();
  if (!s) return fallback;
  const lower = s.toLowerCase();

  if (lower.startsWith("javascript:")) return fallback;

  const allowed = [
    "https://", "http://",
    "ipfs://", "altfs://",
    "data:image/", "data:video/", "data:audio/",
    "/", "./", "../", "#"
  ];
  if (allowed.some(p => lower.startsWith(p))) return s;

  return fallback;
}

// Базовые стили (оффлайн, без Tailwind)
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

function renderBlocksToHtml(blocks: BlockInstance[]): string {
  return (blocks || [])
    .map((b) => {
      try {
        return serializeBlock(b.type, b.props || {});
      } catch {
        return `<section class="section"><p class="muted">[Неизвестный блок: ${esc(
          String(b?.type || "")
        )}]</p></section>`;
      }
    })
    .join("\n");
}

function buildIndexHtml(model: SiteModel): string {
  const title = esc(model.title || "AltNet Site");
  const desc =
    esc(model.description || "") ||
    "Статический экспорт сайта, созданного в AltNet Конструкторе.";
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

function buildManifest(model: SiteModel): string {
  const data = {
    name: model.title || "AltNet Site",
    short_name: model.title || "AltNet",
    description:
      model.description ||
      "Статический экспорт сайта, созданного в AltNet Конструкторе.",
    generatedAt: new Date().toISOString(),
    version: "1.0.0",
  };
  return JSON.stringify(data, null, 2);
}

export async function exportSiteZip(model: SiteModel): Promise<Blob> {
  const zip = new JSZip();
  zip.file("index.html", buildIndexHtml(model));
  zip.file("styles.css", BASE_CSS);
  zip.file("manifest.json", buildManifest(model));
  zip.folder("assets"); // зарезервировано под ассеты (Шаг 2)
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

// Адаптер из твоего конструктора → модель экспорта с фильтрацией URL.
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
