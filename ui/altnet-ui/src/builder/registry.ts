import {popupSettings} from "../screens/SiteBuilder/popup";
import {inlineMarkup} from "../screens/SiteBuilder/inlineText";
import {soundSettings} from "../screens/SiteBuilder/soundCloud";
import {textPathOptions} from "../screens/SiteBuilder/textPath";
import { loopSettings } from "../screens/SiteBuilder/dynamicContent";
import { mapSettings, mapUrls, overviewSvg } from "../screens/SiteBuilder/blocks/map/geometry";
import { animationMarkup } from "./lottieRenderer";
import { asRecord, oneOf, recordList } from "../core/records";
// ui/altnet-ui/src/builder/registry.ts
// Единый реестр блоков конструктора.
// Версия без JSX — рендер через React.createElement, чтобы файл оставался .ts.

import React from "react";
import { safeAnchorName } from "../screens/SiteBuilder/blocks/anchor/name";
import { paginationHref, paginationState } from "../screens/SiteBuilder/blocks/pagination/model";
import { sanitizeSafeHtml } from "../screens/SiteBuilder/blocks/html/sanitize";
import { buttonIconPath } from "../screens/SiteBuilder/buttonIcons";
import { buttonLinkOptions, sanitizeHref } from "./cdr";

export type BlockSpec = {
  id: string; // машинное имя (type)
  name: string; // человекочитаемое
  defaults: Record<string, unknown>;
  render: (args: { props: Record<string, unknown> }) => React.ReactNode; // без JSX/FC
  serialize: (props: Record<string, unknown>) => string;
};

// Утилиты
const esc = (s: unknown = "") =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const nl2br = (s: unknown = "") => esc(s).replace(/\n/g, "<br/>");

// Nested layout children use the same escaping and block serializers as the page root.
function serializeLayout(cells: unknown, weights: unknown, layoutClass?: unknown): string {
  if (!Array.isArray(cells)) return "";
  const values = Array.isArray(weights) ? weights : [];
  const cls = typeof layoutClass === "string" && /^sb-layout-\d+$/.test(layoutClass) ? ` ${layoutClass}` : "";
  return `<div class="layout-row${cls}">${cells.map((cell, index) => {
    const value = Number(values[index]);
    const weight = Number.isInteger(value) && value >= 1 && value <= 16 ? value : 1;
    const content = Array.isArray(cell) ? cell.map(child => {
      try { return serializeBlock(String(child?.type || ""), child?.props || {}); }
      catch { return `<p class="muted">[Неизвестный блок: ${esc(String(child?.type || ""))}]</p>`; }
    }).join("\n") : "";
    return `<div class="layout-cell layout-w-${weight}">${content}</div>`;
  }).join("")}</div>`;
}

// ---------- Определения блоков ----------

const Hero: BlockSpec = {
  id: "hero",
  name: "Hero",
  defaults: {
    title: "Добро пожаловать в AltNet",
    subtitle:
      "Свобода общения. Приватность по умолчанию. Сообщество важнее алгоритмов.",
    ctaLabel: "Узнать больше",
    ctaHref: "#learn",
  },
  render: ({ props }) => {
    const p = { ...Hero.defaults, ...props };
    return React.createElement(
      "section",
      { className: "section" },
      React.createElement(
        "div",
        { className: "card" },
        React.createElement("h1", null, String(p.title ?? "")),
        React.createElement("p", { className: "muted" }, String(p.subtitle ?? "")),
        React.createElement(
          "div",
          { className: "mt-16" },
          React.createElement(
            "a",
            {
              className: "btn",
              href: p.ctaHref,
              rel: p.ctaRel,
              target: p.ctaTarget,
            },
            String(p.ctaLabel ?? "")
          )
        )
      )
    );
  },
  serialize: (props) => {
    const p = { ...Hero.defaults, ...props };
    return `
<section class="section hero">
  <h1>${esc(p.title)}</h1>
  <p>${esc(p.subtitle)}</p>
  ${p.ctaLabel ? `<div class="mt-16">
    <a class="btn" href="${esc(p.ctaHref)}"${p.ctaRel ? ` rel="${esc(p.ctaRel)}"` : ""}${p.ctaTarget ? ` target="${esc(p.ctaTarget)}"` : ""}>${esc(p.ctaLabel)}</a>
  </div>` : ""}
</section>`.trim();
  },
};

const H1: BlockSpec = {
  id: "h1",
  name: "Заголовок H1",
  defaults: { text: "Заголовок раздела", align: "left" },
  render: ({ props }) => {
    const p = { ...H1.defaults, ...props };
    return React.createElement(
      "section",
      { className: `section t-${p.align || "left"}` },
      React.createElement("h1", null, String(p.text ?? ""))
    );
  },
  serialize: (props) => {
    const p = { ...H1.defaults, ...props };
    const cls = `section t-${p.align || "left"}`;
    return `<section class="${cls}"><h1>${esc(p.text)}</h1></section>`;
  },
};

// === Заголовок с безопасным выбором семантического тега
const Heading: BlockSpec = {
  id: "heading",
  name: "Заголовок",
  defaults: {
    text: "Заголовок секции",
    level: "h2",
    align: "left" as "left" | "center" | "right",
  },
  render: ({ props }) => {
    const p = { ...Heading.defaults, ...(props || {}) };
    const lvl = oneOf(p.level, ["h1", "h2", "h3", "h4", "h5", "h6", "div", "span", "p"]) ? p.level : "h2";
    const Tag = lvl;
    return React.createElement(
      "section",
      { className: `section t-${p.align || "left"}` },
      React.createElement(Tag, null, typeof p.href === "string" && p.href.trim() ? React.createElement("a", { href: sanitizeHref(p.href) }, String(p.text || "")) : String(p.text || ""))
    );
  },
  serialize: (props) => {
    const p = { ...Heading.defaults, ...(props || {}) };
    const lvl = oneOf(p.level, ["h1", "h2", "h3", "h4", "h5", "h6", "div", "span", "p"]) ? p.level : "h2";
    const align = p.align || "left";
    const href = typeof p.href === "string" && p.href.trim() ? sanitizeHref(p.href) : "";
    const open = p.linkOpen ?? (p.target === "_blank" ? "new" : p.target === "_self" ? "same" : "auto");
    const { target, rel } = buttonLinkOptions(href, open, p.linkIndexing);
    const text = esc(String(p.text || ""));
    const contents = href ? `<a href="${esc(href)}" target="${target}"${rel ? ` rel="${rel}"` : ""}>${text}</a>` : text;
    return `<section class="section t-${esc(align)}"><${lvl}>${contents}</${lvl}></section>`;
  },
};

const Text: BlockSpec = {
  id: "text",
  name: "Текст",
  defaults: { text: "Здесь может быть ваш текст.\nМного текста.", align: "left" },
  render: ({ props }) => {
    const p = { ...Text.defaults, ...props };
    return React.createElement(
      "section",
      { className: `section t-${p.align || "left"}` },
      React.createElement("p", null, String(p.text ?? ""))
    );
  },
  serialize: (props) => {
    const p = { ...Text.defaults, ...props };
    const cls = `section t-${p.align || "left"}`;
    return `<section class="${cls}"><p>${inlineMarkup(String(p.text??""),p.richRuns,esc)}</p></section>`;
  },
};

