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
          { style: { marginTop: 12 } },
          React.createElement(
            "a",
            { className: "btn", href: p.ctaHref },
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
    <a class="btn" href="${esc(p.ctaHref)}">${esc(p.ctaLabel)}</a>
  </div>
</section>`.trim();
  },
};

const H1: BlockSpec = {
  id: "h1",
  name: "Заголовок H1",
  defaults: { text: "Заголовок раздела" },
  render: ({ props }) => {
    const p = { ...H1.defaults, ...props };
    return React.createElement(
      "section",
      { className: "section" },
      React.createElement("h1", null, p.text)
    );
  },
  serialize: (props) => {
    const p = { ...H1.defaults, ...props };
    return `<section class="section"><h1>${esc(p.text)}</h1></section>`;
  },
};

const Text: BlockSpec = {
  id: "text",
  name: "Текст",
  defaults: { text: "Здесь может быть ваш текст.\nМного текста." },
  render: ({ props }) => {
    const p = { ...Text.defaults, ...props };
    // Для предпросмотра: просто <p> без nl2br — предпросмотр у тебя свой (SafePreview).
    return React.createElement(
      "section",
      { className: "section" },
      React.createElement("p", null, p.text)
    );
  },
  serialize: (props) => {
    const p = { ...Text.defaults, ...props };
    return `<section class="section"><p>${nl2br(p.text)}</p></section>`;
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
        src: p.src,
        alt: p.alt,
      })
    );
  },
  serialize: (props) => {
    const p = { ...Image.defaults, ...props };
    return `<section class="section"><img class="responsive" src="${esc(
      p.src
    )}" alt="${esc(p.alt)}"/></section>`;
  },
};

const Button: BlockSpec = {
  id: "button",
  name: "Кнопка",
  defaults: { label: "Кнопка", href: "#" },
  render: ({ props }) => {
    const p = { ...Button.defaults, ...props };
    return React.createElement(
      "section",
      { className: "section" },
      React.createElement(
        "a",
        { className: "btn", href: p.href },
        String(p.label)
      )
    );
  },
  serialize: (props) => {
    const p = { ...Button.defaults, ...props };
    return `<section class="section"><a class="btn" href="${esc(
      p.href
    )}">${esc(String(p.label))}</a></section>`;
  },
};

// Регистр
const BLOCKS: Record<string, BlockSpec> = {
  [Hero.id]: Hero,
  [H1.id]: H1,
  [Text.id]: Text,
  [Image.id]: Image,
  [Button.id]: Button,
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
