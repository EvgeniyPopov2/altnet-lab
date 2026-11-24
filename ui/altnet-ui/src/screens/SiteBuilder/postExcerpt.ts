import { cellsOf } from "./layoutTree";
import type { Block, PageDocument } from "./types";

export function moreFragment(id: string): string {
  // Block IDs can come from older projects and may contain Cyrillic or punctuation.
  let hash = 2166136261;
  for (const char of id) hash = Math.imul(hash ^ char.codePointAt(0)!, 16777619);
  return "more-" + (hash >>> 0).toString(36);
}

export function postExcerpt(doc: PageDocument) {
  const text: string[] = [];
  function walk(blocks: Block[]): { label: string; fragment: string } | undefined {
    for (const block of blocks) {
      if (block.hidden) continue;
      if (block.type === "readmore")
        return { label: block.label?.trim() || "Читать дальше", fragment: moreFragment(block.id) };
      if (
        block.type === "p" ||
        block.type === "heading" ||
        block.type === "h1" ||
        block.type === "blockquote" ||
        block.type === "textpath"
      ) {
        if (block.text) text.push(block.text);
      }
      if (block.type === "section") {
        if (block.title) text.push(block.title);
        if (block.text) text.push(block.text);
      }
      for (const cell of cellsOf(block) ?? []) {
        const marker = walk(cell);
        if (marker) return marker;
      }
    }
  }
  const more = walk(doc.blocks);
  return { excerpt: more ? text.join(" ").trim() || doc.description || "" : doc.description || "", more };
}
