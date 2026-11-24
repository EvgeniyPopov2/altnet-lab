import { describe, expect, it } from "vitest";
import { blockClipStyle, clipShapes } from "./blockClip";

describe("геометрическая обрезка блока", () => {
  it("использует только встроенные фигуры и поддерживает явный сброс", () => {
    for (const shape of clipShapes) expect(blockClipStyle({clipShape: shape}).clipPath).toBeTruthy();
    expect(blockClipStyle({clipShape: "none"})).toEqual({clipPath: "none"});
    expect(blockClipStyle({clipShape: "url(https://example.invalid/mask.svg)"})).toEqual({});
    expect(blockClipStyle({clipShape: null})).toEqual({});
  });
});
