// src/screens/SiteBuilder/blocks/heading/view.tsx
import type { HeadingBlock } from "../../types";
import { createElement } from "react";
import { sanitizeHref } from "../../../../builder/cdr";

export default function HeadingView({ block }: { block: HeadingBlock }) {
  const align =
    block.align === "center" ? "text-center" : block.align === "right" ? "text-right" : "text-left";

  const text = block.text || "Заголовок";
  const tags = ["h1", "h2", "h3", "h4", "h5", "h6", "div", "span", "p"] as const;
  const tag = tags.includes(block.level as typeof tags[number]) ? block.level! : "h2";
  const contents = typeof block.href === "string" && block.href.trim() ? <a href={sanitizeHref(block.href)} onClick={event => event.preventDefault()}>{text}</a> : text;
  return createElement(tag, { className: `${tag === "span" ? "block " : ""}${align}`, "data-heading-text": true }, contents);
}
