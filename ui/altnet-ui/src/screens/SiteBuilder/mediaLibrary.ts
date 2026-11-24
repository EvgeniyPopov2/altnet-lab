import { tryReencodeToPng } from "../../builder/cdr";
import { fileToCid } from "../../core/content/cid";
import { isRecord } from "../../core/records";
import { cellsOf } from "./layoutTree";
import type { Block, Doc, MediaAsset } from "./types";

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const pngPrefix = "data:image/png;base64,";
export const imageFileTypes = "image/png,image/jpeg,image/webp,image/gif";

export function validMediaLibrary(value: unknown): value is MediaAsset[] {
  if (!Array.isArray(value)) return false;
  const ids = new Set<string>();
  return value.every((asset) => {
    if (
      !isRecord(asset) ||
      typeof asset.id !== "string" ||
      !/^cidv1-sha256-[0-9a-f]{64}$/.test(asset.id) ||
      ids.has(asset.id) ||
      typeof asset.name !== "string" ||
      typeof asset.alt !== "string" ||
      typeof asset.caption !== "string" ||
      typeof asset.dataUrl !== "string" ||
      asset.dataUrl.length > pngPrefix.length + Math.ceil(MAX_IMAGE_BYTES / 3) * 4 ||
      !asset.dataUrl.startsWith(pngPrefix + "iVBORw0KGgo") ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(asset.dataUrl.slice(pngPrefix.length)) ||
      (asset.dataUrl.length - pngPrefix.length) % 4 !== 0
    )
      return false;
    ids.add(asset.id);
    return true;
  });
}

export async function prepareMediaAsset(file: File): Promise<MediaAsset> {
  const image = await tryReencodeToPng(file);
  if (image.size > MAX_IMAGE_BYTES)
    throw new Error("После обработки изображение больше 2 МиБ. Уменьшите его размер и выберите снова.");
  const [id, dataUrl] = await Promise.all([
    fileToCid(image),
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () =>
        typeof reader.result === "string"
          ? resolve(reader.result)
          : reject(new Error("Не удалось прочитать изображение."));
      reader.onerror = () => reject(new Error("Не удалось прочитать изображение."));
      reader.readAsDataURL(image);
    }),
  ]);
  return { id, name: file.name, dataUrl, alt: "", caption: "" };
}

export function addMediaAsset(doc: Doc, asset: MediaAsset): Doc {
  if (doc.mediaLibrary?.some((item) => item.id === asset.id)) return doc;
  return { ...doc, mediaLibrary: [...(doc.mediaLibrary ?? []), asset] };
}

export function deleteMediaAsset(doc: Doc, id: string): Doc {
  if (!doc.mediaLibrary?.some((item) => item.id === id)) return doc;
  return { ...doc, mediaLibrary: doc.mediaLibrary.filter((item) => item.id !== id) };
}

export function editMediaAsset(
  doc: Doc,
  id: string,
  patch: Partial<Pick<MediaAsset, "name" | "caption" | "alt">>
): Doc {
  const original = doc.mediaLibrary?.find((item) => item.id === id);
  if (!original) return doc;
  const updated = { ...original, ...patch };
  function updateBlocks(blocks: Block[]): Block[] {
    let changed = false;
    const next = blocks.map((block) => {
      if (block.type === "img" && block.mediaId === id) {
        changed = true;
        return {
          ...block,
          mediaCaption: updated.caption,
          alt: (block.alt ?? "") === original?.alt ? updated.alt : block.alt,
        };
      }
      const cells = cellsOf(block);
      if (!cells) return block;
      const layoutCells = cells.map(updateBlocks);
      if (layoutCells.every((cell, index) => cell === cells[index])) return block;
      changed = true;
      return { ...block, layoutCells };
    });
    return changed ? next : blocks;
  }
  return {
    ...doc,
    mediaLibrary: doc.mediaLibrary!.map((item) => (item.id === id ? updated : item)),
    blocks: updateBlocks(doc.blocks),
    ...(doc.sitePages && {
      sitePages: {
        ...doc.sitePages,
        pages: doc.sitePages.pages.map((page) => {
          if (!page.document) return page;
          const blocks = updateBlocks(page.document.blocks);
          return blocks === page.document.blocks ? page : { ...page, document: { ...page.document, blocks } };
        }),
      },
    }),
  };
}

export function imageCaption(image: { captionSource?: unknown; mediaCaption?: unknown; caption?: unknown }): string {
  const caption =
    image.captionSource === "none" ? "" : image.captionSource === "media" ? image.mediaCaption : image.caption;
  return typeof caption === "string" ? caption : "";
}
