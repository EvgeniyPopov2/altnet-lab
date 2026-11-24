import { describe, expect, it } from "vitest";
import { adaptFromSiteBuilderDoc, exportSingleHtml } from "../../builder/exporter";
import { resolveResponsiveStyle } from "./responsiveStyle";
import { backgroundStyle } from "./backgroundStyle";

describe("градиент фона", () => {
  it("создаёт линейный и радиальный фон и проверяет значения из документа", () => {
    expect(backgroundStyle({ backgroundType: "linear", gradientFrom: "#ff0000", gradientTo: "#00ff00", gradientAngle: 90, gradientStart: 20, gradientEnd: 80 }))
      .toEqual({ backgroundImage: "linear-gradient(90deg, #ff0000 20%, #00ff00 80%)" });
    expect(backgroundStyle({ backgroundType: "radial", gradientX: 20, gradientY: 70 }))
      .toEqual({ backgroundImage: "radial-gradient(ellipse at 20% 70%, #6e59f2 0%, #d9d1ff 100%)" });
    expect(backgroundStyle({ backgroundType: "none" })).toEqual({ backgroundImage: "none" });
    expect(backgroundStyle({})).toEqual({});
    expect(backgroundStyle({ backgroundType: "linear", gradientFrom: "red);url(https://bad)", gradientAngle: Infinity }).backgroundImage)
      .toBe("linear-gradient(180deg, #6e59f2 0%, #d9d1ff 100%)");
  });
  it("сохраняет наследование и отключение фона на телефоне в экспортированном HTML", async () => {
    const styles = { desktop: { backgroundType: "linear", gradientAngle: 45 }, mobile: { backgroundType: "none" } };
    expect(backgroundStyle(resolveResponsiveStyle({}, styles, "tablet")).backgroundImage).toContain("45deg");
    expect(backgroundStyle(resolveResponsiveStyle({}, styles, "mobile")).backgroundImage).toBe("none");
    const model = adaptFromSiteBuilderDoc({ blocks: [{ id: "p", type: "p", text: "Тест", styleByBp: styles }] });
    const html = await (await exportSingleHtml(model, { bundleAssets: false })).text();
    expect(html).toContain("background-image:linear-gradient(45deg");
    expect(html).toContain("background-image:none");
    expect(html).toContain("@media(max-width:767px)");
  });
});