const Image: BlockSpec = {
  id: "image",
  name: "Картинка",
  defaults: {
    src: "https://placehold.co/960x540/png",
    alt: "Изображение",
  },
  render: ({ props }) => {
    const p = { ...Image.defaults, ...props };
    return React.createElement(
      "section",
      { className: "section" },
      React.createElement("img", {
        className: "responsive",
        loading: "lazy",
        src: p.src,
        alt: p.alt,
      })
    );
  },
  serialize: (props) => {
    const p = { ...Image.defaults, ...props };
    const cls = typeof p.__imageClass === "string" && /^sb-image-\d+$/.test(p.__imageClass) ? ` ${p.__imageClass}` : "";
    const image = `<img class="responsive${cls}" src="${esc(p.src)}" alt="${esc(p.alt)}" loading="lazy" decoding="async" referrerpolicy="no-referrer"/>`;
    const href = p.linkTo === "media" ? p.src : p.href;
    const link = p.lightbox === true && p.src ? lightboxTrigger(image, p.alt) : href ? `<a class="sb-image-link" href="${esc(String(href))}"${p.linkTo === "media" && String(href).startsWith("data:image/") ? ' download="image"' : ""}${p.target ? ` target="${esc(String(p.target))}"` : ""}${p.rel ? ` rel="${esc(String(p.rel))}"` : ""}>${image}</a>` : image;
    const captionClass = typeof p.__imageCaptionClass === "string" && /^sb-image-caption-\d+$/.test(p.__imageCaptionClass) ? ` class="${p.__imageCaptionClass}"` : "";
    const content = p.caption ? `<figure class="sb-image-figure">${link}<figcaption${captionClass}>${esc(String(p.caption))}</figcaption></figure>` : link;
    const wrap = typeof p.__imageWrapClass === "string" && /^sb-image-wrap-\d+$/.test(p.__imageWrapClass) ? `<div class="${p.__imageWrapClass}">${content}</div>` : content;
    return `<section class="section">${wrap}</section>`;
  },
};

const Video: BlockSpec = {
  id: "video",
  name: "Видео (HTML5)",
  defaults: {
    src: "",
    poster: "",
    loop: false,
    muted: false,
    controls: true,
  },
  render: ({ props }) => {
    const p = { ...Video.defaults, ...(props || {}) };
    return React.createElement(
      "section",
      { className: "section" },
      React.createElement("video", {
        className: "responsive",
        src: String(p.src || ""),
        poster: String(p.poster || ""),
        controls: !!p.controls,
        loop: !!p.loop,
        muted: !!p.muted,
        playsInline: true,
        preload: "metadata",
      })
    );
  },
  serialize: (props) => {
    const p = { ...Video.defaults, ...(props || {}) };
    const src = esc(String(p.src || ""));
    const poster = String(p.poster || "").trim();

    const attrs = [
      `src="${src}"`,
      `class="responsive"`,
      p.controls ? `controls` : "",
      `preload="none"`,
      `playsinline`,
      p.loop ? `loop` : "",
      p.muted ? `muted` : "",
      poster ? `poster="${esc(poster)}"` : "",
    ]
      .filter(Boolean)
      .join(" ");

    return `<section class="section"><video ${attrs}></video></section>`;
  },
};


const Button: BlockSpec = {
  id: "button",
  name: "Кнопка",
  defaults: { label: "Кнопка", href: "#", variant: "primary", align: "center" },
  render: ({ props }) => {
    const p = { ...Button.defaults, ...props };
    const clsBtn = p.variant === "secondary" ? "btn secondary" : p.variant === "ghost" ? "btn ghost" : "btn";
    const clsSec = `section t-${p.align || "center"}`;
    return React.createElement(
      "section",
      { className: clsSec },
      React.createElement(
        "a",
        { className: clsBtn, href: p.href, rel: p.rel, target: p.target },
        String(p.label)
      )
    );
  },
  serialize: (props) => {
    const p = { ...Button.defaults, ...props };
    const iconPath = buttonIconPath(p.icon);
    const clsBtn = (p.variant === "secondary" ? "btn secondary" : p.variant === "ghost" ? "btn ghost" : "btn") + (iconPath ? " btn-icon" : "");
    const clsSec = `section t-${p.align || "center"}`;
    const buttonClass = typeof p.__buttonClass === "string" && /^sb-button-\d+$/.test(p.__buttonClass) ? ` ${p.__buttonClass}` : "";
    const icon = iconPath ? `<svg class="sb-button-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${iconPath}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>` : "";
    const label = esc(String(p.label));
    const aria = typeof p.accessibleLabel === "string" ? p.accessibleLabel.replace(/[^\x20-\x7e\u0080-\uffff]/g, "").trim().slice(0, 300) : "";
    return `<section class="${clsSec}"><a class="${clsBtn}${buttonClass}" href="${esc(p.href)}"${p.rel ? ` rel="${esc(p.rel)}"` : ""}${p.target ? ` target="${esc(p.target)}"` : ""}${aria ? ` aria-label="${esc(aria)}"` : ""}>${p.iconPosition === "after" ? label + icon : icon + label}</a></section>`;
  },
};


const Cols2: BlockSpec = {
  id: "cols2",
  name: "Две колонки (текст + картинка)",
  defaults: {
    title: "Заголовок секции",
    text: "Описание секции. Короткий абзац текста.",
    img: "https://placehold.co/640x360/png",
    alt: "Иллюстрация",
    ratio: "6-6",         // варианты: "5-7" | "6-6" | "7-5"
    reverse: false        // менять порядок (картинка слева/справа)
  },
  render: ({ props }) => {
    const p = { ...Cols2.defaults, ...props };
    const [l, r] = String(p.ratio || "6-6").split("-");
    // порядок колонок
    const left = React.createElement("div", { className: `col c-xs-12 c-md-${l}` },
      React.createElement("h2", null, String(p.title ?? "")),
      React.createElement("p", null, String(p.text ?? ""))
    );
    const right = React.createElement("div", { className: `col c-xs-12 c-md-${r}` },
      React.createElement("img", { className: "responsive", loading: "lazy", src: p.img, alt: p.alt })
    );
    return React.createElement(
      "section",
      { className: "section" },
      React.createElement("div", { className: "row" }, p.reverse ? [right, left] : [left, right])
    );
  },
  serialize: (props) => {
    const p = { ...Cols2.defaults, ...props };
    const [l, r] = String(p.ratio || "6-6").split("-");
    const textCol = `
<div class="col c-xs-12 c-md-${l} ${p.reverse ? "order-2" : "order-1"}">
  <h2>${esc(p.title)}</h2>
  <p>${esc(p.text)}</p>
</div>`.trim();
    const imageCol = `
<div class="col c-xs-12 c-md-${r} ${p.reverse ? "order-1" : "order-2"}">
  <img class="responsive" src="${esc(p.img)}" alt="${esc(p.alt)}"/>
</div>`.trim();
    return `<section class="section"><div class="row">${textCol}${imageCol}</div></section>`;
  }
};

// === Spacer (пустой отступ)
const Spacer: BlockSpec = {
  id: "spacer",
  name: "Пустой отступ",
  defaults: { size: "md" as "xs" | "sm" | "md" | "lg" | "xl" },
  render: ({ props }) => {
    const p = { ...Spacer.defaults, ...props };
    return React.createElement("div", { className: `spacer spacer-${p.size || "md"}` });
  },
  serialize: (props) => {
    const p = { ...Spacer.defaults, ...props };
    const cls = typeof p.__spacerClass === "string" && /^sb-spacer-\d+$/.test(p.__spacerClass) ? ` ${p.__spacerClass}` : "";
    return `<div class="spacer spacer-${esc(p.size || "md")}${cls}" aria-hidden="true"></div>`;
  },
};

// === Divider (тонкая линия)
const Divider: BlockSpec = {
  id: "divider",
  name: "Разделитель",
  defaults: {},
  render: () => React.createElement("hr", { className: "divider" }),
  serialize: p => `<hr class="divider${typeof p.__dividerClass === "string" && /^sb-divider-\d+$/.test(p.__dividerClass) ? ` ${p.__dividerClass}` : ""}"/>`,
};

