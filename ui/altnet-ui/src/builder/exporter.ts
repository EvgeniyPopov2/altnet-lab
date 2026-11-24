import {popupSettings} from "../screens/SiteBuilder/popup";
import {soundSettings} from "../screens/SiteBuilder/soundCloud";
import {textPathOptions} from "../screens/SiteBuilder/textPath";
import {moreFragment} from "../screens/SiteBuilder/postExcerpt";
import { asRecord, oneOf, recordList } from "../core/records";
// ui/altnet-ui/src/builder/exporter.ts
// Экспорт статического сайта в ZIP: index.html + styles.css + manifest.json + assets/*
// Безопасность: CSP запрещает произвольные скрипты; для интерактивных компонентов разрешён фиксированный код по хешу.
// Дополнительно: дедупликация ассетов по SHA-256 и безопасные rel для внешних ссылок.

import type JSZip from "jszip";
import { buildSitemap } from "./sitemap";
import { serializeBlock } from "./registry";
import { buttonLinkOptions, placeholderDataUrl, sanitizeHref, externalLinkRels } from "./cdr";
import { resolveResponsiveStyle } from "../screens/SiteBuilder/responsiveStyle";
import { spacingStyle } from "../screens/SiteBuilder/boxDimensions";
import { backgroundStyle } from "../screens/SiteBuilder/backgroundStyle";
import { blockShadowStyle } from "../screens/SiteBuilder/blockShadowStyle";
import { advancedLayoutStyle } from "../screens/SiteBuilder/advancedLayoutStyle";
import { transformStyle } from "../screens/SiteBuilder/transforms";
import { animationCss, LOTTIE_HASH, loadLottieRenderer } from "./lottieRenderer";
import { loopSettings } from "../screens/SiteBuilder/dynamicContent";
import { mapSettings } from "../screens/SiteBuilder/blocks/map/geometry";
import { readAnimation, lottieOptions } from "../screens/SiteBuilder/lottie";
import { imageCaption } from "../screens/SiteBuilder/mediaLibrary";
import { SITE_RUNTIME, SITE_RUNTIME_HASH } from "./siteRuntime";
import { resolveFlexLayout, resolveGridGaps, resolveLayout } from "../screens/SiteBuilder/layoutResponsive";
import { spacerHeight } from "../screens/SiteBuilder/blocks/spacer/size";
import { imageAlignment, imageCaptionStyle, imageHoverStyle, imageStyle, imageTransition } from "../screens/SiteBuilder/imageStyle";
import { textAppearance } from "../screens/SiteBuilder/textAppearance";
import { buttonStyle } from "../screens/SiteBuilder/buttonStyle";
import { buttonIconPath } from "../screens/SiteBuilder/buttonIcons";
import { gridColumnCount, gridCoveredCells, gridTracks, readGridMerges } from "../screens/SiteBuilder/gridLayout";

export type BlockInstance = {
  id?: string;
  type: string;
  props?: Record<string, unknown>;
};

export type SiteModel = {
  title?: string;
  description?: string;
  ogImage?: string;
  seo?: { canonical?: string; index?: boolean; follow?: boolean };
  theme?: {
    accent?: string;       // HEX или css-цвет (напр. #5865F2)
    container?: number;    // ширина контейнера в px (напр. 960)
  };
  blocks: BlockInstance[];
};

