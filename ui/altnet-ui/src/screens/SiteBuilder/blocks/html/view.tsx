// src/screens/SiteBuilder/blocks/html/view.tsx
import type { HtmlBlock } from "../../types";

/** Жёсткий allowlist-санитайзер без внешних библиотек. */
function sanitize(html: string): string {
  const allowedTags = new Set(["p","b","i","strong","em","a","ul","ol","li","code","pre","br","h1","h2","h3","h4","span"]);
  const allowedAttrs: Record<string, Set<string>> = {
    a: new Set(["href","rel","target"]),
    span: new Set([]),
    code: new Set([]),
    pre: new Set([]),
    p: new Set([]),
    b: new Set([]),
    i: new Set([]),
    strong: new Set([]),
    em: new Set([]),
    ul: new Set([]),
    ol: new Set([]),
    li: new Set([]),
    h1: new Set([]),
    h2: new Set([]),
    h3: new Set([]),
    h4: new Set([]),
    br: new Set([]),
  };

  const doc = new DOMParser().parseFromString(html, "text/html");
  function walk(node: Node): Node | null {
    if (node.nodeType === Node.TEXT_NODE) return node.cloneNode();
    if (node.nodeType !== Node.ELEMENT_NODE) return null;

    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();
    if (!allowedTags.has(tag)) return document.createTextNode(el.textContent || "");

    const clean = document.createElement(tag);
    // только разрешённые атрибуты
    const allow = allowedAttrs[tag] || new Set<string>();
    for (const attr of Array.from(el.attributes)) {
      if (!allow.has(attr.name)) continue;
      // a[href] — фильтруем javascript:
      if (tag === "a" && attr.name === "href") {
        const v = (attr.value || "").trim();
        const lower = v.toLowerCase();
        if (lower.startsWith("javascript:")) continue;
        clean.setAttribute("href", v);
        clean.setAttribute("rel", "noopener noreferrer nofollow");
        clean.setAttribute("target", "_blank");
        continue;
      }
      clean.setAttribute(attr.name, attr.value);
    }

    // без inline-стилей и обработчиков событий
    for (const ch of Array.from(el.childNodes)) {
      const c = walk(ch);
      if (c) clean.appendChild(c);
    }
    return clean;
  }

  const out = document.createElement("div");
  for (const n of Array.from(doc.body.childNodes)) {
    const c = walk(n);
    if (c) out.appendChild(c);
  }
  return out.innerHTML;
}

export default function HtmlView({ block }: { block: HtmlBlock }) {
  const safe = sanitize(block.html || "");
  return (
    <div className="prose prose-invert max-w-none prose-p:my-2 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:bg-[#0f1630]">
      {/* Санитизированная разметка */}
      <div dangerouslySetInnerHTML={{ __html: safe }} />
    </div>
  );
}
