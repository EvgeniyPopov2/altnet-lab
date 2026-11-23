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
  defaults: Record<string, any>;
  render: (args: { props: Record<string, any> }) => any; // без JSX/FC
  serialize: (props: Record<string, any>) => string;
};

// Утилиты
const esc = (s: string = "") =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const nl2br = (s: string = "") => esc(s).replace(/\n/g, "<br/>");

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
        React.createElement("h1", null, p.title),
        React.createElement("p", { className: "muted" }, p.subtitle),
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
            p.ctaLabel
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
      React.createElement("h1", null, p.text)
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
    const lvl = ["h1", "h2", "h3", "h4", "h5", "h6", "div", "span", "p"].includes(p.level) ? p.level : "h2";
    const Tag: any = lvl;
    return React.createElement(
      "section",
      { className: `section t-${p.align || "left"}` },
      React.createElement(Tag, null, typeof p.href === "string" && p.href.trim() ? React.createElement("a", { href: sanitizeHref(p.href) }, String(p.text || "")) : String(p.text || ""))
    );
  },
  serialize: (props) => {
    const p = { ...Heading.defaults, ...(props || {}) };
    const lvl = ["h1", "h2", "h3", "h4", "h5", "h6", "div", "span", "p"].includes(p.level) ? p.level : "h2";
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
      React.createElement("p", null, p.text)
    );
  },
  serialize: (props) => {
    const p = { ...Text.defaults, ...props };
    const cls = `section t-${p.align || "left"}`;
    return `<section class="${cls}"><p>${nl2br(p.text)}</p></section>`;
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
    const link = p.href ? `<a class="sb-image-link" href="${esc(String(p.href))}"${p.target ? ` target="${esc(String(p.target))}"` : ""}${p.rel ? ` rel="${esc(String(p.rel))}"` : ""}>${image}</a>` : image;
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
    const aria = typeof p.accessibleLabel === "string" ? p.accessibleLabel.replace(/[\x00-\x1f\x7f]/g, "").trim().slice(0, 300) : "";
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
      React.createElement("h2", null, p.title),
      React.createElement("p", null, p.text)
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
    const cols = (p.cols >= 1 && p.cols <= 4 ? p.cols : 3) as 1 | 2 | 3 | 4;
    const wrapCls = `grid-wrap gc-${cols}`;

    const children = (Array.isArray(p.items) ? p.items : []).map((it, i) =>
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
    const style: any = { "--gx": `${Number(p.gapX ?? 16)}px`, "--gy": `${Number(p.gapY ?? 16)}px` };
    return React.createElement("section", { className: "section" },
      React.createElement("div", { className: wrapCls, style }, ...children)
    );
  },
  serialize: (props) => {
    const p = { ...Grid.defaults, ...(props || {}) };
    const cols = (p.cols >= 1 && p.cols <= 4 ? p.cols : 3) as 1 | 2 | 3 | 4;
    const gridClass = typeof p.__gridClass === "string" && /^sb-grid-\d+$/.test(p.__gridClass) ? p.__gridClass : "";
    const wrapCls = `grid-wrap gc-${cols}${gridClass ? ` ${gridClass}` : ""}`;

    const items = (Array.isArray(p.items) ? p.items : []).map((it) => {
      const src = esc(String(it?.src || ""));
      const alt = esc(String(it?.alt || ""));
      const caption = it?.caption ? `<figcaption class="body">${esc(String(it.caption))}</figcaption>` : "";

      return `<figure class="grid-card"><img src="${src}" alt="${alt}"/>${caption}</figure>`;
    }).join("");
    return `<section class="section">${items ? `<div class="${wrapCls}">${items}</div>` : ""}${serializeLayout(p.layoutCells, p.layoutWeights, p.__layoutClass)}</section>`;
  },
};

