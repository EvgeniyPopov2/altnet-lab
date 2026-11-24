import { describe, expect, it } from "vitest";
import { hasBlockedPreviewAssets, previewSafeBlock } from "./previewAssets";
import type { Block } from "./types";

describe("безопасный предпросмотр медиа", () => {
  it("не передаёт внешний адрес виджету и не меняет исходный документ", () => {
    const block: Block = { id: "image", type: "img", cid: "https://example.org/a.png", src: "https://example.org/new.png" };
    expect(previewSafeBlock(block)).toMatchObject({ cid: "", src: "" });
    expect(block.src).toBe("https://example.org/new.png");
    expect(hasBlockedPreviewAssets([block])).toBe(true);
  });
  it("сохраняет локальные изображения и защищает вложенные списки", () => {
    const data = "data:image/png;base64,UElD";
    const block: Block = { id: "gallery", type: "gallery", items: [{ id: "a", src: data }, { id: "b", src: "https://example.org/image" }] };
    expect(previewSafeBlock(block)).toMatchObject({ items: [{ src: data }, { src: "" }] });
    expect(hasBlockedPreviewAssets([block])).toBe(true);
    expect(hasBlockedPreviewAssets([{ id: "local", type: "img", cid: data }])).toBe(false);
  });
  it("не считает произвольный SVG и относительные адреса подтверждёнными локальными медиа", () => {
    const blocks: Block[] = [{ id: "a", type: "img", cid: "data:image/svg+xml,<svg/>" }, { id: "b", type: "img", cid: "/image" }];
    expect(blocks.map(previewSafeBlock)).toMatchObject([{ cid: "" }, { cid: "" }]);
  });
});
