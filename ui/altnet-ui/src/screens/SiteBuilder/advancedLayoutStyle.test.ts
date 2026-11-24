import { describe, expect, it } from "vitest";
import { advancedLayoutStyle } from "./advancedLayoutStyle";
import { resolveResponsiveStyle } from "./responsiveStyle";
import { adaptFromSiteBuilderDoc, exportSingleHtml } from "../../builder/exporter";

describe("адаптивное расположение", () => {
  it("проверяет значения и сохраняет нулевой порядок наложения", () => {
    expect(advancedLayoutStyle({ overflowMode: "clip", layerOrder: 0, mouseCursor: "pointer", stackingIsolation: "isolate" }))
      .toEqual({ overflow: "clip", position: "relative", zIndex: 0, cursor: "pointer", isolation: "isolate" });
    expect(advancedLayoutStyle({ overflowMode: "hidden; color:red", layerOrder: 1.5, mouseCursor: "url(https://bad)", stackingIsolation: "bad" })).toEqual({});
  });
  it("наследует и переопределяет значения для экранов и экспортирует их", async () => {
    const styles = { desktop: { overflowMode: "hidden", layerOrder: 2 }, mobile: { overflowMode: "auto", layerOrder: 0 } };
    expect(advancedLayoutStyle(resolveResponsiveStyle({}, styles, "tablet"))).toMatchObject({ overflow: "hidden", zIndex: 2 });
    expect(advancedLayoutStyle(resolveResponsiveStyle({}, styles, "mobile"))).toMatchObject({ overflow: "auto", zIndex: 0 });
    const model = adaptFromSiteBuilderDoc({ blocks: [{ id: "p", type: "p", text: "Тест", styleByBp: styles }] });
    const html = await (await exportSingleHtml(model, { bundleAssets: false })).text();
    expect(html).toContain("overflow:hidden");
    expect(html).toContain("overflow:auto");
    expect(html).toContain("z-index:0");
    expect(html).toContain("@media(max-width:767px)");
  });
  it("применяет относительное положение и разрешённые единицы", async () => {
    const desktop = { positionMode: "relative", positionT: 12, positionL: -25, positionUnit: "%", layerOrder: 2 };
    expect(advancedLayoutStyle(desktop)).toMatchObject({ position: "relative", top: "12%", left: "-25%", zIndex: 2 });
    expect(advancedLayoutStyle({ positionMode: "relative", positionUnit: "px; color:red", positionT: Infinity, positionR: 6000 }))
      .toEqual({ position: "relative", right: "5000px" });
    const styles = { desktop, mobile: { positionMode: "normal" } };
    expect(advancedLayoutStyle(resolveResponsiveStyle({}, styles, "mobile"))).toMatchObject({ position: "static", zIndex: 2 });
    const html = await (await exportSingleHtml(adaptFromSiteBuilderDoc({ blocks: [{ id: "p", type: "p", text: "Текст", styleByBp: styles }] }), { bundleAssets: false })).text();
    expect(html).toContain("position:relative;top:12%;left:-25%");
    expect(html).toContain("position:static;z-index:2");
  });
});
