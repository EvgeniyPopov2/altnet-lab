// ui/altnet-ui/src/builder/registry.ts
// Единый реестр блоков конструктора.
// Версия без JSX — рендер через React.createElement, чтобы файл оставался .ts.

import React from "react";

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
  <div class="mt-16">
    <a class="btn" href="${esc(p.ctaHref)}"${p.ctaRel ? ` rel="${esc(p.ctaRel)}"` : ""}${p.ctaTarget ? ` target="${esc(p.ctaTarget)}"` : ""}>${esc(p.ctaLabel)}</a>
  </div>
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

// === Heading (H2–H4)
const Heading: BlockSpec = {
  id: "heading",
  name: "Заголовок (H2–H4)",
  defaults: {
    text: "Заголовок секции",
    level: "h2",                 // h2 | h3 | h4
    align: "left" as "left" | "center" | "right",
  },
  render: ({ props }) => {
    const p = { ...Heading.defaults, ...(props || {}) };
    const lvl = p.level === "h3" || p.level === "h4" ? p.level : "h2";
    const Tag: any = lvl;
    return React.createElement(
      "section",
      { className: `section t-${p.align || "left"}` },
      React.createElement(Tag, null, String(p.text || ""))
    );
  },
  serialize: (props) => {
    const p = { ...Heading.defaults, ...(props || {}) };
    const lvl = p.level === "h3" || p.level === "h4" ? p.level : "h2";
    const align = p.align || "left";
    return `<section class="section t-${esc(align)}"><${lvl}>${esc(String(p.text || ""))}</${lvl}></section>`;
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
    return `<section class="section"><img class="responsive" src="${esc(p.src)}" alt="${esc(p.alt)}" loading="lazy" decoding="async" referrerpolicy="no-referrer"/></section>`;
  },
};

const Button: BlockSpec = {
  id: "button",
  name: "Кнопка",
  defaults: { label: "Кнопка", href: "#", variant: "primary", align: "center" },
  render: ({ props }) => {
    const p = { ...Button.defaults, ...props };
    const clsBtn = p.variant === "secondary" ? "btn secondary" : "btn";
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
    const clsBtn = p.variant === "secondary" ? "btn secondary" : "btn";
    const clsSec = `section t-${p.align || "center"}`;
    return `<section class="${clsSec}"><a class="${clsBtn}" href="${esc(p.href)}"${p.rel ? ` rel="${esc(p.rel)}"` : ""}${p.target ? ` target="${esc(p.target)}"` : ""}>${esc(String(p.label))}</a></section>`;
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
    return `<div class="spacer spacer-${esc(p.size || "md")}"></div>`;
  },
};

// === Divider (тонкая линия)
const Divider: BlockSpec = {
  id: "divider",
  name: "Разделитель",
  defaults: {},
  render: () => React.createElement("hr", { className: "divider" }),
  serialize: () => `<hr class="divider"/>`,
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
    return `<section class="${cls}">${title}${text}</section>`;
  },
};

// === Grid 1–4 (галерея карточек)
const Grid: BlockSpec = {
  id: "grid",
  name: "Сетка 1–4",
  defaults: {
    cols: 3 as 1 | 2 | 3 | 4,
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
    return React.createElement("section", { className: "section" },
      React.createElement("div", { className: wrapCls }, ...children)
    );
  },
  serialize: (props) => {
    const p = { ...Grid.defaults, ...(props || {}) };
    const cols = (p.cols >= 1 && p.cols <= 4 ? p.cols : 3) as 1 | 2 | 3 | 4;
    const wrapCls = `grid-wrap gc-${cols}`;
    const items = (Array.isArray(p.items) ? p.items : []).map((it) => {
      const src = esc(String(it?.src || ""));
      const alt = esc(String(it?.alt || ""));
      const caption = it?.caption ? `<figcaption class="body">${esc(String(it.caption))}</figcaption>` : "";
      return `<figure class="grid-card"><img src="${src}" alt="${alt}"/>${caption}</figure>`;
    }).join("");
    return `<section class="section"><div class="${wrapCls}">${items}</div></section>`;
  },
};

// Регистр
const BLOCKS: Record<string, BlockSpec> = {
  [Hero.id]: Hero,
  [H1.id]: H1,
  [Heading.id]: Heading,
  [Text.id]: Text,
  [Image.id]: Image,
  [Button.id]: Button,
  [Cols2.id]: Cols2,
  [Spacer.id]: Spacer,
  [Divider.id]: Divider,
  [Section.id]: Section,
  [Grid.id]: Grid,
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
  return spec.serialize(props || {});
}

// Совместимость: дефолтный экспорт как реестр
const registry = {
  list: listBlocks,
  get: getBlock,
  serialize: serializeBlock,
};

export default registry;
