import { describe, expect, it } from "vitest";
import { adaptFromSiteBuilderDoc, exportSingleHtml } from "../../builder/exporter";
import { blockFilterStyle, filterTransition } from "./blockFilters";
import { resolveResponsiveStyle } from "./responsiveStyle";

describe("цветовые эффекты блока", () => {
  it("проверяет диапазоны, отключение и наследование эффекта при наведении", () => {
    expect(blockFilterStyle({})).toEqual({});
    expect(blockFilterStyle({ blockFilterMode: "none" })).toEqual({ filter: "none" });
    const style = { blockFilterMode: "on", blockFilterBrightness: 65, hoverFilterContrast: 150, hoverFilterMode: "on" };
    expect(blockFilterStyle(style).filter).toContain("brightness(65%)");
    expect(blockFilterStyle(style, true).filter).toContain("brightness(65%) contrast(150%)");
    expect(blockFilterStyle({ ...style, hoverFilterMode: "none" }, true)).toEqual({ filter: "none" });
    expect(blockFilterStyle({ blockFilterMode: "on", blockFilterBrightness: 999 }).filter).toContain("brightness(200%)");
    expect(blockFilterStyle({ blockFilterMode: "on", blockFilterBrightness: "1);url(https://bad)" }).filter).toContain("brightness(100%)");
  });
  it("сохраняет отдельные длительности трансформации и фильтра", () => {
    expect(filterTransition({ transformDuration: 400, blockFilterDuration: 800 })).toEqual({ transition: "transform 400ms, transform-origin 400ms, filter 800ms" });
  });
  it("экспортирует обычное и наведённое состояние и отключение на телефоне", async () => {
    const styles = { desktop: { blockFilterMode: "on", blockFilterBrightness: 60, hoverFilterMode: "on", hoverFilterContrast: 150, blockFilterDuration: 300 }, mobile: { blockFilterMode: "none", hoverFilterMode: "none" } };
    expect(blockFilterStyle(resolveResponsiveStyle({}, styles, "mobile"))).toEqual({ filter: "none" });
    const html = await (await exportSingleHtml(adaptFromSiteBuilderDoc({ blocks: [{ id: "p", type: "p", text: "Текст", styleByBp: styles }] }), { bundleAssets: false })).text();
    expect(html).toContain("filter:brightness(60%)");
    expect(html).toContain("contrast(150%)");
    expect(html).toContain("filter:none");
    expect(html).toContain("prefers-reduced-motion:reduce");
  });
});
