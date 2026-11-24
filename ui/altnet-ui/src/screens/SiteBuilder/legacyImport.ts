import { isRecord } from "../../core/records";
import { createDefaultBlock, newId } from "./registry";
import { validateDraft } from "./storage";
import type { BlockType, Doc } from "./types";

const known = new Set<BlockType>(["hero", "h1", "heading", "p", "btn", "img", "divider", "spacer", "cols2", "section", "grid", "icon", "iconlist", "alert", "html", "code", "tabs", "accordion", "blockquote", "cta", "rating", "counter", "progress", "breadcrumbs", "pagination", "social", "iconbox", "imagebox", "pricelist", "testimonials", "share", "progresstracker", "anchor", "toc", "video", "gallery", "carousel", "countdown", "menu", "search", "contentnav", "map", "lottie", "mediacarousel", "slides", "videoplaylist", "hotspot", "container", "sidebar", "offcanvas", "shortcode", "pricetable", "loopgrid", "readmore", "textpath", "soundcloud"]);
const aliases: Record<string, BlockType> = { text: "p", button: "btn", image: "img" };

/** Старые JSON могут хранить поля внутри props или непосредственно в блоке. Ничего не отбрасываем молча. */
export function importLegacyDoc(value: unknown): Doc {
  if (!isRecord(value)) throw new Error("Ожидался объект с массивом blocks.");
  const input = value;
  if (input.format !== undefined) throw new Error("Неизвестный формат документа; текущая страница не изменена.");
  if (!Array.isArray(input.blocks)) throw new Error("Ожидался объект с массивом blocks.");
  let count = 0;
  const convert = (entry: unknown, depth: number): Record<string, unknown> => {
    if (!isRecord(entry) || depth > 64 || ++count > 50000) throw new Error("Структура блоков повреждена или слишком глубока.");
    const originalType = typeof entry.type === "string" ? entry.type : "";
    const type = aliases[originalType] || originalType as BlockType;
    if (!known.has(type)) throw new Error(`Неизвестный тип блока: ${originalType || "без типа"}. Исходный документ не изменён.`);
    if (entry.props !== undefined && !isRecord(entry.props)) throw new Error(`Некорректные свойства блока ${originalType}.`);
    const props = entry.props || {};
    const metadata = props.__builder && typeof props.__builder === "object" ? props.__builder : {};
    const block: Record<string, unknown> = { ...createDefaultBlock(type), ...entry, ...props, ...metadata, type, id: typeof entry.id === "string" && entry.id ? entry.id : newId("import") };
    if (type === "img") { const src = props.src ?? props.cid ?? entry.src ?? entry.cid ?? ""; block.src = src; block.cid = src; }
    if (type === "btn") { block.label = props.label ?? props.text ?? entry.label ?? entry.text ?? block.label; block.href = props.href ?? props.url ?? entry.href ?? entry.url ?? block.href; }
    if (type === "h1") block.text = props.text ?? props.title ?? entry.text ?? entry.title ?? block.text;
    if (!Array.isArray(entry.layoutPreset) && !Array.isArray(props.layoutPreset) && Array.isArray(props.layoutWeights)) block.layoutPreset = props.layoutWeights;
    if (block.layoutCells !== undefined) {
      if (!Array.isArray(block.layoutCells) || !block.layoutCells.every(Array.isArray)) throw new Error("Некорректные ячейки макета.");
      block.layoutCells = block.layoutCells.map((cell: unknown[]) => cell.map(child => convert(child, depth + 1)));
    }
    return block;
  };
  const doc = { ...input, title: typeof input.title === "string" ? input.title : "Мой сайт", blocks: input.blocks.map((block: unknown) => convert(block, 0)) };
  const checked = validateDraft(doc);
  if (checked.status !== "loaded") throw new Error("Документ повреждён или содержит повторяющиеся ID; исходный документ не изменён.");
  return checked.doc;
}
