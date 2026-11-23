import type { Block } from "./types";

const mediaKeys = new Set(["src", "cid", "img", "poster", "avatar"]);
const localMedia = /^data:(?:image\/(?:png|jpeg|webp|gif)|video\/(?:mp4|webm)|audio\/(?:mpeg|ogg|wav));base64,/i;

/** В редакторе до подключения проверенного транспорта отображаем только локальные медиа. */
export function previewSafeBlock(block: Block): Block {
  function visit(value: any, key = ""): any {
    if (mediaKeys.has(key) && typeof value === "string") return !value || localMedia.test(value.trim()) ? value : "";
    if (Array.isArray(value)) return value.map(item => visit(item));
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, name === "layoutCells" ? item : visit(item, name)]));
    return value;
  }
  return visit(block) as Block;
}

export function hasBlockedPreviewAssets(blocks: Block[]): boolean {
  const visit = (value: any, key = ""): boolean => {
    if (mediaKeys.has(key) && typeof value === "string") return Boolean(value.trim() && !localMedia.test(value.trim()));
    if (Array.isArray(value)) return value.some(item => visit(item));
    if (value && typeof value === "object") {
      if (value.type === "shortcode" && typeof value.code === "string" && value.code.trim()) return true;
      return Object.entries(value).some(([name, item]) => visit(item, name));
    }
    return false;
  };
  return visit(blocks);
}