// === Section (полоса с фоном/отступами/темой/выравниванием)
const Section: BlockSpec = {
  id: "section",
  name: "Секция",
  defaults: {
    title: "",
    text: "",
    align: "left" as "left" | "center" | "right",
    theme: "auto" as "auto" | "light" | "dark",
    pad: "md" as "sm" | "md" | "lg",
    bg: "none" as "none" | "subtle" | "card" | "accent",
  },
  render: ({ props }) => {
    const p = { ...Section.defaults, ...(props || {}) };
    // Оборачиваем в section.section-band + модификаторы
    const cls = [
      "section-band",
      `t-${p.align}`,
      `pad-${p.pad}`,
      `theme-${p.theme}`,
      `bg-${p.bg}`,
    ].join(" ");
    return React.createElement(
      "section",
      { className: cls },
      // Небольшая универсальная разметка: опц. заголовок + текст
      p.title ? React.createElement("h2", null, String(p.title)) : null,
      p.text ? React.createElement("p", { className: "muted" }, String(p.text)) : null
    );
  },
  serialize: (props) => {
    const p = { ...Section.defaults, ...(props || {}) };
    const cls = `section-band t-${esc(p.align)} pad-${esc(p.pad)} theme-${esc(p.theme)} bg-${esc(p.bg)}`;
    const title = p.title ? `<h2>${esc(String(p.title))}</h2>` : "";
    const text = p.text ? `<p class="muted">${esc(String(p.text))}</p>` : "";
    return `<section class="${cls}">${title}${text}${serializeLayout(p.layoutCells, p.layoutWeights, p.__layoutClass)}</section>`;
  },
};

// === Grid 1–4 (галерея карточек)
function lightboxTrigger(image: string, alt: unknown): string {
  const name = typeof alt === "string" && alt.trim() ? "Увеличить изображение «" + alt + "»" : "Увеличить изображение";
  return `<button type="button" class="sb-image-link sb-lightbox-trigger" data-lightbox-open aria-haspopup="dialog" aria-label="${esc(name)}">${image}</button>`;
}

const Grid: BlockSpec = {
  id: "grid",
  name: "Сетка 1–4",
  defaults: {
    cols: 3 as 1 | 2 | 3 | 4,
    gapX: 16,
    gapY: 16,
    items: [] as Array<{ src: string; alt?: string; caption?: string }>,
  },
  render: ({ props }) => {
    const p = { ...Grid.defaults, ...(props || {}) };
    const cols = oneOf(p.cols, [1, 2, 3, 4]) ? p.cols : 3;
    const wrapCls = `grid-wrap gc-${cols}`;

    const children = recordList(p.items).map((it, i) =>
      React.createElement(
        "figure",
        { key: i, className: "grid-card" },
        React.createElement("img", {
          src: it?.src || "",
          alt: String(it?.alt || ""),
        }),
        it?.caption
          ? React.createElement("figcaption", { className: "body" }, String(it.caption))
          : null
      )
    );
    const style = { "--gx": `${Number(p.gapX ?? 16)}px`, "--gy": `${Number(p.gapY ?? 16)}px` };
    return React.createElement("section", { className: "section" },
      React.createElement("div", { className: wrapCls, style }, ...children)
    );
  },
  serialize: (props) => {
    const p = { ...Grid.defaults, ...(props || {}) };
    const cols = oneOf(p.cols, [1, 2, 3, 4]) ? p.cols : 3;
    const gridClass = typeof p.__gridClass === "string" && /^sb-grid-\d+$/.test(p.__gridClass) ? p.__gridClass : "";
    const wrapCls = `grid-wrap gc-${cols}${gridClass ? ` ${gridClass}` : ""}`;

    const items = recordList(p.items).map((it) => {
      const src = esc(String(it?.src || ""));
      const alt = esc(String(it?.alt || ""));
      const caption = it?.caption ? `<figcaption class="body">${esc(String(it.caption))}</figcaption>` : "";

      const image = `<img src="${src}" alt="${alt}" loading="lazy" decoding="async" referrerpolicy="no-referrer"/>`;
      return `<figure class="grid-card">${p.lightbox === true && src ? lightboxTrigger(image, it.alt) : image}${caption}</figure>`;
    }).join("");
    return `<section class="section">${items ? `<div class="${wrapCls}"${p.lightbox === true ? " data-lightbox-group" : ""}>${items}</div>` : ""}${serializeLayout(p.layoutCells, p.layoutWeights, p.__layoutClass)}</section>`;
  },
};