export type ExportOptions = {
  bundleAssets?: boolean; // по умолчанию true
  onProgress?: (done: number, total: number) => void;
  /** Только адаптер с подтверждённым маршрутом; обычный browser fetch не используется по умолчанию. */
  imageLoader?: (url: string) => Promise<{ name: string; blob: Blob; hash: string }>;
  restrictExternalMedia?: boolean;
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

function sanitizeImageUrl(value: unknown): string {
  if (typeof value !== "string") return "";
  const raw = value.trim();
  if (!raw) return "";
  if (/^data:/i.test(raw)) return /^data:image\/(?:png|jpeg|webp|gif);base64,[a-z0-9+/=\s]+$/i.test(raw) ? raw : "";
  const safe = sanitizeHref(raw);
  return safe.startsWith("#") || /^(?:mailto|tel):/i.test(safe) ? "" : safe;
}

function sanitizeVideoUrl(value: unknown): string {
  if (typeof value !== "string") return "";
  const raw = value.trim();
  if (!raw) return "";
  if (/^data:/i.test(raw)) return /^data:video\/(?:mp4|webm);base64,[a-z0-9+/=\s]+$/i.test(raw) ? raw : "";
  const safe = sanitizeHref(raw);
  return safe.startsWith("#") || /^(?:mailto|tel):/i.test(safe) ? "" : safe;
}

function sanitizeSearchAction(value: unknown): string {
  if (typeof value !== "string") return "#";
  const raw = value.trim();
  if (!(raw.startsWith("/") || raw.startsWith("./") || raw.startsWith("../"))) return "#";
  return sanitizeHref(raw);
}

function sanitizeSocialHref(value: unknown): string {
  if (typeof value !== "string" || !/^https?:\/\//i.test(value.trim())) return "";
  try { const url = new URL(value.trim()); return !url.username && !url.password ? url.href : ""; }
  catch { return ""; }
}

export function sanitizeSocialImage(value: unknown): string {
  if (typeof value !== "string" || (value.includes("\\") || /[^\x21-\x7e\u0080-\uffff]/.test(value)) || !/^https?:\/\//i.test(value)) return "";
  try { const url = new URL(value); return !url.username && !url.password ? url.href : ""; }
  catch { return ""; }
}

export function sanitizeCanonicalUrl(value: unknown): string {
  const safe = sanitizeSocialImage(value);
  if (!safe) return "";
  try { return new URL(safe).hash ? "" : safe; } catch { return ""; }
}

function sanitizeSeo(value: SiteModel["seo"]): SiteModel["seo"] {
  return { canonical: sanitizeCanonicalUrl(value?.canonical), index: value?.index !== false, follow: value?.follow !== false };
}

// -------- Стили (оффлайн) — с подстановкой темы --------
function buildStylesCss(theme?: { accent?: string; container?: number }, extraCss = "") {
  const rawAccent = (theme?.accent || "").trim();
  const accent = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(rawAccent) ? rawAccent : "#5865F2";
  const container = Number.isFinite(theme?.container) ? Math.max(320, Math.min(2560, Number(theme!.container))) : 960;

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
.layout-row{display:flex;gap:16px;align-items:flex-start}
.layout-cell{min-width:0}
${Array.from({length: 16}, (_, i) => `.layout-w-${i + 1}{flex:${i + 1} 1 0}`).join("\n")}
@media(max-width:767px){.layout-row{flex-wrap:wrap}.layout-cell{flex-basis:100%}}
.notice{border:1px solid;padding:14px;border-radius:10px;margin:12px 0}.notice p{margin-bottom:0}
.notice-info{border-color:#606dd0;background:#101735}.notice-success{border-color:#1e774e;background:#0e2a1c}.notice-warning{border-color:#8c6a1e;background:#2a210f}.notice-danger{border-color:#9b1c1c;background:#2a1414}
.quote{border-left:4px solid var(--accent);padding:12px 16px;margin:16px 0;background:var(--card)}.quote cite{color:var(--muted)}
.progress-block{margin:12px 0}.progress-block progress{display:block;width:100%;accent-color:var(--accent)}.counter{font-size:2rem;font-weight:700}
.icon-list{list-style:none;padding:0;display:grid}.icon-list li{display:flex;align-items:flex-start;gap:8px}.icon-list small{display:block;color:var(--muted)}.icon-list-marker{color:var(--accent)}
.icon-list-sm{font-size:12px}.icon-list-md{font-size:14px}.icon-list-lg{font-size:16px}.icon-list-gap-sm{gap:6px}.icon-list-gap-md{gap:8px}.icon-list-gap-lg{gap:12px}
.icon-list-align-center li{justify-content:center}.icon-list-align-end li{justify-content:flex-end}
.code-block{overflow:auto;padding:16px;border:1px solid #30364b;border-radius:10px;background:#0f1630;color:#e6e9f4;white-space:pre}
.cta{padding:20px;border:1px solid #30364b;border-radius:14px}.cta-center{text-align:center}.cta-end{text-align:right}.cta-panel{background:#0b1022}.cta-brand{background:#101735}.cta .btn{margin-top:12px}.cta-button-secondary{background:#2a2e45}.cta-button-outline{background:transparent;border-color:var(--accent);color:var(--accent)}.cta-button-ghost{background:transparent;border-color:transparent;color:var(--accent);box-shadow:none}
.toc{border:1px solid #30364b;border-radius:10px;background:#0f1630;padding:12px}.toc ol{margin:0;padding-left:1.5em}.toc a{color:#9bb1ff}.toc a:hover{text-decoration:underline}
.breadcrumbs{display:flex;flex-wrap:wrap;gap:4px;list-style:none;margin:8px 0;padding:0}.breadcrumbs a{color:var(--accent)}.breadcrumbs-sm{font-size:12px}.breadcrumbs-md{font-size:13px}.breadcrumbs-lg{font-size:14px}.crumb-separator{padding:0 4px;opacity:.6}
.sb-container{margin:0 auto}.sb-container-sm{max-width:640px}.sb-container-md{max-width:768px}.sb-container-lg{max-width:1024px}.sb-container-xl{max-width:1280px}.sb-container-full{max-width:none}
.sb-container-pad-none{padding:0}.sb-container-pad-sm{padding:12px}.sb-container-pad-md{padding:24px}.sb-container-pad-lg{padding:32px}.sb-container-bg-panel{background:#0b1022}.sb-container-bg-brand{background:#101735}.sb-container-border{border:1px solid #1f2751}.sb-container-rounded{border-radius:16px}
.site-menu,.site-menu-children{list-style:none;margin:0;padding:0;display:flex;gap:8px}.site-menu-horizontal{flex-direction:row;flex-wrap:wrap}.site-menu-vertical,.site-menu-children{flex-direction:column}.site-menu-children{padding:4px 0 0 12px}.site-menu a,.site-menu-children a{display:block;padding:8px 10px;border:1px solid #30364b;border-radius:8px;background:#101735}.site-menu a[aria-current=page],.site-menu-children a[aria-current=page]{background:#26305a}
.site-cards{display:grid;gap:12px}.site-cards-1{grid-template-columns:1fr}.site-cards-2{grid-template-columns:repeat(2,minmax(0,1fr))}.site-cards-3{grid-template-columns:repeat(3,minmax(0,1fr))}.site-cards-4{grid-template-columns:repeat(4,minmax(0,1fr))}.site-card{overflow:hidden;border:1px solid #1f2751;border-radius:16px;background:#0b1022}.site-card img{width:100%;height:auto}.site-card-content{padding:16px}.site-card-icon{display:inline-block;padding:16px 16px 0;color:#9bb1ff}.site-card p{color:#c9d0e9}@media(max-width:767px){.site-cards{grid-template-columns:1fr}}
.site-icon-blue{color:#2a3b8f}.site-icon-purple{color:#5865F2}.site-icon-red{color:#ef4444}.site-icon-green{color:#34d399}.site-icon-gold{color:#ffd166}
.site-rating{display:flex;flex-direction:row-reverse;justify-content:flex-end}.site-rating input{position:absolute;opacity:0}.site-rating label{color:#687085;cursor:pointer;font-size:24px;line-height:1}.site-rating input:checked~label{color:#ffd166}.site-rating input:focus-visible+label{outline:2px solid var(--accent);outline-offset:2px}.site-rating input:disabled+label{cursor:default}
.price-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.price-item,.testimonials figure{margin:0;padding:16px;border:1px solid #1f2751;border-radius:16px;background:#0b1022}.price-item strong{font-size:24px}.price-item .btn{margin-top:12px}.testimonials{display:flex;gap:12px;overflow-x:auto;scroll-snap-type:x mandatory}.testimonials figure{flex:0 0 280px;scroll-snap-align:start}.testimonials blockquote{margin:0}.testimonials figcaption{margin-top:8px;color:var(--muted)}.testimonial-avatar{width:48px;height:48px;border-radius:50%;object-fit:cover;margin-bottom:8px}@media(max-width:767px){.price-list{grid-template-columns:1fr}}
.price-table{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:12px}.price-popular{border-color:#5865f2}.price-badge{display:inline-block;padding:3px 8px;border-radius:6px;background:#5865f2;color:#fff;font-size:12px}.price-table ul{list-style:none;padding:0}.price-table li{margin:5px 0}
.site-carousel video{display:block;max-width:100%;height:auto}
.site-hotspot{position:relative}.site-hotspot img{display:block;width:100%;height:auto}.site-hotspot-empty{aspect-ratio:16/9;display:grid;place-items:center;background:#151a2d}.site-hotspot-marker{position:absolute;transform:translate(-50%,-50%);display:grid;place-items:center;width:24px;height:24px;border:1px solid #fff;border-radius:50%;background:#5865f2;color:white;text-decoration:none}.site-hotspot-marker:focus-visible{outline:3px solid #fff;outline-offset:2px}
.video-playlist video{display:block;width:100%;height:auto}.playlist-items{display:grid;gap:8px;margin-top:12px}.playlist-items button{padding:10px;text-align:left;border:1px solid #1f2751;border-radius:8px;background:#101735;color:inherit;cursor:pointer}.playlist-items button[aria-pressed=true]{border-color:#5865f2;background:#121b3f}
.site-search{display:flex;flex-wrap:wrap;gap:8px}.site-search input{min-width:0;flex:1;padding:10px;border:1px solid #30364b;border-radius:8px;background:#0c0f1a;color:#e7e9f0}.site-search button{cursor:pointer}
.social-links{display:flex;flex-wrap:wrap;gap:8px}.social-links a,.social-links span.social-item{display:inline-flex;gap:8px;align-items:center;padding:6px 8px;border:1px solid #1f2751;border-radius:8px;background:#101735}.social-initial{display:grid;place-items:center;width:20px;height:20px;border-radius:50%;background:var(--accent);font-size:10px}
.step-tracker{display:flex;flex-wrap:wrap;gap:12px;list-style:none;padding:0}.step-tracker li{display:flex;align-items:center;gap:8px}.step-number{display:grid;place-items:center;width:20px;height:20px;border:1px solid #5865F2;border-radius:50%;font-size:12px}.step-done{background:#5865F2;color:#fff}
.pagination{display:flex;align-items:center;flex-wrap:wrap;gap:4px}.pagination a,.pagination span{padding:4px 8px;border:1px solid #1f2751;border-radius:8px}.pagination a{background:#101735}.pagination a[aria-current=page]{background:#5865F2}.pagination-sm{font-size:12px}.pagination-md{font-size:13px}.pagination-lg{font-size:14px}
.site-sidebar{width:100%;padding:16px;border:1px solid #1f2751;border-radius:16px;background:#0b1022}.site-sidebar-left{margin-right:auto}.site-sidebar-right{margin-left:auto}.site-sidebar ul{list-style:none;padding:0;margin:8px 0 0}.site-sidebar a{display:block;padding:4px 8px}.site-sidebar a:hover{text-decoration:underline}
.site-tabs{display:flex;gap:12px;flex-direction:column}.site-tabs-vertical{flex-direction:row;align-items:flex-start}.site-tab-controls{display:flex;flex-wrap:wrap;gap:4px}.site-tabs-vertical .site-tab-controls{flex-direction:column}.site-tabs-align-center .site-tab-controls{justify-content:center}.site-tabs-align-end .site-tab-controls{justify-content:flex-end}.site-tab-input{position:absolute;opacity:0}.site-tab-controls label{cursor:pointer;padding:6px 12px;border-radius:8px}.site-tab-input:checked+label{background:#5865F2;color:white}.site-tab-input:disabled+label{opacity:.4;cursor:not-allowed}.site-tab-input:focus-visible+label{outline:2px solid #5865F2;outline-offset:2px}.site-tabs-sm .site-tab-controls label{font-size:12px;padding:4px 8px}.site-tabs-lg .site-tab-controls label{font-size:16px;padding:8px 16px}.site-tabs-underline .site-tab-input:checked+label{background:transparent;border-bottom:2px solid #5865F2}.site-tabs-boxed .site-tab-controls{padding:4px;border:1px solid #1f2751;border-radius:10px}.site-tab-panels{flex:1;min-width:0}.site-tab-panel{display:none;padding:16px;border:1px solid #1f2751;border-radius:16px;background:#0b1022}@media(max-width:767px){.site-tabs-vertical{flex-direction:column}.site-tabs-vertical .site-tab-controls{flex-direction:row}}
.site-accordion{display:grid;gap:8px}.accordion-item{overflow:hidden;border-radius:12px}.accordion-item>button{width:100%;padding:10px 12px;text-align:left;border:1px solid #1f2751;border-radius:8px;background:#101735;color:#e6e9f4;cursor:pointer}.accordion-item>button:focus-visible{outline:2px solid #5865F2;outline-offset:2px}.accordion-panel{padding:10px 12px;color:#c9d0e9}.site-accordion-filled .accordion-item{background:#0b1022;border:1px solid #1f2751}.site-accordion-outline .accordion-item{border:1px solid #1f2751}.site-accordion-sm{font-size:12px}.site-accordion-md{font-size:14px}.site-accordion-lg{font-size:16px}
.site-share{display:flex;flex-wrap:wrap;gap:8px}.site-share a,.site-share button{padding:6px 8px;border:1px solid #1f2751;border-radius:8px;background:#101735;color:#e6e9f4;cursor:pointer}.site-share-status{flex-basis:100%;color:var(--muted);font-size:12px}
.content-nav ul{display:flex;flex-wrap:wrap;gap:8px;list-style:none;padding:0;margin:0}.content-nav-vertical ul{flex-direction:column}.content-nav a{display:block;padding:6px 8px;border:1px solid #1f2751;border-radius:8px;background:#101735}.content-nav a[aria-current=location]{border-color:#5865F2;background:#121b3f;color:#fff}
.site-carousel{position:relative;overflow:hidden;border:1px solid #1f2751;border-radius:16px;background:#0b1022}.site-carousel figure{margin:0}.site-carousel img{width:100%;height:auto}.site-carousel figcaption{padding:8px 12px}.carousel-controls{display:flex;align-items:center;justify-content:center;gap:12px;padding:8px}.carousel-controls button{padding:4px 10px;border:1px solid #1f2751;border-radius:8px;background:#101735;color:#e6e9f4;cursor:pointer}
.text-slide{padding:24px}.text-slide p{color:#c9d0e9}.text-slide .btn{margin-top:12px}
.site-countdown{font-size:24px;font-weight:700;font-variant-numeric:tabular-nums}
.site-drawer:not([open]){display:none}.site-drawer{height:100dvh;max-height:100dvh;max-width:100vw;padding:16px;border:1px solid #1f2751;background:#0b1022;color:#e7e9f0}.site-drawer-left{margin:0 auto 0 0}.site-drawer-right{margin:0 0 0 auto}.site-drawer::backdrop{background:rgba(0,0,0,.55)}.site-drawer-header{display:flex;align-items:center;justify-content:space-between;gap:12px}.site-drawer-text{white-space:pre-wrap}
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
.btn.ghost{background:transparent;border-color:transparent;box-shadow:none;color:var(--accent)}
.btn.btn-icon{display:inline-flex;align-items:center;gap:8px}
.btn-icon>.sb-button-icon{width:16px;height:16px;flex:none}

/* Карточки/изображения */
img.responsive, video.responsive{border-radius:var(--radius);box-shadow:var(--shadow-soft)}
${animationCss}
.sb-loop>[data-loop-list]{display:grid}.sb-loop article{min-width:0;overflow-wrap:anywhere}.sb-loop [hidden]{display:none!important}.sb-loop>nav{display:flex;align-items:center;gap:6px;margin-top:8px}.sb-loop>label{display:block;margin-bottom:8px}.sb-loop button,.sb-loop select{font:inherit;border:1px solid #8886;border-radius:4px;padding:4px 8px}.sb-loop h3{margin:4px 0}
.sb-map{margin:0}.sb-map-view{display:grid;place-items:center;overflow:hidden}.sb-map-view :is(svg,iframe){width:100%;height:100%;border:0}.sb-map small{display:block;font-size:10px}.sb-map button{cursor:pointer;border:1px solid #8886;border-radius:4px;padding:5px 8px;color:inherit;background:transparent}
@media(prefers-color-scheme:dark){.sb-map-auto svg rect{fill:#202f46}.sb-map-auto svg use{fill:#647d85}}
.sb-lightbox-trigger{background:transparent;border:0;padding:0;margin:0;cursor:zoom-in;color:inherit;font:inherit;display:block;width:100%;text-align:inherit}
.sb-lightbox-trigger:focus-visible img{outline:2px solid #8b78ff;outline-offset:2px}
.sb-lightbox{box-sizing:border-box;width:min(96vw,1440px);height:min(92dvh,1000px);max-width:96vw;max-height:92dvh;padding:12px;background:#111522;color:#fff;border:1px solid #454d61;border-radius:12px;margin:auto}
.sb-lightbox[open]{display:grid;grid-template-rows:auto minmax(0,1fr) auto;gap:8px}.sb-lightbox::backdrop{background:#080a10dd}
.sb-lightbox-toolbar{display:flex;align-items:center;justify-content:flex-end;flex-wrap:wrap;gap:6px}.sb-lightbox-toolbar span{margin-right:auto}.sb-lightbox-toolbar button{min-height:36px;background:#23293a;color:#fff;border:1px solid #59637b;border-radius:5px;padding:4px 9px}.sb-lightbox-toolbar button[aria-pressed=true]{background:#504099}.sb-lightbox button:focus-visible{outline:2px solid #bdb1ff}
.sb-lightbox-stage{display:grid;place-items:center;min-width:0;min-height:0;overflow:auto}.sb-lightbox-stage img{display:block;width:100%;height:100%;max-width:none;object-fit:contain}.sb-lightbox-stage[data-zoomed=true]{display:block}.sb-lightbox-stage[data-zoomed=true] img{width:auto;height:auto;margin:auto}
.sb-lightbox-caption{white-space:pre-wrap;text-align:center;margin:0}.sb-lightbox-caption:empty{display:none}
.sb-image-figure{margin:0}.sb-image-figure figcaption{margin-top:8px;white-space:pre-wrap}.sb-image-link:focus-visible{outline:2px solid #8b78ff;outline-offset:3px}
video.responsive{display:block;width:100%;max-width:100%;height:auto}
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
.spacer-xs{height:8px}.spacer-sm{height:16px}.spacer-md{height:32px}.spacer-lg{height:48px}.spacer-xl{height:64px}
.divider{height:0;border:0;border-top:1px solid #2a2f45;margin:16px 0}

footer{opacity:.8;padding:26px 0;text-align:center;font-size:14px}
/* Section band */
.section-band{
  padding:40px 0;
  border-bottom:1px solid rgba(255,255,255,0.06);
}
.section-band.pad-sm{padding:24px 0}
.section-band.pad-md{padding:40px 0}
.section-band.pad-lg{padding:64px 0}

.sb-popup{box-sizing:border-box;max-height:calc(100dvh - 2rem);padding:1.1rem;border:0;border-radius:.6rem;color:var(--fg);background:var(--card);box-shadow:var(--shadow);overflow:auto}
.sb-popup::backdrop{background:rgb(13 16 29 / .55)}.sb-popup-top{margin:1rem auto auto}.sb-popup-bottom{margin:auto auto 1rem}
.sb-popup-bar{display:flex;justify-content:flex-end}.sb-popup-bar button{padding:.3rem .5rem}
.sb-audio-card{display:grid;gap:.5rem;margin:1rem 0}.sb-audio-card iframe{border:0;max-width:100%}.sb-audio-card button{justify-self:start}
.sb-text-path{display:block;max-width:100%;height:auto;overflow:visible}.sb-text-path:hover text{fill:var(--sb-path-hover)}.sb-text-path:hover use{stroke:var(--sb-path-stroke)}
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
.grid-wrap{display:grid;column-gap:var(--gx,16px);row-gap:var(--gy,16px)}
.grid-wrap.gc-1{grid-template-columns:1fr}
.grid-wrap.gc-2{grid-template-columns:repeat(2,1fr)}
.grid-wrap.gc-3{grid-template-columns:repeat(3,1fr)}
.grid-wrap.gc-4{grid-template-columns:repeat(4,1fr)}
@media(max-width:767px){.grid-wrap.gc-2,.grid-wrap.gc-3,.grid-wrap.gc-4{grid-template-columns:repeat(2,minmax(0,1fr))}}

.grid-card{
  background:var(--card);
  border:1px solid rgba(255,255,255,0.06);
  border-radius:var(--radius);
  overflow:hidden;
  box-shadow:var(--shadow-soft);
}
.grid-card img{display:block;width:100%;height:auto}
.grid-card .body{padding:12px 14px;color:var(--muted)}
${extraCss}
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

function mapBlockTree(blocks: BlockInstance[], map: (block: BlockInstance) => BlockInstance): BlockInstance[] {
  return blocks.map(block => {
    const result = map(block);
    const cells = result.props?.layoutCells;
    if (Array.isArray(cells)) {
      result.props = { ...result.props, layoutCells: cells.map(cell => Array.isArray(cell) ? mapBlockTree(cell, map) : []) };
    }
    return result;
  });
}

function flattenBlockTree(blocks: BlockInstance[]): BlockInstance[] {
  return blocks.flatMap(block => [block, ...(Array.isArray(block.props?.layoutCells)
    ? block.props.layoutCells.flatMap((cell: BlockInstance[]) => Array.isArray(cell) ? flattenBlockTree(cell) : []) : [])]);
}

export function unsupportedBlockTypes(model: SiteModel): string[] {
  return [...new Set(flattenBlockTree(model.blocks || []).filter(block => block.type === "unknown")
    .map(block => String(asRecord(block.props?.raw).type || "неизвестный")))];
}

function prepareStyleRules(model: SiteModel): string {
  const rules: string[] = [];
  const declarations = (style: Record<string, unknown>, typography: boolean): string => {
    if (!style || typeof style !== "object") return "";
    const values: string[] = [];
    const add = (property: string, raw: unknown, negative = false) => {
      if (typeof raw !== "number" || !Number.isFinite(raw)) return;
      values.push(`${property}:${Math.max(negative ? -512 : 0, Math.min(512, raw))}px`);
    };
    for (const [key, value] of Object.entries({ ...spacingStyle(style), ...transformStyle(style), ...advancedLayoutStyle(style), ...backgroundStyle(style), ...blockShadowStyle(style) })) {
      values.push(key.replace(/[A-Z]/g, char => "-" + char.toLowerCase()) + ":" + value);
    }
    add("border-radius", style.br); add("border-width", style.bw);
    if (typeof style.w === "number" && Number.isFinite(style.w)) values.push(`width:${Math.max(1, Math.min(200, style.w))}%`);
    if (typeof style.minh === "number" && Number.isFinite(style.minh)) values.push(`min-height:${Math.max(0, Math.min(1200, style.minh))}px`);
    if (typeof style.op === "number" && Number.isFinite(style.op)) values.push(`opacity:${Math.max(0, Math.min(100, style.op)) / 100}`);
    if (typeof style.bs === "string" && ["none", "solid", "dashed", "dotted"].includes(style.bs)) values.push(`border-style:${style.bs}`);
    if (typeof style.bc === "string" && /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(style.bc)) values.push(`border-color:${style.bc}`);
    if (typeof style.bg === "string" && /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(style.bg)) values.push(`background-color:${style.bg}`);
    if (typography) {
      if (typeof style.ff === "string" && ["system-ui", "sans-serif", "serif", "monospace", "Arial", "Georgia", "Verdana", "Tahoma"].includes(style.ff)) values.push(`font-family:${style.ff}`);
      if (typeof style.fs === "number" && Number.isFinite(style.fs)) values.push(`font-size:${Math.max(1, Math.min(256, style.fs))}px`);
      if (typeof style.fw === "number" && Number.isFinite(style.fw)) values.push(`font-weight:${Math.max(100, Math.min(900, style.fw))}`);
      if (typeof style.lh === "number" && Number.isFinite(style.lh)) values.push(`line-height:${Math.max(0.5, Math.min(4, style.lh))}`);
      if (typeof style.tc === "string" && /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(style.tc)) values.push(`color:${style.tc}`);
      if (typeof style.ta === "string" && ["left", "center", "right", "justify"].includes(style.ta)) values.push(`text-align:${style.ta}`);
    }
    return values.join(";");
  };
  flattenBlockTree(model.blocks).forEach((block, index) => {
    const p = block.props || {};
    if (["grid","container","section","offcanvas"].includes(block.type) && Array.isArray(p.layoutCells) && p.layoutCells.length) {
      p.__layoutClass = `sb-layout-${index}`;
      const layoutBase = { layoutCells: p.layoutCells, layoutPreset: p.layoutWeights, layoutColumns: p.layoutColumns, layoutMerges: p.layoutMerges, layoutByBp: asRecord(p.layoutByBp), layoutGap: p.layoutGap, layoutGapX: p.layoutGapX, layoutGapY: p.layoutGapY };
      if (block.type === "section" || block.type === "container") {
        for (const [device, width] of [["desktop", 0], ["tablet", 1024], ["mobile", 767]] as const) {
          const flex = resolveFlexLayout({ ...layoutBase, flexByBp: p.flexByBp }, device);
          const selector = `.${p.__layoutClass}`;
          const declarations = Object.entries(flex.row).map(([name, value]) => `${name.replace(/[A-Z]/g, c => "-" + c.toLowerCase())}:${value}`).join(";");
          const row = `${selector}{${declarations}}`;
          const wrapper = block.type === "container" && flex.contentWidth ? `.sb-container:has(>${selector}){max-width:none}` : "";
          const cells = flex.cells.map((value, i) => `${selector}>.layout-cell:nth-child(${i + 1}){flex:${value}}`).join("");
          rules.push(width ? `@media(max-width:${width}px){${wrapper}${row}${cells}}` : wrapper + row + cells);
        }
      } else {
        const desktopLayout = resolveLayout(layoutBase, "desktop");
        const gridColumns = (device: "desktop" | "tablet" | "mobile") => resolveLayout(layoutBase, device).mode === "stack" ? "minmax(0,1fr)" : gridTracks(layoutBase, device).map(weight => `minmax(0,${weight}fr)`).join(" ");
        const gapCss = (device: "desktop" | "tablet" | "mobile") => {
          const gap = resolveGridGaps(layoutBase, device);
          return gap.x === gap.y ? `gap:${gap.x}px` : `column-gap:${gap.x}px;row-gap:${gap.y}px`;
        };
        rules.push(`.${p.__layoutClass}{${block.type === "grid" ? `${gapCss("desktop")};display:grid;align-items:stretch;grid-template-columns:${gridColumns("desktop")}` : `gap:${desktopLayout.gap}px`}}`);
        const merges = block.type === "grid" ? readGridMerges(layoutBase) || [] : [];
        const covered = block.type === "grid" ? gridCoveredCells(layoutBase) : new Set<number>();
        const count = block.type === "grid" ? gridColumnCount(layoutBase) : 0;
        const positions = (mode: "columns" | "stack") => merges.length ? layoutBase.layoutCells.map((_: unknown, cell: number) => {
          const selector = `.${p.__layoutClass}>.layout-cell:nth-child(${cell + 1})`;
          if (covered.has(cell)) return `${selector}{display:none}`;
          if (mode === "stack") return `${selector}{grid-column:auto;grid-row:auto}`;
          const merge = merges.find(item => item.start === cell);
          return `${selector}{grid-column:${cell % count + 1}/span ${merge?.columns || 1};grid-row:${Math.floor(cell / count) + 1}/span ${merge?.rows || 1}}`;
        }).join("") : "";
        if (merges.length) rules.push(positions("columns"));
        for (const [device, width] of [["tablet", 1024], ["mobile", 767]] as const) {
          const layout = resolveLayout(layoutBase, device);
          if (block.type === "grid") {
            rules.push(`@media(max-width:${width}px){.${p.__layoutClass}{${gapCss(device)};grid-template-columns:${gridColumns(device)}}${positions(layout.mode)}}`);
            continue;
          }
          const cells = layout.weights.map((weight, cell) => `.${p.__layoutClass}>.layout-cell:nth-child(${cell + 1}){flex:${layout.mode === "stack" ? "1 1 100%" : `${weight} 1 0`}}`).join("");
          rules.push(`@media(max-width:${width}px){.${p.__layoutClass}{gap:${layout.gap}px;flex-wrap:${layout.mode === "stack" ? "wrap" : "nowrap"}}${cells}}`);
        }
      }
    }
    if (block.type === "rating") p.__ratingName = `sb-rating-${index}`;
    if (block.type==="site-popup" && typeof p.id==="string" && /^popup-[a-z0-9_-]+$/i.test(p.id))
      rules.push("#"+p.id+"{width:min(calc(100% - 2rem),"+popupSettings(p.options).width+"px)}");
    if (block.type === "textpath") {
      const cls="sb-path-"+index, s=textPathOptions(p);
      p.__pathId=cls;
      rules.push("."+cls+"{--sb-path-hover:"+s.hoverColor+";--sb-path-stroke:"+s.hoverStroke+"}");
    }
    if (block.type === "button") {
      const cls = `sb-button-${index}`;
      const declarations = (rules: Record<string, string>, base = false) => Object.entries(rules).map(([key, value]) => `${key}:${value}${key === "color" ? "!important" : ""}`).join(";") + (base && rules["border-width"] && !rules["border-style"] ? ";border-style:solid" : "");
      const css = (device: "desktop" | "tablet" | "mobile") => {
        const style = buttonStyle(p.buttonStyleByBp, device);
        const normal = declarations(style.normal, true), hover = declarations(style.hover), active = declarations(style.active);
        const transition = style.duration === undefined ? "" : `transition-property:transform,box-shadow,opacity,color,background-color,border-color,border-radius,border-width,padding;transition-duration:${style.duration}ms`;
        const iconGap = style.iconGap === undefined ? "" : `gap:${style.iconGap}px`;
        const iconSize = style.iconSize === undefined ? "" : `.${cls}.btn>.sb-button-icon{width:${style.iconSize}px;height:${style.iconSize}px}`;
        const base = [normal, transition, iconGap].filter(Boolean).join(";");
        return `${base ? `.${cls}.btn{${base}}` : ""}${hover ? `.${cls}.btn:hover,.${cls}.btn:focus-visible{${hover}}` : ""}${active ? `.${cls}.btn:active{${active}}` : ""}${iconSize}`;
      };
      const [desktop, tablet, mobile] = (["desktop", "tablet", "mobile"] as const).map(css);
      if (desktop || tablet || mobile) {
        p.__buttonClass = cls;
        if (desktop) rules.push(desktop);
        if (tablet) rules.push(`@media(max-width:1024px){${tablet}}`);
        if (mobile) rules.push(`@media(max-width:767px){${mobile}}`);
        if ((["desktop", "tablet", "mobile"] as const).some(device => buttonStyle(p.buttonStyleByBp, device).duration !== undefined))
          rules.push(`@media(prefers-reduced-motion:reduce){.${cls}.btn{transition-duration:0ms!important}}`);
      }
    }
    if (block.type === "image") {
      const cls = `sb-image-${index}`;
      const declarations = (style: Record<string, string | number>) => Object.entries(style).map(([key, value]) => `${key.replace(/[A-Z]/g, char => "-" + char.toLowerCase())}:${value}${key.endsWith("Radius") || key === "boxShadow" ? "!important" : ""}`).join(";");
      const deviceRules = (selector: string, values: string[]) => {
        if (values[0]) rules.push(`${selector}{${values[0]}}`);
        if (values[1]) rules.push(`@media(max-width:1024px){${selector}{${values[1]}}}`);
        if (values[2]) rules.push(`@media(max-width:767px){${selector}{${values[2]}}}`);
      };
      const devices = ["desktop", "tablet", "mobile"] as const;
      const alignment = devices.map(device => { const value = imageAlignment(p.imageStyleByBp, device); return value ? `text-align:${value}` : ""; });
      if (alignment.some(Boolean)) { p.__imageWrapClass = `sb-image-wrap-${index}`; deviceRules(`.${p.__imageWrapClass}`, alignment); }
      const captions = devices.map(device => declarations(imageCaptionStyle(p.imageStyleByBp, device)));
      if (p.caption && captions.some(Boolean)) { p.__imageCaptionClass = `sb-image-caption-${index}`; deviceRules(`figcaption.${p.__imageCaptionClass}`, captions); }
      const css = (device: "desktop" | "tablet" | "mobile") => {
        const normal = declarations(imageStyle(p.imageStyleByBp, device)), hover = declarations(imageHoverStyle(p.imageStyleByBp, device));
        const duration = imageTransition(p.imageStyleByBp, device);
        const base = [normal, duration === undefined ? "" : `transition-property:opacity,filter,border-color,border-radius,border-width,box-shadow;transition-duration:${duration}ms`].filter(Boolean).join(";");
        return `${base ? `.${cls}{${base}}` : ""}${hover ? `.${cls}:hover,.sb-image-link:focus-visible>.${cls}{${hover}}` : ""}`;
      };
      const [desktop, tablet, mobile] = (["desktop", "tablet", "mobile"] as const).map(css);
      if (desktop || tablet || mobile) {
        p.__imageClass = cls;
        if (desktop) rules.push(desktop);
        if (tablet) rules.push(`@media(max-width:1024px){${tablet}}`);
        if (mobile) rules.push(`@media(max-width:767px){${mobile}}`);
        if ((["desktop", "tablet", "mobile"] as const).some(device => imageTransition(p.imageStyleByBp, device) !== undefined)) rules.push(`@media(prefers-reduced-motion:reduce){.${cls}{transition-duration:0ms!important}}`);
      }
    }
    if (block.type === "spacer") {
      p.__spacerClass = `sb-spacer-${index}`;
      rules.push(`.${p.__spacerClass}{height:${spacerHeight(p, "desktop")}px}@media(max-width:1024px){.${p.__spacerClass}{height:${spacerHeight(p, "tablet")}px}}@media(max-width:767px){.${p.__spacerClass}{height:${spacerHeight(p, "mobile")}px}}`);
    }
    if (block.type === "divider") {
      const width = typeof p.width === "number" && Number.isFinite(p.width) ? Math.max(1, Math.min(100, p.width)) : 100;
      const thickness = typeof p.thickness === "number" && Number.isFinite(p.thickness) ? Math.max(1, Math.min(12, p.thickness)) : 1;
      const color = typeof p.color === "string" && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(p.color) ? p.color : "#2a2f45";
      const style = oneOf(p.lineStyle, ["solid", "dashed", "dotted", "double"]) ? p.lineStyle : "solid";
      const margin = p.align === "right" ? "16px 0 16px auto" : p.align === "center" ? "16px auto" : "16px auto 16px 0";
      p.__dividerClass = `sb-divider-${index}`;
      rules.push(`.${p.__dividerClass}{width:${width}%;border-top:${thickness}px ${style} ${color};margin:${margin}}`);
    }
    if (block.type === "grid") {
      const gap = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(512, value)) : 16;
      p.__gridClass = `sb-grid-${index}`;
      rules.push(`.${p.__gridClass}{--gx:${gap(p.gapX)}px;--gy:${gap(p.gapY)}px}`);
    }
    if (block.type === "loopgrid") {
      const s=loopSettings(p),cls=`sb-loop-${index}`;
      p.__loopClass=cls;
      const columns=(n:number)=>`.${cls}>[data-loop-list]{grid-template-columns:repeat(${n},minmax(0,1fr));gap:${s.gap}px}`;
      rules.push(columns(s.columns.desktop),`@media(max-width:1024px){${columns(s.columns.tablet)}}`,`@media(max-width:767px){${columns(s.columns.mobile)}}`);
    }
    if (block.type === "map") {
      p.__mapClass = `sb-map-${index}`;
      rules.push(`.${p.__mapClass} .sb-map-view{height:${mapSettings(p).height}px}`);
    }
    if (block.type === "lottie") {
      const {width, maxWidth, align} = lottieOptions(p);
      p.__animationClass = `sb-animation-${index}`;
      const margin = align === "center" ? "auto" : align === "right" ? "auto 0" : "0 auto";
      rules.push(`.${p.__animationClass}{width:${width}%;max-width:${maxWidth}px;margin-inline:${margin}}`);
    }
    if (block.type === "sidebar") {
      const width = typeof p.width === "number" && Number.isFinite(p.width) ? Math.max(160, Math.min(520, p.width)) : 260;
      p.__sidebarClass = `sb-sidebar-${index}`;
      rules.push(`.${p.__sidebarClass}{max-width:${width}px}`);
    }
    if (block.type === "offcanvas") {
      const width = typeof p.width === "number" && Number.isFinite(p.width) ? Math.max(200, Math.min(640, p.width)) : 320;
      p.__drawerName = `sb-drawer-${index}`;
      rules.push(`.${p.__drawerName}{width:${width}px}`);
    }
    if (block.type === "hotspot" && Array.isArray(p.markers)) {
      p.__hotspotClass = `sb-hotspot-${index}`;
      recordList(p.markers).forEach((marker, i: number) => {
        const pct = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 50;
        rules.push(`.${p.__hotspotClass}-${i}{left:${pct(marker?.x)}%;top:${pct(marker?.y)}%}`);
      });
    }
    if (block.type === "tabs" && Array.isArray(p.tabs)) {
      p.__tabsName = `sb-tabs-${index}`;
      p.tabs.forEach((_: unknown, i: number) => rules.push(`.${p.__tabsName}:has(#${p.__tabsName}-tab-${i}:checked) #${p.__tabsName}-panel-${i}{display:block}`));
    }
    if (block.type === "accordion") p.__accordionName = `sb-accordion-${index}`;
    const builder = asRecord(p.__builder);
    if (!builder || typeof builder !== "object") return;
    if (builder.hideOn && typeof builder.hideOn === "object") {
      const visibility = asRecord(builder.hideOn);
      const cls = `sb-visibility-${index}`;
      if (visibility.desktop === true || visibility.tablet === true || visibility.mobile === true) p.__visibilityClass = cls;
      if (visibility.desktop === true) rules.push(`@media(min-width:1025px){.${cls}{display:none!important}}`);
      if (visibility.tablet === true) rules.push(`@media(min-width:768px) and (max-width:1024px){.${cls}{display:none!important}}`);
      if (visibility.mobile === true) rules.push(`@media(max-width:767px){.${cls}{display:none!important}}`);
    }
    const by = builder.styleByBp || {};
    const base = builder.style && typeof builder.style === "object" ? builder.style : {};
    const desktop = resolveResponsiveStyle(base, by, "desktop");
    const tablet = resolveResponsiveStyle(base, by, "tablet");
    const mobile = resolveResponsiveStyle(base, by, "mobile");
    const typography = ["h1", "heading", "text", "button"].includes(block.type);
    const layers = [desktop, tablet, mobile];
    const values = layers.map(layer => declarations(layer, typography));
    if (values.some(Boolean)) {
      const cls = `sb-style-${index}`;
      p.__styleClass = cls;
      if (values[0]) rules.push(`.${cls}{${values[0]}}`);
      if (values[1]) rules.push(`@media(max-width:1024px){.${cls}{${values[1]}}}`);
      if (values[2]) rules.push(`@media(max-width:767px){.${cls}{${values[2]}}}`);
      if (typography) {
        const has = (key: string) => layers.some(layer => layer[key] !== undefined && layer[key] !== null);
        const inherit = [["ff", "font-family"], ["fs", "font-size"], ["fw", "font-weight"], ["lh", "line-height"], ["tc", "color"]].filter(([key]) => has(key)).map(([key, css]) => `${css}:inherit${key === "tc" ? "!important" : ""}`).join(";");
        if (inherit) rules.push(`.${cls}>section>:is(h1,h2,h3,h4,h5,h6,div,span,p,a){${inherit}}`);
        if (has("ta")) rules.push(`.${cls}>section{text-align:inherit}`);
      }
    }
    if (typography) {
      const cls = `sb-style-${index}`;
      const target = `.${cls}>section>:is(h1,h2,h3,h4,h5,h6,div,span,p,a)`;
      for (const [i, width] of [0, 1024, 767].entries()) {
        const appearance = textAppearance(layers[i]);
        const normal = Object.entries(appearance.normal).map(([k, v]) => k + ":" + v).join(";");
        const hover = appearance.hover.color;
        if (!normal && !hover) continue;
        p.__styleClass = cls;
        const css = (normal ? `${target}{${normal}}` : "") + (hover ? `${target}:is(:hover,:focus-within),${target}:is(:hover,:focus-within)>a{color:${hover}!important}` : "");
        rules.push(width ? `@media(max-width:${width}px){${css}}` : css);
      }
    }
    for (const [i, width] of [0, 1024, 767].entries()) {
      const hover = transformStyle(layers[i], true);
      if (!Object.keys(hover).length) continue;
      p.__styleClass = `sb-style-${index}`;
      const declarations = Object.entries(hover).map(([k,v]) => k.replace(/[A-Z]/g, c => "-" + c.toLowerCase()) + ":" + v).join(";");
      const css = `.${p.__styleClass}:is(:hover,:focus-within){${declarations}}`;
      rules.push(width ? `@media(max-width:${width}px){${css}}` : css);
    }
    if (layers.some(layer => layer.transformDuration !== undefined)) rules.push(`@media(prefers-reduced-motion:reduce){.sb-style-${index}{transition-duration:0ms!important}}`);
    if (typeof builder.className === "string") p.__safeClass = builder.className;
    const anchor = builder.anchorId || builder.anchor;
    if (typeof anchor === "string") p.__safeAnchor = anchor;
  });
  return rules.join("\n");
}

type ImageReference = { url: string; set: (url: string) => void };
function imageReferences(blocks: BlockInstance[]): ImageReference[] {
  const refs: ImageReference[] = [];
  for (const block of flattenBlockTree(blocks)) {
    const p = block.props || {};
    const key = block.type === "image" || block.type === "hotspot" ? "src" : block.type === "cols2" ? "img" : undefined;
    if (key && isHttpUrl(String(p[key] || ""))) {
      refs.push({ url: String(p[key]), set: url => { p[key] = url; } });
    }
    if (block.type === "grid" && Array.isArray(p.items)) for (const item of p.items) {
      if (item && isHttpUrl(String(item.src || ""))) refs.push({ url: String(item.src), set: url => { item.src = url; } });
    }
    if (block.type === "imagebox" && Array.isArray(p.items)) for (const item of p.items) {
      if (item && isHttpUrl(String(item.src || ""))) refs.push({ url: String(item.src), set: url => { item.src = url; } });
    }
    if (block.type === "testimonials" && Array.isArray(p.items)) for (const item of p.items) {
      if (item && isHttpUrl(String(item.avatar || ""))) refs.push({ url: String(item.avatar), set: url => { item.avatar = url; } });
    }
    if (block.type === "carousel" && Array.isArray(p.slides)) for (const slide of p.slides) {
      if (slide && isHttpUrl(String(slide.src || ""))) refs.push({ url: String(slide.src), set: url => { slide.src = url; } });
    }
    if (block.type === "mediacarousel" && Array.isArray(p.slides)) for (const slide of p.slides) {
      if (slide && slide.kind !== "video" && isHttpUrl(String(slide.src || ""))) refs.push({ url: String(slide.src), set: url => { slide.src = url; } });
    }
    if (block.type === "videoplaylist" && Array.isArray(p.items)) for (const item of p.items) {
      if (item && isHttpUrl(String(item.poster || ""))) refs.push({ url: String(item.poster), set: url => { item.poster = url; } });
    }
    if (block.type === "video" && isHttpUrl(String(p.poster || ""))) refs.push({ url: String(p.poster), set: url => { p.poster = url; } });
  }
  return refs;
}

function sanitizeImageProperties(type: string, p: Record<string, unknown>): void {
  if (type === "lottie") p.poster = sanitizeImageUrl(p.poster);
  if (type === "image") p.src = sanitizeImageUrl(p.src);
  if (type === "hotspot") {
    p.src = sanitizeImageUrl(p.src);
    if (Array.isArray(p.markers)) p.markers = recordList(p.markers).map((marker) => ({ ...marker, href: typeof marker?.href === "string" && marker.href.trim() ? sanitizeHref(marker.href) : "" }));
  }
  if (type === "cols2") p.img = sanitizeImageUrl(p.img);
  if (type === "video") {
    p.src = sanitizeUrl(typeof p.src === "string" ? p.src : "", "");
    p.poster = sanitizeImageUrl(p.poster);
  }
  if (type === "grid" && Array.isArray(p.items)) p.items = recordList(p.items).map((item) => ({ ...item, src: sanitizeImageUrl(item?.src) }));
  if (type === "imagebox" && Array.isArray(p.items)) p.items = recordList(p.items).map((item) => ({ ...item, src: sanitizeImageUrl(item?.src) }));
  if (type === "testimonials" && Array.isArray(p.items)) p.items = recordList(p.items).map((item) => ({ ...item, avatar: sanitizeImageUrl(item?.avatar) }));
  if (type === "carousel" && Array.isArray(p.slides)) p.slides = recordList(p.slides).map((slide) => ({ ...slide, src: sanitizeImageUrl(slide?.src) }));
  if (type === "mediacarousel" && Array.isArray(p.slides)) p.slides = recordList(p.slides).map((slide) => ({ ...slide, src: slide?.kind === "video" ? sanitizeVideoUrl(slide?.src) : sanitizeImageUrl(slide?.src) }));
  if (type === "videoplaylist" && Array.isArray(p.items)) p.items = recordList(p.items).map((item) => ({ ...item, src: sanitizeVideoUrl(item?.src), poster: sanitizeImageUrl(item?.poster) }));
  if (type === "slides" && Array.isArray(p.slides)) p.slides = recordList(p.slides).map((slide) => ({ ...slide, ctaHref: typeof slide?.ctaHref === "string" && slide.ctaHref.trim() ? sanitizeHref(slide.ctaHref) : "" }));
}

function sanitizeListProperties(type: string, p: Record<string, unknown>): void {
  if ((type === "iconlist" || type === "breadcrumbs" || type === "sidebar") && Array.isArray(p.items)) p.items = recordList(p.items).map((item) => ({
    ...item, href: typeof item?.href === "string" && item.href.trim() ? sanitizeHref(item.href) : "",
  }));
  if (type === "cta") p.btnHref = typeof p.btnHref === "string" && p.btnHref.trim() ? sanitizeHref(p.btnHref) : "";
  if (type === "search") p.action = sanitizeSearchAction(p.action);
  if (type === "social" && Array.isArray(p.items)) p.items = recordList(p.items).map((item) => ({ ...item, href: sanitizeSocialHref(item?.href) }));
  if (type === "share") {
    const safe = typeof p.url === "string" && p.url.trim() ? sanitizeHref(p.url) : "";
    p.url = safe === "#" ? "" : safe;
  }
  if (type === "tabs" && Array.isArray(p.tabs)) p.tabs = recordList(p.tabs).map((tab) => ({ label: String(tab?.label ?? ""), content: String(tab?.content ?? ""), disabled: Boolean(tab?.disabled) }));
  if (type === "accordion" && Array.isArray(p.items)) p.items = recordList(p.items).map((item) => ({ title: String(item?.title ?? ""), content: String(item?.content ?? ""), open: Boolean(item?.open) }));
  if (type === "pricelist" && Array.isArray(p.items)) p.items = recordList(p.items).map((item) => ({ ...item, ctaHref: typeof item?.ctaHref === "string" && item.ctaHref.trim() ? sanitizeHref(item.ctaHref) : "" }));
  if (type === "toc" && Array.isArray(p.items)) p.items = recordList(p.items).map((item) => ({ ...item, href: typeof item?.href === "string" && item.href.trim().startsWith("#") ? sanitizeHref(item.href) : "#" }));
  if (type === "contentnav" && Array.isArray(p.items)) p.items = recordList(p.items).map((item) => ({ ...item, href: typeof item?.href === "string" && item.href.trim().startsWith("#") ? sanitizeHref(item.href) : "#" }));
  if (type === "menu" && Array.isArray(p.items)) {
    const sanitizeItems = (items: unknown[], depth = 0): Record<string, unknown>[] => {
      if (depth > 64) throw new Error("Слишком глубокая вложенность меню");
      return recordList(items).map(item => ({ ...item, href: typeof item?.href === "string" ? sanitizeHref(item.href) : "#", ...(Array.isArray(item?.children) ? { children: sanitizeItems(item.children, depth + 1) } : {}) }));
    };
    p.items = sanitizeItems(p.items);
  }
}

// Вставляет rel="noopener noreferrer nofollow" на все <a>, если ещё не задан
function ensureRelOnLinks(html: string): string {
  return html.replace(/<a\b([^>]*?)>/gi, (m, attrs) => {
    if (/\brel\s*=/i.test(attrs)) return m; // уже есть rel — не трогаем
    return `<a${attrs} rel="noopener noreferrer nofollow">`;
  });
}

async function buildIndexHtml(model: SiteModel, ogImage?: string, restrictExternalMedia = false): Promise<string> {
  const title = esc(model.title || "AltNet Site");
  const desc = esc(model.description || "") || "Статический экспорт сайта, созданного в AltNet Конструкторе.";
  const blocks = flattenBlockTree(model.blocks || []);
  const remoteMap = !restrictExternalMedia && blocks.some(b => b.type === "map" && b.props?.detailMap === true);
  for (const b of blocks) if (b.type === "map" && b.props) b.props.__allowMap = remoteMap;
  const remoteSound=!restrictExternalMedia && blocks.some(b=>b.type==="soundcloud" && !!soundSettings(b.props).track);
  for(const block of blocks) if(block.type==="soundcloud" && block.props) block.props.__allowSound=remoteSound;
  const frameSources=[...(remoteMap?["https://www.openstreetmap.org"]:[]),...(remoteSound?["https://w.soundcloud.com"]:[])];
  const renderArea = (slot: string) => {
    const part = model.blocks.find(block => block.type === "theme-" + slot);
    if (!part) return undefined;
    const cells = part.props?.layoutCells;
    return ensureRelOnLinks(renderBlocksToHtml(Array.isArray(cells) && Array.isArray(cells[0]) ? cells[0] : []));
  };
  const pageHeader = renderArea("header"), pageFooter = renderArea("footer");
  const popups=ensureRelOnLinks(renderBlocksToHtml(model.blocks.filter(block=>block.type==="site-popup")));
  const bodyRaw = renderBlocksToHtml(model.blocks.filter(block => block.type !== "theme-header" && block.type !== "theme-footer" && block.type!=="site-popup"));
  const body = ensureRelOnLinks(bodyRaw);
  const runtimeNeeded = remoteSound || remoteMap || blocks.some(block => block.type === "site-popup" || block.type === "loopgrid" || ((block.type === "image" || block.type === "grid") && block.props?.lightbox === true) || block.type === "accordion" || block.type === "share" || block.type === "carousel" || block.type === "mediacarousel" || block.type === "videoplaylist" || block.type === "slides" || block.type === "countdown" || block.type === "offcanvas" || (block.type === "counter" && block.props?.animate === true) || (block.type === "contentnav" && block.props?.spy));

  const hasAnimation = blocks.some(block => block.type === "lottie");
  const animationRuntime = hasAnimation ? await loadLottieRenderer() : "";
  const scriptHashes = [runtimeNeeded && SITE_RUNTIME_HASH, hasAnimation && LOTTIE_HASH].filter(Boolean).map(hash => "'sha256-" + hash + "'").join(" ");
  const CSP = [
    "default-src 'self'",
    scriptHashes ? "script-src " + scriptHashes : "script-src 'none'",
    "connect-src 'none'",
    restrictExternalMedia ? "img-src 'self' data:" : "img-src 'self' https: data: ipfs: altfs:",
    restrictExternalMedia ? "media-src 'self' data:" : "media-src 'self' https: data: ipfs: altfs:",
    "style-src 'self'",
    "font-src 'self'",
    "object-src 'none'",
    frameSources.length ? "frame-src "+frameSources.join(" ") : "frame-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");

  const header = pageHeader !== undefined ? `<header class="container" data-site-template="header">${pageHeader}</header>` :
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
<meta name="robots" content="${model.seo?.index === false ? "noindex" : "index"}, ${model.seo?.follow === false ? "nofollow" : "follow"}"/>
${model.seo?.canonical ? `<link rel="canonical" href="${esc(model.seo.canonical)}"/>` : ""}
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
  ${popups}
  ${pageFooter !== undefined ? `<footer class="container" data-site-template="footer">${pageFooter}</footer>` : `<footer>Сгенерировано в AltNet · ${new Date().toISOString()}</footer>`}
  ${runtimeNeeded ? `<script>${SITE_RUNTIME}</script>` : ""}
  ${animationRuntime ? `<script data-altnet-lottie>${animationRuntime}</script>` : ""}
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
 * Имена и очищенные изображения предоставляет проверенный адаптер транспорта.
 */
async function bundleImages(
  modelIn: SiteModel,
  zip: JSZip,
  onProgress?: (d: number, t: number) => void,
  imageLoader?: ExportOptions["imageLoader"]
): Promise<{ model: SiteModel; assets: string[] }> {
  const model = deepClone(modelIn);
  const assets: string[] = [];
  const totalCandidates = imageReferences(model.blocks);

  const total = totalCandidates.length;
  let done = 0;
  onProgress?.(done, total);

  // hash -> filename (для дедупликации)
  const byHash = new Map<string, string>();

  for (const { set, url } of totalCandidates) {
    try {
      if (!imageLoader) throw new Error("Защищённый маршрут загрузки не подключён");
      const { name, blob, hash } = await imageLoader(url);
      let filename = byHash.get(hash);
      if (!filename) {
        filename = name;                  // уже "img-<hash8>.<ext>"
        byHash.set(hash, filename);
        zip.file(`assets/${filename}`, blob);
        assets.push(`assets/${filename}`);
      }
      // Переписываем src блока на локальный файл
      set(`./assets/${filename}`);
    } catch {
      // Если не удалось скачать/перекодировать — ставим плейсхолдер (data:)
      set(placeholderDataUrl());
    } finally {
      done++;
      onProgress?.(done, total);
    }
  }

  return { model, assets };
}

function pickOgImage(model: SiteModel, assets: string[]): string {
  const explicit = sanitizeSocialImage(model.ogImage);
  if (explicit) return explicit;
  // 1) если есть подтянутые ассеты — берём первый файл в assets/
  const first = assets.find(a => /^assets\//.test(a));
  if (first) return `./${first}`;

  // 2) иначе — ищем первый image-блок с http(s)
  const img = (model.blocks || []).find(b => b.type === "image" && typeof b.props?.src === "string");
  const src = typeof img?.props?.src === "string" ? img.props.src : "";
  if (/^https?:\/\//i.test(src)) return src;

  // 3) запасной вариант
  return "./favicon.svg";
}

// -------- Публичный API --------
export async function exportSiteZip(modelIn: SiteModel, options?: ExportOptions): Promise<Blob> {
  const opts: ExportOptions = { bundleAssets: true, ...(options || {}) };
  const { default: Zip } = await import("jszip");
  const zip = new Zip();

  // 1) Санация URL на уровне модели + rel для внешних ссылок (не ломает, если serializeBlock это игнорит).
  const sanitized: SiteModel = {
    title: modelIn.title,
    description: modelIn.description,
    ogImage: sanitizeSocialImage(modelIn.ogImage),
    seo: sanitizeSeo(modelIn.seo),
    theme: modelIn.theme,
    blocks: mapBlockTree(modelIn.blocks || [], (b) => {
      const p = { ...(b.props || {}) };
      sanitizeImageProperties(b.type, p);
      sanitizeListProperties(b.type, p);

      if (b.type === "image" && typeof p.src === "string") {
        p.src = sanitizeImageUrl(p.src);
      }

      if (b.type === "button") {
        const href = sanitizeHref(typeof p.href === "string" ? p.href : "#");
        const open = p.linkOpen ?? (p.target === "_blank" ? "new" : p.target === "_self" ? "same" : "auto");
        const { target, rel } = buttonLinkOptions(href, open, p.linkIndexing);
        p.href = href;
        p.target = target;
        p.rel = rel;
      }
      if ((b.type === "heading" || b.type === "image") && typeof p.href === "string" && p.href.trim()) {
        const href = sanitizeHref(p.href);
        p.href = href;
        const { target, rel } = buttonLinkOptions(href, p.linkOpen, p.linkIndexing);
        p.target = target; p.rel = rel;
      }

      if (b.type === "hero") {
        const href = sanitizeHref(typeof p.ctaHref === "string" ? p.ctaHref : "#");
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
    const res = await bundleImages(sanitized, zip, opts.onProgress, opts.imageLoader);
    model = res.model;
    assets = res.assets;
  }

  const ogImage = pickOgImage(model, assets);
  const styleRules = prepareStyleRules(model);

  // 3) Файлы ZIP
  zip.file("favicon.svg", FAVICON_SVG);
  zip.file("index.html", await buildIndexHtml(model, ogImage, opts.restrictExternalMedia));
  zip.file("styles.css", buildStylesCss(model.theme, styleRules));
  zip.file("manifest.json", buildManifest(model, assets));
  const sitemap = buildSitemap(model.seo?.index === false ? [] : [model.seo?.canonical || ""]);
  if (sitemap) zip.file("sitemap.xml", sitemap);
  zip.folder("assets"); // если ассетов нет — просто пустая папка

  return await zip.generateAsync({ type: "blob" });
}

// Экспорт одним HTML-файлом; интерактивные компоненты используют только проверенный встроенный обработчик.
export async function exportSingleHtml(modelIn: SiteModel, options?: ExportOptions): Promise<Blob> {
  const opts: ExportOptions = { bundleAssets: true, ...(options || {}) };

  const sanitized: SiteModel = {
    title: modelIn.title,
    description: modelIn.description,
    ogImage: sanitizeSocialImage(modelIn.ogImage),
    seo: sanitizeSeo(modelIn.seo),
    theme: modelIn.theme,
    blocks: mapBlockTree(modelIn.blocks || [], (b) => {
      const p = { ...(b.props || {}) };
      sanitizeImageProperties(b.type, p);
      sanitizeListProperties(b.type, p);

      if (b.type === "image" && typeof p.src === "string") {
        p.src = sanitizeImageUrl(p.src);
      }
      if (b.type === "button") {
        const href = sanitizeHref(typeof p.href === "string" ? p.href : "#");
        const open = p.linkOpen ?? (p.target === "_blank" ? "new" : p.target === "_self" ? "same" : "auto");
        const { target, rel } = buttonLinkOptions(href, open, p.linkIndexing);
        p.href = href;
        p.target = target;
        p.rel = rel;
      }
      if ((b.type === "heading" || b.type === "image") && typeof p.href === "string" && p.href.trim()) {
        const href = sanitizeHref(p.href);
        p.href = href;
        const { target, rel } = buttonLinkOptions(href, p.linkOpen, p.linkIndexing);
        p.target = target; p.rel = rel;
      }
      if (b.type === "hero") {
        const href = sanitizeHref(typeof p.ctaHref === "string" ? p.ctaHref : "#");
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
    const images = imageReferences(model.blocks);
    const total = images.length;
    let done = 0;
    opts.onProgress?.(done, total);

    for (const { url: src, set } of images) {
          try {
            if (!opts.imageLoader) throw new Error("Защищённый маршрут загрузки не подключён");
            const { blob } = await opts.imageLoader(src);
            const dataUrl = await blobToDataUrl(blob);
            set(dataUrl);
          } catch {
            set(placeholderDataUrl());
          } finally {
            done++;
            opts.onProgress?.(done, total);
          }
    }
  }

  // Готовый index.html → single-file: inline CSS, data:-favicon, CSP без script
  const styleRules = prepareStyleRules(model);
  let html = await buildIndexHtml(model, model.ogImage || undefined, opts.restrictExternalMedia);
  html = html
    .replace(`<link rel="stylesheet" href="./styles.css"/>`, `<style>${buildStylesCss(model.theme, styleRules)}</style>`)
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

export function adaptFromSiteBuilderDoc(document: unknown): SiteModel {
  const builderDoc = asRecord(document);
  const rawBlocks = Array.isArray(builderDoc.blocks) ? builderDoc.blocks.map(asRecord) : [];

  const blocks: BlockInstance[] = rawBlocks.map((b): BlockInstance => {
    const id = typeof b?.id === "string" ? b.id : undefined;
    const t = String(b?.type || "").toLowerCase();
    const layoutCells = Array.isArray(b?.layoutCells)
      ? b.layoutCells.map((cell: unknown) => adaptFromSiteBuilderDoc({ blocks: Array.isArray(cell) ? cell.filter((child: unknown) => !asRecord(child).hidden) : [] }).blocks)
      : undefined;
    const layoutWeights = Array.isArray(b?.layoutPreset) ? b.layoutPreset : undefined;
    const layoutByBp = b?.layoutByBp && typeof b.layoutByBp === "object" ? b.layoutByBp : undefined;
    const layoutGap = typeof b?.layoutGap === "number" ? b.layoutGap : undefined;

    switch (t) {
      case "hero": {
        const href = sanitizeHref(String(b?.ctaLink ?? b?.ctaHref ?? "#"));
        const target = href.startsWith("http") ? "_blank" : "_self";
        const rel = externalLinkRels(href);
        const align = oneOf(b?.align, ["left", "center", "right"]) ? b.align : "left";
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
            align: oneOf(b?.align, ["left", "center", "right"]) ? b.align : "left",
          },
        };

      case "heading": {
        const level = oneOf(b?.level, ["h1", "h2", "h3", "h4", "h5", "h6", "div", "span", "p"]) ? b.level : "h2";
        const align = (oneOf(b?.align, ["left", "center", "right"]) ? b.align : "left") as "left" | "center" | "right";
        return {
          id,
          type: "heading",
          props: {
            text: String(b?.text ?? ""),
            level,
            align,
            href: typeof b?.href === "string" && b.href.trim() ? sanitizeHref(b.href) : "",
            linkOpen: oneOf(b?.linkOpen, ["same", "new"]) ? b.linkOpen : "auto",
            linkIndexing: oneOf(b?.linkIndexing, ["nofollow", "follow"]) ? b.linkIndexing : "auto",
          },
        };
      }

      case "p":
      case "text":
        return {
          id,
          type: "text",
          props: {
            text: String(b?.text ?? ""), richRuns:b.richRuns,
            align: oneOf(b?.align, ["left", "center", "right"]) ? b.align : "left",
          },
        };

      case "img":
      case "image":
        return {
          id,
          type: "image",
          props: {
            src: sanitizeImageUrl(b?.src ?? b?.cid ?? ""),
            alt: String(b?.alt ?? ""),
            caption: imageCaption(b), linkTo: b.linkTo, lightbox: b.linkTo === "media" && b.lightbox !== false,
            href: (!b.linkTo || b.linkTo === "custom") && typeof b?.href === "string" && b.href.trim() ? sanitizeHref(b.href) : "",
            linkOpen: b?.linkOpen,
            linkIndexing: b?.linkIndexing,
            imageStyleByBp: b?.imageStyleByBp,
          },
        };

      case "btn":
      case "button": {
        const href = sanitizeHref(String(b?.href ?? b?.ctaHref ?? "#"));
        const { target, rel } = buttonLinkOptions(href, b?.linkOpen, b?.linkIndexing);
        return {
          id,
          type: "button",
          props: {
            label: String(b?.label ?? b?.ctaText ?? "Кнопка"),
            href,
            target,
            rel,
            variant: oneOf(b?.variant, ["primary", "secondary", "ghost"]) ? b.variant : "primary",
            align: oneOf(b?.align, ["left", "center", "right"]) ? b.align : "center",
            buttonStyleByBp: b?.buttonStyleByBp,
            icon: buttonIconPath(b?.icon) ? b.icon : "",
            iconPosition: b?.iconPosition === "after" ? "after" : "before",
            accessibleLabel: typeof b?.accessibleLabel === "string" ? b.accessibleLabel.replace(/[^\x20-\x7e\u0080-\uffff]/g, "").trim().slice(0, 300) : "",
            linkOpen: oneOf(b?.linkOpen, ["same", "new"]) ? b.linkOpen : "auto",
            linkIndexing: oneOf(b?.linkIndexing, ["nofollow", "follow"]) ? b.linkIndexing : "auto",
          },
        };
      }

      case "cols2": {
        const ratio = oneOf(b?.ratio, ["5-7", "6-6", "7-5"]) ? b.ratio : "6-6";
        return {
          id,
          type: "cols2",
          props: {
            title: String(b?.title ?? ""),
            text: String(b?.text ?? ""),
            img: sanitizeImageUrl(b?.img ?? ""),
            alt: String(b?.alt ?? ""),
            ratio,
            reverse: Boolean(b?.reverse),
          },
        };
      }

      case "spacer": {
        const size = oneOf(b?.size, ["xs", "sm", "md", "lg", "xl"]) ? b.size : "md";
        return { id, type: "spacer", props: { size, heightByBp: b?.heightByBp } };
      }

      case "divider":
        return { id, type: "divider", props: { width: b?.width, thickness: b?.thickness, lineStyle: b?.lineStyle, align: b?.align, color: b?.color } };

      case "video":
        return { id, type: "video", props: { src: sanitizeUrl(typeof b?.src === "string" ? b.src : "", ""), poster: sanitizeImageUrl(b?.poster), loop: Boolean(b?.loop), muted: Boolean(b?.muted), controls: b?.controls !== false } };

      case "alert":
        return { id, type: "alert", props: { title: String(b?.title ?? ""), text: String(b?.text ?? ""), variant: b?.variant } };
      case "blockquote":
        return { id, type: "blockquote", props: { text: String(b?.text ?? ""), cite: String(b?.cite ?? "") } };
      case "progress":
        return { id, type: "progress", props: { label: String(b?.label ?? ""), value: b?.value } };
      case "counter":
        return { id, type: "counter", props: { prefix: String(b?.prefix ?? ""), value: b?.value, suffix: String(b?.suffix ?? ""), animate: b?.animate === true, start: b?.start, durationMs: b?.durationMs, decimals: b?.decimals } };
      case "iconlist":
        return { id, type: "iconlist", props: {
          variant: b?.variant, size: b?.size, gap: b?.gap, align: b?.align,
          items: recordList(b.items).map((item) => ({ label: String(item?.label ?? ""), description: String(item?.description ?? ""), icon: String(item?.icon ?? ""), href: typeof item?.href === "string" && item.href.trim() ? sanitizeHref(item.href) : "" })),
        } };
      case "anchor":
        return { id, type: "anchor", props: { name: String(b?.name ?? "") } };
      case "code":
        return { id, type: "code", props: { code: String(b?.code ?? ""), lang: String(b?.lang ?? "") } };
      case "cta":
        return { id, type: "cta", props: { title: String(b?.title ?? ""), text: String(b?.text ?? ""), btnLabel: String(b?.btnLabel ?? ""), btnHref: typeof b?.btnHref === "string" && b.btnHref.trim() ? sanitizeHref(b.btnHref) : "", variant: b?.variant, align: b?.align, emphasis: b?.emphasis } };
      case "toc":
        return { id, type: "toc", props: { items: recordList(b.items).map((item) => ({ label: String(item?.label ?? ""), href: typeof item?.href === "string" && item.href.trim().startsWith("#") ? sanitizeHref(item.href) : "#" })) } };
      case "breadcrumbs":
        return { id, type: "breadcrumbs", props: { separator: b?.separator, size: b?.size, ariaLabel: String(b?.ariaLabel ?? ""), items: recordList(b.items).map((item) => ({ label: String(item?.label ?? ""), href: typeof item?.href === "string" && item.href.trim() ? sanitizeHref(item.href) : "" })) } };

      case "section": {
        const align = oneOf(b?.align, ["left", "center", "right"]) ? b.align : "left";
        const theme = oneOf(b?.theme, ["auto", "light", "dark"]) ? b.theme : "auto";
        const pad = oneOf(b?.pad, ["sm", "md", "lg"]) ? b.pad : "md";
        const bg = oneOf(b?.bg, ["none", "subtle", "card", "accent"]) ? b.bg : "none";
        return {
          id,
          type: "section",
          props: {
            title: String(b?.title ?? ""),
            text: String(b?.text ?? ""),
            align, theme, pad, bg, layoutCells, layoutWeights, layoutByBp, layoutGap, flexByBp: b.flexByBp, layoutGapX: b.layoutGapX, layoutGapY: b.layoutGapY,
          },
        };
      }

      case "grid": {
        const cols = [1, 2, 3, 4].includes(Number(b?.cols)) ? (Number(b.cols) as 1 | 2 | 3 | 4) : 3;
        const gx = Number.isFinite(Number(b?.gapX)) ? Number(b.gapX) : 16;
        const gy = Number.isFinite(Number(b?.gapY)) ? Number(b.gapY) : 16;
        const itemsSrc = recordList(b.items);
        const items = itemsSrc.map((it) => ({
          src: sanitizeImageUrl(it?.src),
          alt: String(it?.alt ?? ""),
          caption: String(it?.caption ?? ""),
        }));
        return { id, type: "grid", props: { cols, gapX: gx, gapY: gy, items, layoutCells, layoutWeights, layoutColumns: b?.layoutColumns, layoutMerges: readGridMerges(b) || [], layoutByBp, layoutGap, layoutGapX: b?.layoutGapX, layoutGapY: b?.layoutGapY } };
      }

      case "gallery": {
        const cols = [2, 3, 4].includes(Number(b?.cols)) ? Number(b.cols) : 3;
        const items = recordList(b.items).map((it) => ({ src: sanitizeImageUrl(it?.src), alt: String(it?.alt ?? ""), caption: typeof it.caption === "string" ? it.caption : "" })).filter((item) => item.src);
        return { id, type: "grid", props: { cols, gapX: 12, gapY: 12, items, lightbox: b.lightbox === true } };
      }

      case "soundcloud": return {id,type:"soundcloud",props:soundSettings(b)};
      case "readmore": return {id,type:"readmore",props:{marker:moreFragment(id??"read-more")}};
      case "textpath": return {id,type:"textpath",props:{...textPathOptions(b),href:typeof b.href==="string" && b.href?sanitizeHref(b.href):""}};
      case "loopgrid": {
        if (b.loopError) return {id,type:"unknown",props:{raw:{type:"Loop Grid · "+String(b.loopError)}}};
        const cards=recordList(b.cards);
        return {id,type:"loopgrid",props:{...loopSettings(b),
          cards:cards.map(c=>({title:c.title,description:c.description,more:c.more,terms:c.terms,href:c.href,custom:Array.isArray(c.blocks)})),
          layoutCells:cards.map(c=>adaptFromSiteBuilderDoc({blocks:c.blocks}).blocks)}};
      }
      case "map":
        return { id, type: "map", props: mapSettings(b) };
      case "lottie": {
        if (typeof b.animationJson !== "string" || !b.animationJson) return { id, type: "unknown", props: { raw: b } };
        try { readAnimation(b.animationJson); } catch { return { id, type: "unknown", props: { raw: b } }; }
        return { id, type: "lottie", props: { ...lottieOptions(b), animationJson: b.animationJson, poster: sanitizeImageUrl(b.poster), caption: typeof b.caption === "string" ? b.caption : "" } };
      }
      case "container":
        return { id, type: "container", props: { width: b?.width, padding: b?.padding, bg: b?.bg, border: Boolean(b?.border), rounded: Boolean(b?.rounded), layoutCells, layoutWeights, layoutByBp, layoutGap, flexByBp: b.flexByBp, layoutGapX: b.layoutGapX, layoutGapY: b.layoutGapY } };
      case "menu":
        return { id, type: "menu", props: { orientation: b?.orientation, ariaLabel: String(b?.ariaLabel ?? ""), activeHref: String(b?.activeHref ?? ""), items: recordList(b.items) } };
      case "iconbox":
      case "imagebox": {
        const source = Array.isArray(b?.items) ? recordList(b.items) : [b];
        const items = source.map((item) => ({ title: String(item?.title ?? item?.label ?? ""), text: String(item?.text ?? item?.description ?? ""), icon: String(item?.icon ?? ""), src: sanitizeImageUrl(item?.src ?? item?.cid), alt: String(item?.alt ?? "") }));
        const columns = oneOf(b?.columns, [1, 2, 3, 4]) ? b.columns : Array.isArray(b?.items) ? 3 : 1;
        return { id, type: t, props: { items, columns } };
      }
      case "icon":
        return { id, type: "icon", props: { name: b?.name, size: b?.size, color: b?.color } };
      case "rating":
        return { id, type: "rating", props: { value: b?.value, max: b?.max, readonly: Boolean(b?.readonly) } };
      case "pricelist":
        return { id, type: "pricelist", props: { items: recordList(b.items).map((item) => ({ title: String(item?.title ?? ""), price: String(item?.price ?? ""), period: String(item?.period ?? ""), desc: String(item?.desc ?? ""), features: Array.isArray(item?.features) ? item.features.map(String) : [], ctaLabel: String(item?.ctaLabel ?? ""), ctaHref: typeof item?.ctaHref === "string" && item.ctaHref.trim() ? sanitizeHref(item.ctaHref) : "" })) } };
      case "pricetable":
        return { id, type: "pricetable", props: { plans: recordList(b.plans).map((plan) => ({ name: String(plan?.name ?? ""), price: String(plan?.price ?? ""), period: String(plan?.period ?? ""), popular: Boolean(plan?.popular), ctaLabel: String(plan?.ctaLabel ?? ""), ctaHref: typeof plan?.ctaHref === "string" && plan.ctaHref.trim() ? sanitizeHref(plan.ctaHref) : "", features: recordList(plan.features).map((feature) => ({ label: String(feature?.label ?? ""), included: Boolean(feature?.included) })) })) } };
      case "testimonials":
        return { id, type: "testimonials", props: { items: recordList(b.items).map((item) => ({ author: String(item?.author ?? ""), role: String(item?.role ?? ""), text: String(item?.text ?? item?.quote ?? ""), avatar: sanitizeImageUrl(item?.avatar) })) } };
      case "search":
        return { id, type: "search", props: { placeholder: String(b?.placeholder ?? ""), action: sanitizeSearchAction(b?.action), method: b?.method === "POST" ? "POST" : "GET" } };
      case "social":
        return { id, type: "social", props: { items: recordList(b.items).map((item) => ({ label: String(item?.label ?? ""), href: sanitizeSocialHref(item?.href) })) } };
      case "progresstracker":
        return { id, type: "progresstracker", props: { current: b?.current, steps: recordList(b.steps).map((step) => ({ label: String(step?.label ?? "") })) } };
      case "pagination":
        return { id, type: "pagination", props: { current: b?.current, total: b?.total, siblings: b?.siblings, boundary: b?.boundary, baseHref: b?.baseHref, size: b?.size, ariaLabel: String(b?.ariaLabel ?? "") } };
      case "sidebar":
        return { id, type: "sidebar", props: { title: String(b?.title ?? ""), width: b?.width, side: b?.side, items: recordList(b.items).map((item) => ({ label: String(item?.label ?? ""), href: typeof item?.href === "string" && item.href.trim() ? sanitizeHref(item.href) : "" })) } };
      case "tabs":
        return { id, type: "tabs", props: { tabs: recordList(b.tabs).map((tab) => ({ label: String(tab?.label ?? ""), content: String(tab?.content ?? ""), disabled: Boolean(tab?.disabled) })), active: b?.active, variant: b?.variant, size: b?.size, align: b?.align, orientation: b?.orientation } };
      case "accordion":
        return { id, type: "accordion", props: { items: recordList(b.items).map((item) => ({ title: String(item?.title ?? ""), content: String(item?.content ?? ""), open: Boolean(item?.open) })), allowMultiple: Boolean(b?.allowMultiple), allowToggle: b?.allowToggle !== false, variant: b?.variant, size: b?.size } };
      case "share":
        return { id, type: "share", props: { url: typeof b?.url === "string" && b.url.trim() && sanitizeHref(b.url) !== "#" ? sanitizeHref(b.url) : "", networks: Array.isArray(b?.networks) ? b.networks : [] } };
      case "contentnav":
        return { id, type: "contentnav", props: { orientation: b?.orientation, spy: Boolean(b?.spy), spyOffset: b?.spyOffset, activeHref: typeof b?.activeHref === "string" && b.activeHref.startsWith("#") ? sanitizeHref(b.activeHref) : "", ariaLabel: String(b?.ariaLabel ?? ""), items: recordList(b.items).map((item) => ({ label: String(item?.label ?? ""), href: typeof item?.href === "string" && item.href.trim().startsWith("#") ? sanitizeHref(item.href) : "#" })) } };
      case "html":
        return { id, type: "html", props: { html: String(b?.html ?? b?.content ?? "") } };
      case "carousel":
        return { id, type: "carousel", props: { initial: b?.initial, slides: recordList(b.slides).map((slide) => ({ src: sanitizeImageUrl(slide?.src), alt: String(slide?.alt ?? ""), caption: String(slide?.caption ?? "") })) } };
      case "mediacarousel":
        return { id, type: "mediacarousel", props: { initial: b?.initial, slides: (Array.isArray(b?.slides) ? b.slides : recordList(b.items)).map((slide) => { const kind = (slide?.kind ?? slide?.type) === "video" ? "video" : "img"; const src = slide?.src ?? slide?.cid ?? ""; return { kind, src: kind === "video" ? sanitizeVideoUrl(src) : sanitizeImageUrl(src), alt: String(slide?.alt ?? ""), caption: String(slide?.caption ?? "") }; }) } };
      case "hotspot":
        return { id, type: "hotspot", props: { src: sanitizeImageUrl(b?.src), alt: String(b?.alt ?? ""), markers: recordList(b.markers).map((marker) => ({ x: typeof marker?.x === "number" ? marker.x : 50, y: typeof marker?.y === "number" ? marker.y : 50, label: String(marker?.label ?? ""), href: typeof marker?.href === "string" && marker.href.trim() ? sanitizeHref(marker.href) : "" })) } };
      case "videoplaylist":
        return { id, type: "videoplaylist", props: { initial: b?.initial, items: recordList(b.items).map((item) => ({ src: sanitizeVideoUrl(item?.src), poster: sanitizeImageUrl(item?.poster), title: String(item?.title ?? "") })) } };
      case "countdown":
        return { id, type: "countdown", props: { target: typeof b?.target === "string" ? b.target : "" } };
      case "slides":
        return { id, type: "slides", props: { initial: b?.initial, slides: recordList(b.slides).map((slide) => ({ title: String(slide?.title ?? ""), text: String(slide?.text ?? ""), ctaLabel: String(slide?.ctaLabel ?? ""), ctaHref: typeof slide?.ctaHref === "string" && slide.ctaHref.trim() ? sanitizeHref(slide.ctaHref) : "" })) } };
      case "offcanvas":
        return { id, type: "offcanvas", props: { title: String(b?.title ?? ""), body: String(b?.body ?? ""), side: b?.side, width: b?.width, layoutCells, layoutWeights } };

      default:
        // Фейл-сейф: пусть отрендерится диагностический блок, но не ломаем экспорт
        return { id, type: "unknown", props: { raw: b } };
    }
  });

  blocks.forEach((block, index) => {
    const source = rawBlocks[index];
    block.props = { ...(block.props || {}), __builder: { style: source?.style, styleByBp: source?.styleByBp, className: source?.className, anchorId: source?.anchorId, anchor: source?.anchor, hideOn: source?.hideOn } };
  });

  for(const popup of recordList(builderDoc.popups)){
    if(typeof popup.id!=="string" || !/^popup-[a-z0-9_-]+$/i.test(popup.id))continue;
    blocks.push({type:"site-popup",props:{id:popup.id,title:typeof popup.title==="string"?popup.title:"",options:popupSettings(popup.options),
      layoutCells:[adaptFromSiteBuilderDoc({blocks:popup.blocks}).blocks]}});
  }
  const areas = asRecord(builderDoc.themeAreas);
  for (const kind of ["header","footer"] as const) {
    const content = areas[kind];
    if (Array.isArray(content)) blocks.push({type:"theme-" + kind,props:{layoutCells:[adaptFromSiteBuilderDoc({blocks:content}).blocks]}});
  }
  const seo = asRecord(builderDoc.seo), theme = asRecord(builderDoc.theme);
  return {
    title: String(builderDoc?.title ?? "Мой сайт"),
    description: String(builderDoc?.description ?? ""),
    ogImage: typeof builderDoc?.ogImage === "string" ? builderDoc.ogImage : "",
    seo: {
      canonical: typeof seo.canonical === "string" ? seo.canonical : "",
      index: seo.index !== false,
      follow: seo.follow !== false,
    },
    theme: {
      accent: typeof theme.accent === "string" ? theme.accent : undefined,
      container: Number.isFinite(theme.container) ? Number(theme.container) : undefined,
    },
    blocks,
  };
}
