import { describe, expect, it } from "vitest";
import { resolveResponsiveStyle } from "./responsiveStyle";

describe("наследование адаптивных стилей", () => {
  it("наследует значения сверху вниз и применяет общий вертикальный отступ нового уровня", () => {
    const base = { pt: 20, pb: 30 };
    const by = { tablet: { py: 10 }, mobile: { pt: 4 } };
    expect(resolveResponsiveStyle(base, by, "desktop")).toMatchObject({ pt: 20, pb: 30 });
    expect(resolveResponsiveStyle(base, by, "tablet")).toMatchObject({ pt: 10, pb: 10 });
    expect(resolveResponsiveStyle(base, by, "mobile")).toMatchObject({ pt: 4, pb: 10 });
  });
  it("не воспринимает некорректные слои как набор свойств", () => {
    expect(resolveResponsiveStyle(null, { desktop: "invalid", tablet: [] }, "tablet")).toEqual({});
  });
});
