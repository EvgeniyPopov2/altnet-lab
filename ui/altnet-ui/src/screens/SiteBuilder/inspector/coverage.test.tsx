import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { paletteMeta } from "../palette/blocksMeta";
import { createDefaultBlock } from "../registry";
import type { BlockType } from "../types";
import ContentTab from "./tabs/ContentTab";
import StyleTab from "./tabs/StyleTab";

describe("панели доступных виджетов", () => {
  const entries = paletteMeta.filter(item => item.type !== "unsupported");
  it.each(entries.map(item => [item.title, item.type] as const))("%s: доступны общие настройки стиля", (_title, type) => {
    const block = createDefaultBlock(type as BlockType, [1]);
    const html = renderToStaticMarkup(<StyleTab block={block} device="desktop" onPatch={() => {}} />);
    expect(html).toContain("Внутренний отступ сверху");
    expect(html).toContain("Непрозрачность блока");
    expect(html).toContain('type="range"');
  });
  it("каждый виджет палитры открывает собственные настройки содержимого", () => {
    const missing = entries.filter(item => {
      const block = createDefaultBlock(item.type as BlockType, [1]);
      return renderToStaticMarkup(<ContentTab block={block} device="desktop" onPatch={() => {}} />).includes("редактор Content будет добавлен");
    }).map(item => item.type);
    expect(missing).toEqual([]);
  });
});