const Alert: BlockSpec = {
  id: "alert", name: "Уведомление", defaults: {},
  render: ({ props }) => React.createElement("aside", null, String(props.title ?? ""), String(props.text ?? "")),
  serialize: p => {
    const variant = oneOf(p.variant, ["info", "success", "warning", "danger"]) ? p.variant : "info";
    return `<aside class="notice notice-${variant}">${p.title ? `<strong>${esc(String(p.title))}</strong>` : ""}${p.text ? `<p>${nl2br(String(p.text))}</p>` : ""}</aside>`;
  },
};
const Blockquote: BlockSpec = {
  id: "blockquote", name: "Цитата", defaults: {},
  render: ({ props }) => React.createElement("blockquote", null, String(props.text ?? "")),
  serialize: p => `<blockquote class="quote"><p>${nl2br(String(p.text || ""))}</p>${p.cite ? `<cite>${esc(String(p.cite))}</cite>` : ""}</blockquote>`,
};
const Progress: BlockSpec = {
  id: "progress", name: "Прогресс", defaults: {},
  render: ({ props }) => React.createElement("progress", { value: props.value, max: 100 }),
  serialize: p => {
    const number = Number(p.value);
    const value = Number.isFinite(number) ? Math.max(0, Math.min(100, number)) : 0;
    return `<div class="progress-block">${p.label ? `<label>${esc(String(p.label))} <progress max="100" value="${value}">${value}%</progress></label>` : `<progress aria-label="Прогресс" max="100" value="${value}">${value}%</progress>`}</div>`;
  },
};
const Counter: BlockSpec = {
  id: "counter", name: "Счётчик", defaults: {},
  render: ({ props }) => React.createElement("span", null, String(props.value ?? "")),
  serialize: p => {
    const target = Number.isFinite(Number(p.value)) ? Number(p.value) : 0;
    const prefix = esc(String(p.prefix || "")), suffix = esc(String(p.suffix || ""));
    const start = Number.isFinite(Number(p.start)) ? Number(p.start) : 0;
    if (p.animate !== true || Math.abs(target) > 1e12 || Math.abs(start) > 1e12) return `<div class="counter">${prefix}${target}${suffix}</div>`;
    const duration = Number.isFinite(Number(p.durationMs)) ? Math.max(200, Math.min(10000, Number(p.durationMs))) : 2000;
    const decimals = Number.isInteger(Number(p.decimals)) ? Math.max(0, Math.min(3, Number(p.decimals))) : 0;
    const formatted = target.toFixed(decimals);
    return `<div class="counter" data-counter data-start="${start}" data-target="${target}" data-duration="${duration}" data-decimals="${decimals}" role="img" aria-label="${prefix}${formatted}${suffix}"><span aria-hidden="true">${prefix}<span data-counter-value>${formatted}</span>${suffix}</span></div>`;
  },
};
const IconList: BlockSpec = {
  id: "iconlist", name: "Список", defaults: {},
  render: ({ props }) => React.createElement("ul", null, recordList(props.items).map((item, i: number) => React.createElement("li", { key: i }, String(item.label ?? "")))),
  serialize: p => {
    const size = oneOf(p.size, ["sm", "md", "lg"]) ? p.size : "md";
    const gap = oneOf(p.gap, ["sm", "md", "lg"]) ? p.gap : "md";
    const align = oneOf(p.align, ["start", "center", "end"]) ? p.align : "start";
    const variant = oneOf(p.variant, ["dot", "check", "star", "custom"]) ? p.variant : "dot";
    const items = recordList(p.items).map((item) => {
      const marker = variant === "check" ? "✓" : variant === "star" ? "★" : variant === "custom" ? String(item.icon || "•").slice(0, 2) : "•";
      const text = `<span><span>${esc(String(item.label || ""))}</span>${item.description ? `<small>${esc(String(item.description))}</small>` : ""}</span>`;
      return `<li><span aria-hidden="true" class="icon-list-marker">${esc(marker)}</span>${item.href ? `<a href="${esc(String(item.href))}">${text}</a>` : text}</li>`;
    }).join("");
    return `<ul class="icon-list icon-list-${size} icon-list-gap-${gap} icon-list-align-${align}">${items}</ul>`;
  },
};
const Anchor: BlockSpec = {
  id: "anchor", name: "Якорь", defaults: {},
  render: ({ props }) => React.createElement("div", { id: safeAnchorName(props.name) }),
  serialize: p => `<span id="${safeAnchorName(p.name)}" class="anchor-target"></span>`,
};
const Code: BlockSpec = {
  id: "code", name: "Код", defaults: {},
  render: ({ props }) => React.createElement("pre", null, React.createElement("code", null, String(props.code ?? ""))),
  serialize: p => {
    const language = typeof p.lang === "string" && /^[a-z0-9_+.-]{1,40}$/i.test(p.lang) ? p.lang : "";
    return `<pre class="code-block"><code${language ? ` class="language-${esc(language)}"` : ""}>${esc(String(p.code || ""))}</code></pre>`;
  },
};
const Cta: BlockSpec = {
  id: "cta", name: "Призыв", defaults: {},
  render: ({ props }) => React.createElement("section", null, String(props.title ?? ""), String(props.text ?? "")),
  serialize: p => {
    const variant = oneOf(p.variant, ["primary", "secondary", "outline", "ghost"]) ? p.variant : "primary";
    const align = oneOf(p.align, ["start", "center", "end"]) ? p.align : "start";
    const emphasis = oneOf(p.emphasis, ["none", "panel", "brand"]) ? p.emphasis : "panel";
    const button = p.btnLabel && p.btnHref ? `<a class="btn cta-button-${variant}" href="${esc(String(p.btnHref))}">${esc(String(p.btnLabel))}</a>` : "";
    return `<section class="cta cta-${align} cta-${emphasis}">${p.title ? `<h3>${esc(String(p.title))}</h3>` : ""}${p.text ? `<p>${nl2br(String(p.text))}</p>` : ""}${button}</section>`;
  },
};
const Toc: BlockSpec = {
  id: "toc", name: "Содержание", defaults: {},
  render: ({ props }) => React.createElement("nav", null, recordList(props.items).map((item, i: number) => React.createElement("a", { key: i, href: item.href }, String(item.label ?? "")))),
  serialize: p => `<nav class="toc" aria-label="Содержание"><ol>${recordList(p.items).map((item) => `<li><a href="${esc(String(item.href || "#"))}">${esc(String(item.label || ""))}</a></li>`).join("")}</ol></nav>`,
};
const Breadcrumbs: BlockSpec = {
  id: "breadcrumbs", name: "Навигационная цепочка", defaults: {},
  render: ({ props }) => React.createElement("nav", null, String(props.ariaLabel || "Навигация")),
  serialize: p => {
    const items = recordList(p.items);
    const separator = oneOf(p.separator, ["/", "›", "»"]) ? p.separator : "›";
    const size = oneOf(p.size, ["sm", "md", "lg"]) ? p.size : "sm";
    const result = items.map((item, index: number) => {
      const last = index === items.length - 1;
      const label = esc(String(item.label || ""));
      const body = !last && item.href ? `<a href="${esc(String(item.href))}">${label}</a>` : `<span${last ? ' aria-current="page"' : ""}>${label}</span>`;
      return `<li>${body}${last ? "" : `<span aria-hidden="true" class="crumb-separator">${separator}</span>`}</li>`;
    }).join("");
    return `<nav aria-label="${esc(String(p.ariaLabel || "Навигационная цепочка"))}"><ol class="breadcrumbs breadcrumbs-${size}">${result}</ol></nav>`;
  },
};
const Container: BlockSpec = {
  id: "container", name: "Контейнер", defaults: {},
  render: () => React.createElement("section", null),
  serialize: p => {
    const width = oneOf(p.width, ["sm", "md", "lg", "xl", "full"]) ? p.width : "md";
    const padding = oneOf(p.padding, ["none", "sm", "md", "lg"]) ? p.padding : "md";
    const bg = oneOf(p.bg, ["none", "panel", "brand"]) ? p.bg : "none";
    const cls = `sb-container sb-container-${width} sb-container-pad-${padding} sb-container-bg-${bg}${p.border ? " sb-container-border" : ""}${p.rounded ? " sb-container-rounded" : ""}`;
    return `<section class="${cls}">${serializeLayout(p.layoutCells, p.layoutWeights, p.__layoutClass)}</section>`;
  },
};
const Menu: BlockSpec = {
  id: "menu", name: "Меню", defaults: {},
  render: ({ props }) => React.createElement("nav", null, String(props.ariaLabel || "Меню")),
  serialize: p => {
    const active = String(p.activeHref || "");
    const renderItems = (items: unknown[], nested: boolean): string => `<ul class="${nested ? "site-menu-children" : `site-menu site-menu-${p.orientation === "vertical" ? "vertical" : "horizontal"}`}">${recordList(items).map(item => {
      const href = String(item.href || "#");
      const sub = Array.isArray(item.children) && item.children.length ? renderItems(item.children, true) : "";
      return `<li><a href="${esc(href)}"${active && href === active ? ' aria-current="page"' : ""}>${esc(String(item.label || ""))}</a>${sub}</li>`;
    }).join("")}</ul>`;
    return `<nav aria-label="${esc(String(p.ariaLabel || "Меню"))}">${renderItems(recordList(p.items), false)}</nav>`;
  },
};
function serializeCards(p: Record<string, unknown>, image: boolean): string {
  const columns = oneOf(p.columns, [1, 2, 3, 4]) ? p.columns : 1;
  const icons: Record<string, string> = { star: "★", check: "✓", heart: "♥", shield: "⬡", alert: "!" };
  const items = recordList(p.items).map((item) => {
    const visual = image ? (item.src ? `<img src="${esc(String(item.src))}" alt="${esc(String(item.alt || ""))}" loading="lazy" referrerpolicy="no-referrer"/>` : "")
      : `<span class="site-card-icon" aria-hidden="true">${esc(icons[String(item.icon)] || String(item.icon || "•").slice(0, 2))}</span>`;
    return `<article class="site-card">${visual}<div class="site-card-content">${item.title ? `<h3>${esc(String(item.title))}</h3>` : ""}${item.text ? `<p>${nl2br(String(item.text))}</p>` : ""}</div></article>`;
  }).join("");
  return `<div class="site-cards site-cards-${columns}">${items}</div>`;
}
const IconBox: BlockSpec = { id: "iconbox", name: "Карточка с иконкой", defaults: {}, render: () => null, serialize: p => serializeCards(p, false) };
const ImageBox: BlockSpec = { id: "imagebox", name: "Карточка с изображением", defaults: {}, render: () => null, serialize: p => serializeCards(p, true) };
const Icon: BlockSpec = {
  id: "icon", name: "Иконка", defaults: {}, render: () => null,
  serialize: p => {
    const icons: Record<string, string> = {
      star: '<path d="M12 2l3.1 6.3L22 9.3l-5 4.9 1.2 7-6.2-3.3L5.8 21l1.2-6.8-5-4.9 6.9-1z" fill="currentColor"/>',
      check: '<path d="M5 12l4 4L19 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
      heart: '<path d="M12 21s-7-5-7-10a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 5-7 10-7 10z" fill="none" stroke="currentColor" stroke-width="2"/>',
      shield: '<path d="M12 22s8-4 8-10V6l-8-3-8 3v6c0 6 8 10 8 10z" fill="none" stroke="currentColor" stroke-width="2"/>',
      alert: '<path d="M12 3l9 16H3L12 3z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="17" r="1.5" fill="currentColor"/><path d="M12 9v5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    };
    const names: Record<string, string> = { star: "Звезда", check: "Галочка", heart: "Сердце", shield: "Щит", alert: "Внимание" };
    const name = typeof p.name === "string" && Object.hasOwn(icons, p.name) ? p.name : "star";
    const size = ({ sm: 16, md: 24, lg: 32, xl: 48 } as Record<string, number>)[String(p.size)] || 24;
    const colors: Record<string, string> = { "text-[#2a3b8f]": "blue", "text-[#5865F2]": "purple", "text-[#ef4444]": "red", "text-[#34d399]": "green", "text-[#ffd166]": "gold" };
    return `<svg class="site-icon-${colors[String(p.color)] || "blue"}" width="${size}" height="${size}" viewBox="0 0 24 24" role="img" aria-label="${names[name]}">${icons[name]}</svg>`;
  },
};
const Rating: BlockSpec = {
  id: "rating", name: "Рейтинг", defaults: {}, render: () => null,
  serialize: p => {
    const max = Math.max(1, Math.min(100, Math.floor(Number(p.max) || 5)));
    const value = Math.max(0, Math.min(max, Math.ceil(Number(p.value) || 0)));
    const name = typeof p.__ratingName === "string" && /^sb-rating-\d+$/.test(p.__ratingName) ? p.__ratingName : "sb-rating-0";
    const stars = Array.from({ length: max }, (_, index) => max - index).map(n => {
      const id = `${name}-${n}`;
      return `<input type="radio" id="${id}" name="${name}" value="${n}" aria-label="${n} из ${max}"${n === value ? " checked" : ""}${p.readonly ? " disabled" : ""}/><label for="${id}">★</label>`;
    }).join("");
    return `<div class="site-rating" role="radiogroup" aria-label="Рейтинг">${stars}</div>`;
  },
};
const PriceList: BlockSpec = {
  id: "pricelist", name: "Цены", defaults: {}, render: () => null,
  serialize: p => `<div class="price-list">${recordList(p.items).map((item) => `<article class="price-item"><h3>${esc(String(item.title || ""))}</h3><strong>${esc(String(item.price || ""))}</strong>${item.period ? `<span> ${esc(String(item.period))}</span>` : ""}${item.desc ? `<p>${nl2br(String(item.desc))}</p>` : ""}${Array.isArray(item.features) && item.features.length ? `<ul>${item.features.filter(Boolean).map((f) => `<li>${esc(String(f))}</li>`).join("")}</ul>` : ""}${item.ctaLabel && item.ctaHref ? `<a class="btn" href="${esc(String(item.ctaHref))}">${esc(String(item.ctaLabel))}</a>` : ""}</article>`).join("")}</div>`,
};
const PriceTable: BlockSpec = {
  id: "pricetable", name: "Таблица тарифов", defaults: {}, render: () => null,
  serialize: p => `<div class="price-table">${recordList(p.plans).map((plan) => `<article class="price-item${plan.popular ? " price-popular" : ""}">${plan.popular ? '<span class="price-badge">Популярный</span>' : ""}<h3>${esc(String(plan.name || ""))}</h3><strong>${esc(String(plan.price || ""))}</strong>${plan.period ? `<span> ${esc(String(plan.period))}</span>` : ""}${Array.isArray(plan.features) && plan.features.length ? `<ul>${recordList(plan.features).map((feature) => `<li><span aria-label="${feature.included ? "Включено" : "Не включено"}">${feature.included ? "✓" : "−"}</span> ${esc(String(feature.label || ""))}</li>`).join("")}</ul>` : ""}${plan.ctaLabel && plan.ctaHref ? `<a class="btn" href="${esc(String(plan.ctaHref))}">${esc(String(plan.ctaLabel))}</a>` : ""}</article>`).join("")}</div>`,
};
const Testimonials: BlockSpec = {
  id: "testimonials", name: "Отзывы", defaults: {}, render: () => null,
  serialize: p => `<div class="testimonials">${recordList(p.items).map((item) => `<figure>${item.avatar ? `<img class="testimonial-avatar" src="${esc(String(item.avatar))}" alt="" loading="lazy" referrerpolicy="no-referrer"/>` : ""}<blockquote>${nl2br(String(item.text || ""))}</blockquote><figcaption>${esc(String(item.author || ""))}${item.role ? ` — ${esc(String(item.role))}` : ""}</figcaption></figure>`).join("")}</div>`,
};
const Search: BlockSpec = {
  id: "search", name: "Поиск", defaults: {}, render: () => null,
  serialize: p => `<form class="site-search" role="search" action="${esc(String(p.action || "#"))}" method="${p.method === "POST" ? "post" : "get"}"><input type="search" name="q" aria-label="Поиск" placeholder="${esc(String(p.placeholder || "Поиск…"))}"/><button type="submit" class="btn">Искать</button></form>`,
};
const Social: BlockSpec = {
  id: "social", name: "Социальные страницы", defaults: {}, render: () => null,
  serialize: p => `<div class="social-links">${recordList(p.items).map((item) => {
    const label = String(item.label || "");
    const body = `<span class="social-initial" aria-hidden="true">${esc(label.slice(0, 2) || "?")}</span><span>${esc(label)}</span>`;
    return item.href ? `<a href="${esc(String(item.href))}">${body}</a>` : `<span class="social-item">${body}</span>`;
  }).join("")}</div>`,
};
const ProgressTracker: BlockSpec = {
  id: "progresstracker", name: "Этапы", defaults: {}, render: () => null,
  serialize: p => {
    const steps = recordList(p.steps);
    const current = Math.max(0, Math.min(steps.length - 1, Math.floor(Number(p.current) || 0)));
    return `<ol class="step-tracker" aria-label="Ход выполнения">${steps.map((step, i: number) => `<li${i === current ? ' aria-current="step"' : ""}><span class="step-number${i <= current ? " step-done" : ""}">${i + 1}</span><span>${esc(String(step.label || ""))}</span></li>`).join("")}</ol>`;
  },
};
const Pagination: BlockSpec = {
  id: "pagination", name: "Навигация по страницам", defaults: {}, render: () => null,
  serialize: p => {
    const { total, current, pages } = paginationState(p);
    const size = oneOf(p.size, ["sm", "md", "lg"]) ? p.size : "sm";
    const previous = current > 1 ? `<a aria-label="Предыдущая страница" href="${esc(paginationHref(p.baseHref, current - 1))}">‹</a>` : '<span aria-hidden="true">‹</span>';
    const next = current < total ? `<a aria-label="Следующая страница" href="${esc(paginationHref(p.baseHref, current + 1))}">›</a>` : '<span aria-hidden="true">›</span>';
    const links = pages.map(page => page === "..." ? '<span aria-hidden="true">…</span>' : `<a href="${esc(paginationHref(p.baseHref, page))}"${page === current ? ' aria-current="page"' : ""}>${page}</a>`).join("");
    return `<nav class="pagination pagination-${size}" aria-label="${esc(String(p.ariaLabel || "Навигация по страницам"))}">${previous}${links}${next}</nav>`;
  },
};
const Sidebar: BlockSpec = {
  id: "sidebar", name: "Боковая панель", defaults: {}, render: () => null,
  serialize: p => {
    const side = p.side === "right" ? "right" : "left";
    const widthClass = typeof p.__sidebarClass === "string" && /^sb-sidebar-\d+$/.test(p.__sidebarClass) ? p.__sidebarClass : "";
    const items = recordList(p.items).map((item) => `<li>${item.href ? `<a href="${esc(String(item.href))}">${esc(String(item.label || ""))}</a>` : esc(String(item.label || ""))}</li>`).join("");
    return `<aside class="site-sidebar site-sidebar-${side} ${widthClass}" aria-label="Боковая панель">${p.title ? `<strong>${esc(String(p.title))}</strong>` : ""}<nav><ul>${items}</ul></nav></aside>`;
  },
};
const Tabs: BlockSpec = {
  id: "tabs", name: "Вкладки", defaults: {}, render: () => null,
  serialize: p => {
    const tabs = recordList(p.tabs);
    const name = typeof p.__tabsName === "string" && /^sb-tabs-\d+$/.test(p.__tabsName) ? p.__tabsName : "sb-tabs-0";
    const requested = Math.max(0, Math.min(tabs.length - 1, Math.floor(Number(p.active) || 0)));
    const selected = tabs[requested] && !tabs[requested].disabled ? requested : tabs.findIndex((tab) => !tab.disabled);
    const orient = p.orientation === "vertical" ? "vertical" : "horizontal";
    const variant = oneOf(p.variant, ["underline", "boxed", "pill"]) ? p.variant : "underline";
    const size = oneOf(p.size, ["sm", "md", "lg"]) ? p.size : "md";
    const align = oneOf(p.align, ["start", "center", "end"]) ? p.align : "start";
    const controls = tabs.map((tab, i: number) => `<input class="site-tab-input" type="radio" name="${name}" id="${name}-tab-${i}" aria-controls="${name}-panel-${i}"${i === selected ? " checked" : ""}${tab.disabled ? " disabled" : ""}/><label id="${name}-label-${i}" for="${name}-tab-${i}">${esc(String(tab.label || ""))}</label>`).join("");
    const panels = tabs.map((tab, i: number) => `<section class="site-tab-panel" id="${name}-panel-${i}" aria-labelledby="${name}-label-${i}">${nl2br(String(tab.content || ""))}</section>`).join("");
    return `<div class="site-tabs ${name} site-tabs-${orient} site-tabs-${variant} site-tabs-${size} site-tabs-align-${align}"><div class="site-tab-controls" role="radiogroup" aria-label="Вкладки">${controls}</div><div class="site-tab-panels">${panels}</div></div>`;
  },
};
const Accordion: BlockSpec = {
  id: "accordion", name: "Аккордеон", defaults: {}, render: () => null,
  serialize: p => {
    const items = recordList(p.items);
    const name = typeof p.__accordionName === "string" && /^sb-accordion-\d+$/.test(p.__accordionName) ? p.__accordionName : "sb-accordion-0";
    const multiple = Boolean(p.allowMultiple);
    const toggle = p.allowToggle !== false;
    let opened = items.map((item) => Boolean(item.open));
    if (!multiple) { const first = opened.indexOf(true); opened = opened.map((_: boolean, i: number) => i === first); }
    if (!toggle && !opened.some(Boolean) && opened.length) opened[0] = true;
    const variant = oneOf(p.variant, ["ghost", "filled", "outline"]) ? p.variant : "ghost";
    const size = oneOf(p.size, ["sm", "md", "lg"]) ? p.size : "md";
    const content = items.map((item, i: number) => `<div class="accordion-item"><button type="button" id="${name}-button-${i}" data-accordion-toggle aria-expanded="${opened[i]}" aria-controls="${name}-panel-${i}">${esc(String(item.title || ""))}</button><div class="accordion-panel" id="${name}-panel-${i}" role="region" aria-labelledby="${name}-button-${i}"${opened[i] ? "" : " hidden"}>${nl2br(String(item.content || ""))}</div></div>`).join("");
    return `<div class="site-accordion site-accordion-${variant} site-accordion-${size}" data-accordion data-multiple="${multiple}" data-toggle="${toggle}">${content}</div>`;
  },
};
const Share: BlockSpec = {
  id: "share", name: "Поделиться", defaults: {}, render: () => null,
  serialize: p => {
    const labels: Record<string, string> = { copy: "Копировать ссылку", telegram: "Telegram", vk: "ВКонтакте", twitter: "X / Twitter", facebook: "Facebook" };
    const networks = [...new Set((Array.isArray(p.networks) ? p.networks : []).filter((n) => typeof n === "string" && Object.hasOwn(labels, n)))];
    const buttons = networks.map((network) => network === "copy"
      ? `<button type="button" data-share-action="copy">${labels.copy}</button>`
      : `<a href="#" target="_blank" rel="noopener noreferrer nofollow" data-share-action="${network}">${labels[network]}</a>`).join("");
    return `<div class="site-share" data-share data-url="${esc(String(p.url || ""))}">${buttons}<span class="site-share-status" data-share-status role="status" aria-live="polite"></span></div>`;
  },
};
const ContentNav: BlockSpec = {
  id: "contentnav", name: "Навигация по разделам", defaults: {}, render: () => null,
  serialize: p => {
    const orientation = p.orientation === "vertical" ? "vertical" : "horizontal";
    const offset = Number.isFinite(Number(p.spyOffset)) ? Math.max(0, Math.min(2000, Math.floor(Number(p.spyOffset)))) : 120;
    const items = recordList(p.items);
    const active = String(p.activeHref || items[0]?.href || "");
    const links = items.map((item) => `<li><a data-anchor href="${esc(String(item.href || "#"))}"${item.href === active ? ' aria-current="location"' : ""}>${esc(String(item.label || ""))}</a></li>`).join("");
    return `<nav class="content-nav content-nav-${orientation}" data-contentnav data-spy="${Boolean(p.spy)}" data-offset="${offset}" aria-label="${esc(String(p.ariaLabel || "Навигация по разделам"))}"><ul>${links}</ul></nav>`;
  },
};
const SafeHtml: BlockSpec = {
  id: "html", name: "Безопасный HTML", defaults: {}, render: () => null,
  serialize: p => `<div class="safe-html">${sanitizeSafeHtml(p.html)}</div>`,
};
const Carousel: BlockSpec = {
  id: "carousel", name: "Карусель", defaults: {}, render: () => null,
  serialize: p => {
    const slides = recordList(p.slides);
    const initial = Math.max(0, Math.min(slides.length - 1, Math.floor(Number(p.initial) || 0)));
    const content = slides.map((slide, i: number) => `<figure data-carousel-slide${i === initial ? "" : " hidden"}>${slide.src ? `<img src="${esc(String(slide.src))}" alt="${esc(String(slide.alt || ""))}" loading="lazy" referrerpolicy="no-referrer"/>` : ""}${slide.caption ? `<figcaption>${esc(String(slide.caption))}</figcaption>` : ""}</figure>`).join("");
    const controls = slides.length > 1 ? `<div class="carousel-controls"><button type="button" data-carousel-command="previous" aria-label="Предыдущий слайд">‹</button><span data-carousel-status role="status" aria-live="polite">Слайд ${initial + 1} из ${slides.length}</span><button type="button" data-carousel-command="next" aria-label="Следующий слайд">›</button></div>` : "";
    return `<section class="site-carousel" data-carousel aria-label="Карусель"><div data-carousel-track>${content}</div>${controls}</section>`;
  },
};
const MediaCarousel: BlockSpec = {
  id: "mediacarousel", name: "Медиакарусель", defaults: {}, render: () => null,
  serialize: p => {
    const slides = recordList(p.slides);
    const initial = Math.max(0, Math.min(slides.length - 1, Math.floor(Number(p.initial) || 0)));
    const content = slides.map((slide, i: number) => `<figure data-carousel-slide${i === initial ? "" : " hidden"}>${slide.src ? slide.kind === "video" ? `<video src="${esc(String(slide.src))}" controls preload="none"></video>` : `<img src="${esc(String(slide.src))}" alt="${esc(String(slide.alt || ""))}" loading="lazy" referrerpolicy="no-referrer"/>` : ""}${slide.caption ? `<figcaption>${esc(String(slide.caption))}</figcaption>` : ""}</figure>`).join("");
    const controls = slides.length > 1 ? `<div class="carousel-controls"><button type="button" data-carousel-command="previous" aria-label="Предыдущий слайд">‹</button><span data-carousel-status role="status" aria-live="polite">Слайд ${initial + 1} из ${slides.length}</span><button type="button" data-carousel-command="next" aria-label="Следующий слайд">›</button></div>` : "";
    return `<section class="site-carousel" data-carousel aria-label="Медиакарусель"><div data-carousel-track>${content}</div>${controls}</section>`;
  },
};
const Hotspot: BlockSpec = {
  id: "hotspot", name: "Изображение с маркерами", defaults: {}, render: () => null,
  serialize: p => {
    const name = typeof p.__hotspotClass === "string" && /^sb-hotspot-\d+$/.test(p.__hotspotClass) ? p.__hotspotClass : "sb-hotspot-0";
    const markers = recordList(p.markers);
    return `<div class="site-hotspot">${p.src ? `<img src="${esc(String(p.src))}" alt="${esc(String(p.alt || ""))}" referrerpolicy="no-referrer"/>` : '<div class="site-hotspot-empty">Изображение не указано</div>'}${markers.map((marker, index: number) => marker.href ? `<a class="site-hotspot-marker ${name}-${index}" href="${esc(String(marker.href))}" aria-label="${esc(String(marker.label || "Маркер"))}" title="${esc(String(marker.label || "Маркер"))}">●</a>` : `<span class="site-hotspot-marker ${name}-${index}" aria-label="${esc(String(marker.label || "Маркер"))}" title="${esc(String(marker.label || "Маркер"))}">●</span>`).join("")}</div>`;
  },
};
const VideoPlaylist: BlockSpec = {
  id: "videoplaylist", name: "Видеоплейлист", defaults: {}, render: () => null,
  serialize: p => {
    const items = recordList(p.items);
    const initial = Math.max(0, Math.min(items.length - 1, Math.floor(Number(p.initial) || 0)));
    const videos = items.map((item, index: number) => `<div data-playlist-item${index === initial ? "" : " hidden"}>${item.src ? `<video controls preload="none" src="${esc(String(item.src))}"${item.poster ? ` poster="${esc(String(item.poster))}"` : ""}></video>` : '<p>Видео не указано</p>'}</div>`).join("");
    const buttons = items.map((item, index: number) => `<button type="button" data-playlist-select="${index}" aria-pressed="${index === initial ? "true" : "false"}">${esc(String(item.title || `Видео ${index + 1}`))}</button>`).join("");
    return `<section class="video-playlist" data-playlist aria-label="Видеоплейлист"><div data-playlist-videos>${videos}</div><div class="playlist-items">${buttons}</div></section>`;
  },
};
const Countdown: BlockSpec = {
  id: "countdown", name: "Обратный отсчёт", defaults: {}, render: () => null,
  serialize: p => {
    const parsed = Date.parse(typeof p.target === "string" ? p.target : "");
    const valid = Number.isFinite(parsed);
    const target = valid ? new Date(parsed).toISOString() : "";
    const seconds = valid ? Math.floor(Math.max(0, parsed - Date.now()) / 1000) : 0;
    const d = Math.floor(seconds / 86400), h = Math.floor(seconds % 86400 / 3600), m = Math.floor(seconds % 3600 / 60), s = seconds % 60;
    const text = valid ? `${d} д ${String(h).padStart(2, "0")} ч ${String(m).padStart(2, "0")} мин ${String(s).padStart(2, "0")} с` : "Неверная дата";
    return `<div class="site-countdown" data-countdown data-target="${target}"><span data-countdown-value>${text}</span></div>`;
  },
};
const Slides: BlockSpec = {
  id: "slides", name: "Текстовые слайды", defaults: {}, render: () => null,
  serialize: p => {
    const slides = recordList(p.slides);
    const initial = Math.max(0, Math.min(slides.length - 1, Math.floor(Number(p.initial) || 0)));
    const content = slides.map((slide, i: number) => `<article class="text-slide" data-carousel-slide${i === initial ? "" : " hidden"}>${slide.title ? `<h3>${esc(String(slide.title))}</h3>` : ""}${slide.text ? `<p>${nl2br(String(slide.text))}</p>` : ""}${slide.ctaLabel && slide.ctaHref ? `<a class="btn" href="${esc(String(slide.ctaHref))}">${esc(String(slide.ctaLabel))}</a>` : ""}</article>`).join("");
    const controls = slides.length > 1 ? `<div class="carousel-controls"><button type="button" data-carousel-command="previous" aria-label="Предыдущий слайд">‹</button><span data-carousel-status role="status" aria-live="polite">Слайд ${initial + 1} из ${slides.length}</span><button type="button" data-carousel-command="next" aria-label="Следующий слайд">›</button></div>` : "";
    return `<section class="site-carousel" data-carousel aria-label="Слайды"><div data-carousel-track>${content}</div>${controls}</section>`;
  },
};
const Offcanvas: BlockSpec = {
  id: "offcanvas", name: "Выезжающая панель", defaults: {}, render: () => null,
  serialize: p => {
    const name = typeof p.__drawerName === "string" && /^sb-drawer-\d+$/.test(p.__drawerName) ? p.__drawerName : "sb-drawer-0";
    const side = p.side === "right" ? "right" : "left";
    const title = String(p.title || "Панель");
    return `<button type="button" class="btn" data-drawer-open="${name}">Открыть ${esc(title)}</button><dialog id="${name}" class="site-drawer site-drawer-${side} ${name}" data-drawer aria-labelledby="${name}-title"><div class="site-drawer-header"><strong id="${name}-title">${esc(title)}</strong><button type="button" data-drawer-close aria-label="Закрыть панель">Закрыть</button></div><div class="site-drawer-body">${p.body ? `<p class="site-drawer-text">${esc(String(p.body))}</p>` : ""}${serializeLayout(p.layoutCells, p.layoutWeights, p.__layoutClass)}</div></dialog>`;
  },
};

const SitePopup: BlockSpec={
  id:"site-popup",name:"Всплывающее окно",defaults:{},render:()=>null,
  serialize:p=>{
    if(typeof p.id!=="string" || !/^popup-[a-z0-9_-]+$/i.test(p.id))return "";
    const options=popupSettings(p.options),cell=Array.isArray(p.layoutCells)?p.layoutCells[0]:[];
    const body=recordList(cell).map(block=>serializeBlock(String(block.type),asRecord(block.props))).join("");
    return `<dialog class="sb-popup sb-popup-${options.position}" id="${p.id}" aria-label="${esc(p.title||"Всплывающее окно")}" data-popup-options="${esc(JSON.stringify(options))}"><div class="sb-popup-bar"><button type="button" data-popup-close aria-label="Закрыть окно">Закрыть</button></div>${body}</dialog>`;
  },
};
const SoundCloud: BlockSpec = {
  id:"soundcloud",name:"SoundCloud",defaults:{},render:({props})=>React.createElement("figure",null,String(props.label??"SoundCloud")),
  serialize:p=>{
    const s=soundSettings(p),link=s.track?`<a href="${esc(s.track)}" rel="noopener noreferrer" target="_blank">Открыть SoundCloud</a>`:"";
    const player=s.embed && p.__allowSound===true?`<button type="button" data-soundcloud-player="${esc(s.embed)}">Загрузить плеер SoundCloud</button>`:"";
    return `<figure class="sb-audio-card"><figcaption>${esc(s.label)}</figcaption>${player}${link}</figure>`;
  },
};
const ReadMore: BlockSpec = {
  id:"readmore", name:"Продолжение записи", defaults:{}, render:()=>null,
  serialize:p=>typeof p.marker==="string" && /^more-[a-z0-9]+$/.test(p.marker)?`<span id="${p.marker}" class="sb-post-break"></span>`:"",
};
const TextPath: BlockSpec = {
  id:"textpath",name:"Текст по контуру",defaults:{},render:({props})=>React.createElement("span",null,String(props.text??"")),
  serialize:p=>{
    const s=textPathOptions(p),id=typeof p.__pathId==="string" && /^sb-path-\d+$/.test(p.__pathId)?p.__pathId:"sb-path-0";
    const path=id+"-curve",show=s.showPath?`<use href="#${path}" fill="none" stroke="${s.stroke}" stroke-width="${s.strokeWidth}"/>`:"";
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" class="sb-text-path ${id}" role="img" aria-label="${esc(s.text)}" width="${s.size}${s.unit}" viewBox="${s.viewBox}"><g transform="rotate(${s.rotate} ${s.cx} ${s.cy})"><defs><path id="${path}" d="${esc(s.d)}"/></defs>${show}<text fill="${s.color}" font-size="${s.fontSize}" word-spacing="${s.wordSpacing}" text-anchor="${s.align}"${s.direction==="auto"?"":' direction="'+s.direction+'"'}><textPath href="#${path}" startOffset="${s.start}%">${esc(s.text)}</textPath></text></g></svg>`;
    return typeof p.href==="string" && p.href?`<a href="${esc(sanitizeHref(p.href))}">${svg}</a>`:svg;
  },
};
const LoopGrid: BlockSpec = {
  id:"loopgrid",name:"Цикл материалов",defaults:{},
  render: ({props}) => React.createElement("section",null,String(props.emptyText??"Цикл материалов")),
  serialize: p => {
    const settings=loopSettings(p), entries=recordList(p.cards);
    const cls=typeof p.__loopClass==="string" && /^sb-loop-\d+$/.test(p.__loopClass)?p.__loopClass:"";
    const terms = [...new Set(entries.flatMap(c=>Array.isArray(c.terms)?c.terms.filter((t):t is string=>typeof t==="string"&&!!t):[]))];
    const filter=settings.filter && terms.length ? `<label>Рубрика <select data-loop-filter><option value="">Все рубрики</option>${terms.map(t=>`<option value="${esc(t)}">${esc(t)}</option>`).join("")}</select></label>` : "";
    const pages=Math.ceil(entries.length/settings.pageSize);
    const cards=entries.map((card,index)=>{
      const cell=Array.isArray(p.layoutCells)?p.layoutCells[index]:undefined;
      const href=typeof card.href==="string" && /^\.\/[a-z0-9][a-z0-9-]{0,63}\.html$/.test(card.href)?card.href:"#";
      const more=asRecord(card.more);
      const continueLink=typeof more.fragment==="string" && /^more-[a-z0-9]+$/.test(more.fragment) && href!=="#" ?
        `<a class="sb-read-more" href="${esc(href)}#${more.fragment}">${esc(more.label)}</a>`:"";
      const body=card.custom && Array.isArray(cell) ? recordList(cell).map(b=>serializeBlock(String(b.type),asRecord(b.props))).join("") :
        `<h3><a href="${esc(href)}">${esc(card.title)}</a></h3>${card.description?`<p>${esc(card.description)}</p>`:""}${continueLink}`;
      return `<article data-loop-terms="${esc(JSON.stringify(card.terms??[]))}"${index>=settings.pageSize?" hidden":""}>${body}</article>`;
    }).join("");
    return `<section class="sb-loop ${cls}" data-loop-size="${settings.pageSize}">${filter}<div data-loop-list>${cards}</div><p data-loop-empty${entries.length?" hidden":""}>${esc(settings.emptyText)}</p><nav aria-label="Страницы цикла"${pages<2?" hidden":""}><button type="button" data-loop-previous disabled>Назад</button> <span role="status">1 / ${pages}</span> <button type="button" data-loop-next${pages<2?" disabled":""}>Вперёд</button></nav></section>`;
  },
};

const MapWidget: BlockSpec = {
  id: "map", name: "Карта", defaults: {},
  render: ({props}) => React.createElement("figure", null, mapSettings(props).label || "Местоположение"),
  serialize: p => {
    const settings = mapSettings(p), urls = mapUrls(settings);
    const id = typeof p.__mapClass === "string" && /^sb-map-\d+$/.test(p.__mapClass) ? p.__mapClass : "map";
    const detail = settings.detailMap && p.__allowMap === true
      ? `<button type="button" data-map-open="${esc(urls.embed)}">Загрузить подробную карту OpenStreetMap</button>` : "";
    return `<figure class="sb-map sb-map-${settings.mapTheme} ${id}"><div class="sb-map-view">${overviewSvg(settings,id)}</div><figcaption><strong>${esc(settings.label || "Местоположение")}</strong> · ${settings.lat.toFixed(5)}, ${settings.lon.toFixed(5)}<small>Natural Earth</small></figcaption>${detail} <a href="${esc(urls.link)}" target="_blank" rel="noopener noreferrer nofollow">Открыть в OpenStreetMap</a></figure>`;
  },
};

const Lottie: BlockSpec = {
  id: "lottie", name: "Анимация Lottie", defaults: {},
  render: ({props}) => React.createElement("figure", null, String(props.caption || "Анимация Lottie")),
  serialize: p => {
    const cls = typeof p.__animationClass === "string" && /^sb-animation-\d+$/.test(p.__animationClass) ? p.__animationClass : "";
    return `<section class="section ${cls}">${animationMarkup(String(p.animationJson || ""), String(p.caption || ""), p, String(p.poster || ""))}</section>`;
  },
};

// Регистр
const BLOCKS: Record<string, BlockSpec> = {
  [Hero.id]: Hero,
  [H1.id]: H1,
  [Heading.id]: Heading,
  [Text.id]: Text,
  [Image.id]: Image,
  [Video.id]: Video,
  [Button.id]: Button,
  [Cols2.id]: Cols2,
  [Spacer.id]: Spacer,
  [Divider.id]: Divider,
  [Section.id]: Section,
  [Grid.id]: Grid,
  [Alert.id]: Alert,
  [Blockquote.id]: Blockquote,
  [Progress.id]: Progress,
  [Counter.id]: Counter,
  [IconList.id]: IconList,
  [Anchor.id]: Anchor,
  [Code.id]: Code,
  [Cta.id]: Cta,
  [Toc.id]: Toc,
  [Breadcrumbs.id]: Breadcrumbs,
  [Container.id]: Container,
  [Menu.id]: Menu,
  [IconBox.id]: IconBox,
  [ImageBox.id]: ImageBox,
  [Icon.id]: Icon,
  [Rating.id]: Rating,
  [PriceList.id]: PriceList,
  [PriceTable.id]: PriceTable,
  [Testimonials.id]: Testimonials,
  [Search.id]: Search,
  [Social.id]: Social,
  [ProgressTracker.id]: ProgressTracker,
  [Pagination.id]: Pagination,
  [Sidebar.id]: Sidebar,
  [Tabs.id]: Tabs,
  [Accordion.id]: Accordion,
  [Share.id]: Share,
  [ContentNav.id]: ContentNav,
  [SafeHtml.id]: SafeHtml,
  [Carousel.id]: Carousel,
  [MediaCarousel.id]: MediaCarousel,
  [Hotspot.id]: Hotspot,
  [VideoPlaylist.id]: VideoPlaylist,
  [Countdown.id]: Countdown,
  [Slides.id]: Slides,
  [Offcanvas.id]: Offcanvas,
  [Lottie.id]: Lottie,
  [MapWidget.id]: MapWidget,
  [SitePopup.id]: SitePopup, [SoundCloud.id]: SoundCloud, [ReadMore.id]: ReadMore, [TextPath.id]: TextPath,
  [LoopGrid.id]: LoopGrid,
};

// API реестра
export function listBlocks(): BlockSpec[] {
  return Object.values(BLOCKS);
}

export function getBlock(id: string): BlockSpec | undefined {
  return BLOCKS[id];
}

export function serializeBlock(id: string, props: Record<string, unknown>): string {
  const spec = getBlock(id);
  if (!spec) throw new Error(`Unknown block: ${id}`);
  const p = props || {};
  const body = spec.serialize(p);
  const styleClass = typeof p.__styleClass === "string" && /^sb-style-\d+$/.test(p.__styleClass) ? p.__styleClass : "";
  const visibilityClass = typeof p.__visibilityClass === "string" && /^sb-visibility-\d+$/.test(p.__visibilityClass) ? p.__visibilityClass : "";
  const custom = typeof p.__safeClass === "string" ? p.__safeClass.split(/\s+/).filter((x: string) => /^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(x)).join(" ") : "";
  const anchor = typeof p.__safeAnchor === "string" && /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(p.__safeAnchor) ? p.__safeAnchor : "";
  if (!styleClass && !visibilityClass && !custom && !anchor) return body;
  const classes = [styleClass, visibilityClass, custom].filter(Boolean).join(" ");
  return `<div${classes ? ` class="${classes}"` : ""}${anchor ? ` id="${anchor}"` : ""}>${body}</div>`;
}

// Совместимость: дефолтный экспорт как реестр
const registry = {
  list: listBlocks,
  get: getBlock,
  serialize: serializeBlock,
};

export default registry;