const Alert: BlockSpec = {
  id: "alert", name: "Уведомление", defaults: {},
  render: ({ props }) => React.createElement("aside", null, props.title, props.text),
  serialize: p => {
    const variant = ["info", "success", "warning", "danger"].includes(p.variant) ? p.variant : "info";
    return `<aside class="notice notice-${variant}">${p.title ? `<strong>${esc(String(p.title))}</strong>` : ""}${p.text ? `<p>${nl2br(String(p.text))}</p>` : ""}</aside>`;
  },
};
const Blockquote: BlockSpec = {
  id: "blockquote", name: "Цитата", defaults: {},
  render: ({ props }) => React.createElement("blockquote", null, props.text),
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
  render: ({ props }) => React.createElement("span", null, props.value),
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
  render: ({ props }) => React.createElement("ul", null, (props.items || []).map((item: any, i: number) => React.createElement("li", { key: i }, item.label))),
  serialize: p => {
    const size = ["sm", "md", "lg"].includes(p.size) ? p.size : "md";
    const gap = ["sm", "md", "lg"].includes(p.gap) ? p.gap : "md";
    const align = ["start", "center", "end"].includes(p.align) ? p.align : "start";
    const variant = ["dot", "check", "star", "custom"].includes(p.variant) ? p.variant : "dot";
    const items = (Array.isArray(p.items) ? p.items : []).map((item: any) => {
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
  render: ({ props }) => React.createElement("pre", null, React.createElement("code", null, props.code)),
  serialize: p => {
    const language = typeof p.lang === "string" && /^[a-z0-9_+.-]{1,40}$/i.test(p.lang) ? p.lang : "";
    return `<pre class="code-block"><code${language ? ` class="language-${esc(language)}"` : ""}>${esc(String(p.code || ""))}</code></pre>`;
  },
};
const Cta: BlockSpec = {
  id: "cta", name: "Призыв", defaults: {},
  render: ({ props }) => React.createElement("section", null, props.title, props.text),
  serialize: p => {
    const variant = ["primary", "secondary", "outline", "ghost"].includes(p.variant) ? p.variant : "primary";
    const align = ["start", "center", "end"].includes(p.align) ? p.align : "start";
    const emphasis = ["none", "panel", "brand"].includes(p.emphasis) ? p.emphasis : "panel";
    const button = p.btnLabel && p.btnHref ? `<a class="btn cta-button-${variant}" href="${esc(String(p.btnHref))}">${esc(String(p.btnLabel))}</a>` : "";
    return `<section class="cta cta-${align} cta-${emphasis}">${p.title ? `<h3>${esc(String(p.title))}</h3>` : ""}${p.text ? `<p>${nl2br(String(p.text))}</p>` : ""}${button}</section>`;
  },
};
const Toc: BlockSpec = {
  id: "toc", name: "Содержание", defaults: {},
  render: ({ props }) => React.createElement("nav", null, (props.items || []).map((item: any, i: number) => React.createElement("a", { key: i, href: item.href }, item.label))),
  serialize: p => `<nav class="toc" aria-label="Содержание"><ol>${(Array.isArray(p.items) ? p.items : []).map((item: any) => `<li><a href="${esc(String(item.href || "#"))}">${esc(String(item.label || ""))}</a></li>`).join("")}</ol></nav>`,
};
const Breadcrumbs: BlockSpec = {
  id: "breadcrumbs", name: "Навигационная цепочка", defaults: {},
  render: ({ props }) => React.createElement("nav", null, props.ariaLabel || "Навигация"),
  serialize: p => {
    const items = Array.isArray(p.items) ? p.items : [];
    const separator = ["/", "›", "»"].includes(p.separator) ? p.separator : "›";
    const size = ["sm", "md", "lg"].includes(p.size) ? p.size : "sm";
    const result = items.map((item: any, index: number) => {
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
    const width = ["sm", "md", "lg", "xl", "full"].includes(p.width) ? p.width : "md";
    const padding = ["none", "sm", "md", "lg"].includes(p.padding) ? p.padding : "md";
    const bg = ["none", "panel", "brand"].includes(p.bg) ? p.bg : "none";
    const cls = `sb-container sb-container-${width} sb-container-pad-${padding} sb-container-bg-${bg}${p.border ? " sb-container-border" : ""}${p.rounded ? " sb-container-rounded" : ""}`;
    return `<section class="${cls}">${serializeLayout(p.layoutCells, p.layoutWeights, p.__layoutClass)}</section>`;
  },
};
const Menu: BlockSpec = {
  id: "menu", name: "Меню", defaults: {},
  render: ({ props }) => React.createElement("nav", null, props.ariaLabel || "Меню"),
  serialize: p => {
    const active = String(p.activeHref || "");
    const renderItems = (items: any[], nested: boolean): string => `<ul class="${nested ? "site-menu-children" : `site-menu site-menu-${p.orientation === "vertical" ? "vertical" : "horizontal"}`}">${items.map(item => {
      const href = String(item.href || "#");
      const sub = Array.isArray(item.children) && item.children.length ? renderItems(item.children, true) : "";
      return `<li><a href="${esc(href)}"${active && href === active ? ' aria-current="page"' : ""}>${esc(String(item.label || ""))}</a>${sub}</li>`;
    }).join("")}</ul>`;
    return `<nav aria-label="${esc(String(p.ariaLabel || "Меню"))}">${renderItems(Array.isArray(p.items) ? p.items : [], false)}</nav>`;
  },
};
function serializeCards(p: Record<string, any>, image: boolean): string {
  const columns = [1, 2, 3, 4].includes(p.columns) ? p.columns : 1;
  const icons: Record<string, string> = { star: "★", check: "✓", heart: "♥", shield: "⬡", alert: "!" };
  const items = (Array.isArray(p.items) ? p.items : []).map((item: any) => {
    const visual = image ? (item.src ? `<img src="${esc(String(item.src))}" alt="${esc(String(item.alt || ""))}" loading="lazy" referrerpolicy="no-referrer"/>` : "")
      : `<span class="site-card-icon" aria-hidden="true">${esc(icons[item.icon] || String(item.icon || "•").slice(0, 2))}</span>`;
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
    const name = Object.hasOwn(icons, p.name) ? p.name : "star";
    const size = ({ sm: 16, md: 24, lg: 32, xl: 48 } as Record<string, number>)[p.size] || 24;
    const colors: Record<string, string> = { "text-[#2a3b8f]": "blue", "text-[#5865F2]": "purple", "text-[#ef4444]": "red", "text-[#34d399]": "green", "text-[#ffd166]": "gold" };
    return `<svg class="site-icon-${colors[p.color] || "blue"}" width="${size}" height="${size}" viewBox="0 0 24 24" role="img" aria-label="${names[name]}">${icons[name]}</svg>`;
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
  serialize: p => `<div class="price-list">${(Array.isArray(p.items) ? p.items : []).map((item: any) => `<article class="price-item"><h3>${esc(String(item.title || ""))}</h3><strong>${esc(String(item.price || ""))}</strong>${item.period ? `<span> ${esc(String(item.period))}</span>` : ""}${item.desc ? `<p>${nl2br(String(item.desc))}</p>` : ""}${Array.isArray(item.features) && item.features.length ? `<ul>${item.features.filter(Boolean).map((f: any) => `<li>${esc(String(f))}</li>`).join("")}</ul>` : ""}${item.ctaLabel && item.ctaHref ? `<a class="btn" href="${esc(String(item.ctaHref))}">${esc(String(item.ctaLabel))}</a>` : ""}</article>`).join("")}</div>`,
};
const PriceTable: BlockSpec = {
  id: "pricetable", name: "Таблица тарифов", defaults: {}, render: () => null,
  serialize: p => `<div class="price-table">${(Array.isArray(p.plans) ? p.plans : []).map((plan: any) => `<article class="price-item${plan.popular ? " price-popular" : ""}">${plan.popular ? '<span class="price-badge">Популярный</span>' : ""}<h3>${esc(String(plan.name || ""))}</h3><strong>${esc(String(plan.price || ""))}</strong>${plan.period ? `<span> ${esc(String(plan.period))}</span>` : ""}${Array.isArray(plan.features) && plan.features.length ? `<ul>${plan.features.map((feature: any) => `<li><span aria-label="${feature.included ? "Включено" : "Не включено"}">${feature.included ? "✓" : "−"}</span> ${esc(String(feature.label || ""))}</li>`).join("")}</ul>` : ""}${plan.ctaLabel && plan.ctaHref ? `<a class="btn" href="${esc(String(plan.ctaHref))}">${esc(String(plan.ctaLabel))}</a>` : ""}</article>`).join("")}</div>`,
};
const Testimonials: BlockSpec = {
  id: "testimonials", name: "Отзывы", defaults: {}, render: () => null,
  serialize: p => `<div class="testimonials">${(Array.isArray(p.items) ? p.items : []).map((item: any) => `<figure>${item.avatar ? `<img class="testimonial-avatar" src="${esc(String(item.avatar))}" alt="" loading="lazy" referrerpolicy="no-referrer"/>` : ""}<blockquote>${nl2br(String(item.text || ""))}</blockquote><figcaption>${esc(String(item.author || ""))}${item.role ? ` — ${esc(String(item.role))}` : ""}</figcaption></figure>`).join("")}</div>`,
};
const Search: BlockSpec = {
  id: "search", name: "Поиск", defaults: {}, render: () => null,
  serialize: p => `<form class="site-search" role="search" action="${esc(String(p.action || "#"))}" method="${p.method === "POST" ? "post" : "get"}"><input type="search" name="q" aria-label="Поиск" placeholder="${esc(String(p.placeholder || "Поиск…"))}"/><button type="submit" class="btn">Искать</button></form>`,
};
const Social: BlockSpec = {
  id: "social", name: "Социальные страницы", defaults: {}, render: () => null,
  serialize: p => `<div class="social-links">${(Array.isArray(p.items) ? p.items : []).map((item: any) => {
    const label = String(item.label || "");
    const body = `<span class="social-initial" aria-hidden="true">${esc(label.slice(0, 2) || "?")}</span><span>${esc(label)}</span>`;
    return item.href ? `<a href="${esc(String(item.href))}">${body}</a>` : `<span class="social-item">${body}</span>`;
  }).join("")}</div>`,
};
const ProgressTracker: BlockSpec = {
  id: "progresstracker", name: "Этапы", defaults: {}, render: () => null,
  serialize: p => {
    const steps = Array.isArray(p.steps) ? p.steps : [];
    const current = Math.max(0, Math.min(steps.length - 1, Math.floor(Number(p.current) || 0)));
    return `<ol class="step-tracker" aria-label="Ход выполнения">${steps.map((step: any, i: number) => `<li${i === current ? ' aria-current="step"' : ""}><span class="step-number${i <= current ? " step-done" : ""}">${i + 1}</span><span>${esc(String(step.label || ""))}</span></li>`).join("")}</ol>`;
  },
};
const Pagination: BlockSpec = {
  id: "pagination", name: "Навигация по страницам", defaults: {}, render: () => null,
  serialize: p => {
    const { total, current, pages } = paginationState(p);
    const size = ["sm", "md", "lg"].includes(p.size) ? p.size : "sm";
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
    const items = (Array.isArray(p.items) ? p.items : []).map((item: any) => `<li>${item.href ? `<a href="${esc(String(item.href))}">${esc(String(item.label || ""))}</a>` : esc(String(item.label || ""))}</li>`).join("");
    return `<aside class="site-sidebar site-sidebar-${side} ${widthClass}" aria-label="Боковая панель">${p.title ? `<strong>${esc(String(p.title))}</strong>` : ""}<nav><ul>${items}</ul></nav></aside>`;
  },
};
const Tabs: BlockSpec = {
  id: "tabs", name: "Вкладки", defaults: {}, render: () => null,
  serialize: p => {
    const tabs = Array.isArray(p.tabs) ? p.tabs : [];
    const name = typeof p.__tabsName === "string" && /^sb-tabs-\d+$/.test(p.__tabsName) ? p.__tabsName : "sb-tabs-0";
    const requested = Math.max(0, Math.min(tabs.length - 1, Math.floor(Number(p.active) || 0)));
    const selected = tabs[requested] && !tabs[requested].disabled ? requested : tabs.findIndex((tab: any) => !tab.disabled);
    const orient = p.orientation === "vertical" ? "vertical" : "horizontal";
    const variant = ["underline", "boxed", "pill"].includes(p.variant) ? p.variant : "underline";
    const size = ["sm", "md", "lg"].includes(p.size) ? p.size : "md";
    const align = ["start", "center", "end"].includes(p.align) ? p.align : "start";
    const controls = tabs.map((tab: any, i: number) => `<input class="site-tab-input" type="radio" name="${name}" id="${name}-tab-${i}" aria-controls="${name}-panel-${i}"${i === selected ? " checked" : ""}${tab.disabled ? " disabled" : ""}/><label id="${name}-label-${i}" for="${name}-tab-${i}">${esc(String(tab.label || ""))}</label>`).join("");
    const panels = tabs.map((tab: any, i: number) => `<section class="site-tab-panel" id="${name}-panel-${i}" aria-labelledby="${name}-label-${i}">${nl2br(String(tab.content || ""))}</section>`).join("");
    return `<div class="site-tabs ${name} site-tabs-${orient} site-tabs-${variant} site-tabs-${size} site-tabs-align-${align}"><div class="site-tab-controls" role="radiogroup" aria-label="Вкладки">${controls}</div><div class="site-tab-panels">${panels}</div></div>`;
  },
};
const Accordion: BlockSpec = {
  id: "accordion", name: "Аккордеон", defaults: {}, render: () => null,
  serialize: p => {
    const items = Array.isArray(p.items) ? p.items : [];
    const name = typeof p.__accordionName === "string" && /^sb-accordion-\d+$/.test(p.__accordionName) ? p.__accordionName : "sb-accordion-0";
    const multiple = Boolean(p.allowMultiple);
    const toggle = p.allowToggle !== false;
    let opened = items.map((item: any) => Boolean(item.open));
    if (!multiple) { const first = opened.indexOf(true); opened = opened.map((_: boolean, i: number) => i === first); }
    if (!toggle && !opened.some(Boolean) && opened.length) opened[0] = true;
    const variant = ["ghost", "filled", "outline"].includes(p.variant) ? p.variant : "ghost";
    const size = ["sm", "md", "lg"].includes(p.size) ? p.size : "md";
    const content = items.map((item: any, i: number) => `<div class="accordion-item"><button type="button" id="${name}-button-${i}" data-accordion-toggle aria-expanded="${opened[i]}" aria-controls="${name}-panel-${i}">${esc(String(item.title || ""))}</button><div class="accordion-panel" id="${name}-panel-${i}" role="region" aria-labelledby="${name}-button-${i}"${opened[i] ? "" : " hidden"}>${nl2br(String(item.content || ""))}</div></div>`).join("");
    return `<div class="site-accordion site-accordion-${variant} site-accordion-${size}" data-accordion data-multiple="${multiple}" data-toggle="${toggle}">${content}</div>`;
  },
};
const Share: BlockSpec = {
  id: "share", name: "Поделиться", defaults: {}, render: () => null,
  serialize: p => {
    const labels: Record<string, string> = { copy: "Копировать ссылку", telegram: "Telegram", vk: "ВКонтакте", twitter: "X / Twitter", facebook: "Facebook" };
    const networks = [...new Set((Array.isArray(p.networks) ? p.networks : []).filter((n: any) => typeof n === "string" && Object.hasOwn(labels, n)))];
    const buttons = networks.map((network: any) => network === "copy"
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
    const items = Array.isArray(p.items) ? p.items : [];
    const active = String(p.activeHref || items[0]?.href || "");
    const links = items.map((item: any) => `<li><a data-anchor href="${esc(String(item.href || "#"))}"${item.href === active ? ' aria-current="location"' : ""}>${esc(String(item.label || ""))}</a></li>`).join("");
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
    const slides = Array.isArray(p.slides) ? p.slides : [];
    const initial = Math.max(0, Math.min(slides.length - 1, Math.floor(Number(p.initial) || 0)));
    const content = slides.map((slide: any, i: number) => `<figure data-carousel-slide${i === initial ? "" : " hidden"}>${slide.src ? `<img src="${esc(String(slide.src))}" alt="${esc(String(slide.alt || ""))}" loading="lazy" referrerpolicy="no-referrer"/>` : ""}${slide.caption ? `<figcaption>${esc(String(slide.caption))}</figcaption>` : ""}</figure>`).join("");
    const controls = slides.length > 1 ? `<div class="carousel-controls"><button type="button" data-carousel-command="previous" aria-label="Предыдущий слайд">‹</button><span data-carousel-status role="status" aria-live="polite">Слайд ${initial + 1} из ${slides.length}</span><button type="button" data-carousel-command="next" aria-label="Следующий слайд">›</button></div>` : "";
    return `<section class="site-carousel" data-carousel aria-label="Карусель"><div data-carousel-track>${content}</div>${controls}</section>`;
  },
};
const MediaCarousel: BlockSpec = {
  id: "mediacarousel", name: "Медиакарусель", defaults: {}, render: () => null,
  serialize: p => {
    const slides = Array.isArray(p.slides) ? p.slides : [];
    const initial = Math.max(0, Math.min(slides.length - 1, Math.floor(Number(p.initial) || 0)));
    const content = slides.map((slide: any, i: number) => `<figure data-carousel-slide${i === initial ? "" : " hidden"}>${slide.src ? slide.kind === "video" ? `<video src="${esc(String(slide.src))}" controls preload="none"></video>` : `<img src="${esc(String(slide.src))}" alt="${esc(String(slide.alt || ""))}" loading="lazy" referrerpolicy="no-referrer"/>` : ""}${slide.caption ? `<figcaption>${esc(String(slide.caption))}</figcaption>` : ""}</figure>`).join("");
    const controls = slides.length > 1 ? `<div class="carousel-controls"><button type="button" data-carousel-command="previous" aria-label="Предыдущий слайд">‹</button><span data-carousel-status role="status" aria-live="polite">Слайд ${initial + 1} из ${slides.length}</span><button type="button" data-carousel-command="next" aria-label="Следующий слайд">›</button></div>` : "";
    return `<section class="site-carousel" data-carousel aria-label="Медиакарусель"><div data-carousel-track>${content}</div>${controls}</section>`;
  },
};
const Hotspot: BlockSpec = {
  id: "hotspot", name: "Изображение с маркерами", defaults: {}, render: () => null,
  serialize: p => {
    const name = typeof p.__hotspotClass === "string" && /^sb-hotspot-\d+$/.test(p.__hotspotClass) ? p.__hotspotClass : "sb-hotspot-0";
    const markers = Array.isArray(p.markers) ? p.markers : [];
    return `<div class="site-hotspot">${p.src ? `<img src="${esc(String(p.src))}" alt="${esc(String(p.alt || ""))}" referrerpolicy="no-referrer"/>` : '<div class="site-hotspot-empty">Изображение не указано</div>'}${markers.map((marker: any, index: number) => marker.href ? `<a class="site-hotspot-marker ${name}-${index}" href="${esc(String(marker.href))}" aria-label="${esc(String(marker.label || "Маркер"))}" title="${esc(String(marker.label || "Маркер"))}">●</a>` : `<span class="site-hotspot-marker ${name}-${index}" aria-label="${esc(String(marker.label || "Маркер"))}" title="${esc(String(marker.label || "Маркер"))}">●</span>`).join("")}</div>`;
  },
};
const VideoPlaylist: BlockSpec = {
  id: "videoplaylist", name: "Видеоплейлист", defaults: {}, render: () => null,
  serialize: p => {
    const items = Array.isArray(p.items) ? p.items : [];
    const initial = Math.max(0, Math.min(items.length - 1, Math.floor(Number(p.initial) || 0)));
    const videos = items.map((item: any, index: number) => `<div data-playlist-item${index === initial ? "" : " hidden"}>${item.src ? `<video controls preload="none" src="${esc(String(item.src))}"${item.poster ? ` poster="${esc(String(item.poster))}"` : ""}></video>` : '<p>Видео не указано</p>'}</div>`).join("");
    const buttons = items.map((item: any, index: number) => `<button type="button" data-playlist-select="${index}" aria-pressed="${index === initial ? "true" : "false"}">${esc(String(item.title || `Видео ${index + 1}`))}</button>`).join("");
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
    const slides = Array.isArray(p.slides) ? p.slides : [];
    const initial = Math.max(0, Math.min(slides.length - 1, Math.floor(Number(p.initial) || 0)));
    const content = slides.map((slide: any, i: number) => `<article class="text-slide" data-carousel-slide${i === initial ? "" : " hidden"}>${slide.title ? `<h3>${esc(String(slide.title))}</h3>` : ""}${slide.text ? `<p>${nl2br(String(slide.text))}</p>` : ""}${slide.ctaLabel && slide.ctaHref ? `<a class="btn" href="${esc(String(slide.ctaHref))}">${esc(String(slide.ctaLabel))}</a>` : ""}</article>`).join("");
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
};

// API реестра
export function listBlocks(): BlockSpec[] {
  return Object.values(BLOCKS);
}

export function getBlock(id: string): BlockSpec | undefined {
  return BLOCKS[id];
}

export function serializeBlock(id: string, props: Record<string, any>): string {
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
