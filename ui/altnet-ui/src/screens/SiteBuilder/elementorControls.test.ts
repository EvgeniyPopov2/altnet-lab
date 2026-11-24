import { describe, expect, it } from "vitest";
import { createDefaultBlock, createInsertedBlock, editableLegacyLayout } from "./registry";
import { flexChoices, resolveFlexLayout } from "./layoutResponsive";
import { gridColumnCount } from "./gridLayout";
import { cornerStyles } from "./corners";
import { textAppearance } from "./textAppearance";
import { spacingStyle, lengthUnits } from "./boxDimensions";
import { transforms, transformStyle } from "./transforms";
import { validMediaLibrary, addMediaAsset, deleteMediaAsset, editMediaAsset, imageCaption } from "./mediaLibrary";
import { addPage, switchPage } from "./pages";
import { exportProject, importProject, parseProject, projectsOf, switchProject } from "./projects";
import { validateDraft } from "./storage";
import type { Doc, MediaAsset, GridPreset, FlexPreset } from "./types";

describe("макеты и наследование", () => {
  it.each([
    [1, 1],
    [3, 3],
    [4, 16],
    [12, 5],
  ])("создаёт %i колонок и %i строк с независимыми ячейками", (columns, rows) => {
    const grid = createDefaultBlock("grid", { columns: Array.from({ length: columns }, (_, i) => i + 1), rows });
    expect(gridColumnCount(grid)).toBe(columns);
    expect(grid.layoutCells).toHaveLength(columns * rows);
    expect(new Set(grid.layoutCells).size).toBe(columns * rows);
    expect(validateDraft({ title: "", blocks: [grid] }).status).toBe("loaded");
  });
  it.each(["2x2", "3x3", "4x4", "2x3", "3x2", "1x3"] as GridPreset[])("поддерживает именованный макет %s", (preset) => {
    const grid = createDefaultBlock("grid", preset),
      [cols, rows] = preset.split("x").map(Number);
    expect(gridColumnCount(grid)).toBe(cols);
    expect(grid.layoutCells).toHaveLength(cols * rows);
  });
  it.each(["1col", "2col-wide-left", "3col-wide-center", "4col", "5col", "6col"] as FlexPreset[])(
    "вставляет секцию %s с рабочими ячейками",
    (preset) => {
      expect(createDefaultBlock("section", preset).layoutCells).toHaveLength(Number(preset[0]));
    }
  );
  it.each(flexChoices.direction)("наследует направление %s и уважает старый мобильный режим", (direction) => {
    const block = { layoutCells: [[], []], layoutPreset: [2, 1], flexByBp: { desktop: { direction } } };
    expect(resolveFlexLayout(block, "tablet").row.flexDirection).toBe(direction);
    expect(resolveFlexLayout({ ...block, layoutByBp: { mobile: { mode: "stack" } } }, "mobile").row.flexDirection).toBe(
      "column"
    );
  });
  it("учитывает пропорции, обратный перенос, оси, ограничение ширины и сбросы", () => {
    const base = { layoutCells: [[], []], layoutPreset: [2, 1], layoutGapX: 4, layoutGapY: 7 };
    const flex = resolveFlexLayout(
      {
        ...base,
        flexByBp: {
          desktop: {
            wrap: "wrap-reverse",
            basis: 80,
            justify: "space-between",
            align: "baseline",
            alignContent: "center",
            contentWidth: "boxed",
            maxWidth: 700,
            minHeight: 75,
          },
        },
      },
      "desktop"
    );
    expect(flex.cells).toEqual(["2 1 160px", "1 1 80px"]);
    expect(flex.row).toMatchObject({
      flexWrap: "wrap-reverse",
      columnGap: "4px",
      rowGap: "7px",
      alignItems: "baseline",
      alignContent: "center",
      justifyContent: "space-between",
      minHeight: "75px",
      maxWidth: "700px",
    });
    expect(resolveFlexLayout({ ...base, flexByBp: { desktop: { sizing: "content" } } }, "desktop").cells).toEqual([
      "0 1 auto",
      "0 1 auto",
    ]);
    expect(
      resolveFlexLayout({ ...base, flexByBp: { desktop: { sizing: "fixed", basis: 0 } } }, "desktop").cells
    ).toEqual(["0 1 1px", "0 1 1px"]);
    expect(
      resolveFlexLayout(
        { ...base, flexByBp: { desktop: { justify: "invalid", wrap: [], maxWidth: Infinity } } },
        "desktop"
      ).row
    ).toMatchObject({ justifyContent: "flex-start", maxWidth: "none", flexWrap: "nowrap" });
  });
});

describe("оформление редактора и экспорта", () => {
  it.each(lengthUnits)("сохраняет ноль и дробные отступы в %s", (unit) => {
    expect(spacingStyle({ pt: 1.5, pr: -12, mb: -2, ml: 0, paddingUnit: unit, marginUnit: unit })).toEqual({
      paddingTop: "1.5" + unit,
      paddingRight: "0" + unit,
      marginBottom: "-2" + unit,
      marginLeft: "0" + unit,
    });
  });
  it("восстанавливает старые значения и фильтрует неверные единицы", () => {
    expect(spacingStyle({ py: 10, pb: 0, mt: NaN, paddingUnit: "junk" })).toEqual({
      paddingTop: "10px",
      paddingBottom: "0px",
    });
  });
  it.each(transforms)("проверяет диапазон $id и наследование при наведении", (spec) => {
    expect(transformStyle({ [spec.id]: Infinity })).toEqual({});
    expect(transformStyle({ [spec.id]: spec.max + 1 }).transform).toBe(spec.id + "(" + spec.max + spec.unit + ")");
    expect(transformStyle({ [spec.id]: spec.min, hoverOriginX: 0 }, true).transform).toBe(
      spec.id + "(" + spec.min + spec.unit + ")"
    );
  });
  it("сбрасывает трансформацию и ограничивает центр и переход", () => {
    expect(
      transformStyle({ rotate: 30, transformMode: "none", originX: -70, originY: 20, transformDuration: 10000 })
    ).toEqual({
      transform: "none",
      transformOrigin: "0% 20%",
      transition: "transform 5000ms, transform-origin 5000ms",
    });
    expect(transformStyle({ rotate: 30, hoverTransformMode: "none" }, true).transform).toBe("none");
  });
  it("сохраняет отдельные углы и заменяет их общим значением на другом экране", () => {
    const layers = {
      desktop: { radius: 8, radiusTopLeft: 12, hoverRadius: 14, activeRadius: 16 },
      tablet: { radiusUnit: "%", radiusBottomRight: 20 },
      mobile: { radius: 3 },
    };
    expect(cornerStyles(layers, "tablet", "normal", 256)).toEqual({
      borderRadius: "8%",
      borderTopLeftRadius: "12%",
      borderBottomRightRadius: "20%",
    });
    expect(cornerStyles(layers, "mobile", "normal", 256)).toEqual({ borderRadius: "3%" });
    expect(cornerStyles(layers, "mobile", "hover", 256)).toEqual({ borderRadius: "14px" });
    expect(cornerStyles(layers, "mobile", "active", 256)).toEqual({ borderRadius: "16px" });
  });
  it("собирает типографику, обводку, тень и цвет ссылки", () => {
    expect(
      textAppearance({
        fontStyle: "italic",
        textTransform: "uppercase",
        decoration: "underline",
        letterSpacing: -1,
        wordSpacing: 2,
        strokeWidth: 1,
        strokeColor: "#123",
        blend: "multiply",
        textShadow: "on",
        textHoverColor: "#abcdef",
      })
    ).toMatchObject({
      normal: {
        "font-style": "italic",
        "text-transform": "uppercase",
        "text-decoration-line": "underline",
        "letter-spacing": "-1px",
        "word-spacing": "2px",
        "-webkit-text-stroke-width": "1px",
        "mix-blend-mode": "multiply",
        "text-shadow": "0px 2px 4px #00000080",
      },
      hover: { color: "#abcdef" },
    });
    expect(
      textAppearance({ decoration: "invented", textHoverColor: "bad", fontStyle: "0", letterSpacing: NaN })
    ).toEqual({ normal: {}, hover: {} });
  });
});

const image: MediaAsset = {
  id: "cidv1-sha256-" + "a".repeat(64),
  name: "Логотип.png",
  alt: "До",
  caption: "Подпись",
  dataUrl:
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/ZKkAAAAASUVORK5CYII=",
};
describe("медиатека проекта", () => {
  it("проверяет импорт PNG и отклоняет внешние источники и повторы идентификаторов", () => {
    expect(validMediaLibrary([image])).toBe(true);
    for (const invalid of [
      [image, image],
      [{ ...image, dataUrl: "https://example.org/img.png" }],
      [{ ...image, id: "" }],
      [{ ...image, alt: 0 }],
      [{ ...image, dataUrl: "data:image/png;base64,AAAA" }],
    ])
      expect(validateDraft({ title: "", blocks: [], mediaLibrary: invalid }).status).toBe("unavailable");
  });
  it("разделяет проекты, сохраняет медиатеку между страницами и обновляет вложенные изображения", () => {
    const block = {
      ...createDefaultBlock("img"),
      mediaId: image.id,
      cid: image.dataUrl,
      alt: image.alt,
      captionSource: "media" as const,
      mediaCaption: image.caption,
      caption: "Своя",
    };
    const original: Doc = { title: "Проект", blocks: [{ ...createDefaultBlock("section"), layoutCells: [[block]] }] };
    const doc = addMediaAsset(original, image);
    expect(addMediaAsset(doc, image)).toBe(doc);
    const second = addPage(doc, "Вторая");
    const changed = editMediaAsset(second, image.id, { caption: "Новое", alt: "После" });
    const home = switchPage(changed, "home");
    const section = home.blocks[0];
    const pic = section.type === "section" && section.layoutCells?.[0][0];
    if (!pic || pic.type !== "img") throw new Error("Изображение отсутствует");
    expect(imageCaption(pic)).toBe("Новое");
    expect(pic.alt).toBe("После");
    expect(imageCaption({ ...pic, captionSource: "none" })).toBe("");
    expect(imageCaption({ ...pic, captionSource: "custom" })).toBe("Своя");
    const parsed = parseProject(JSON.parse(exportProject(home)));
    expect(parsed.document.mediaLibrary).toEqual(home.mediaLibrary);
    const workspace = importProject(home, { name: "Другой", document: { title: "Пусто", blocks: [] } });
    expect(workspace.mediaLibrary).toBeUndefined();
    expect(switchProject(workspace, projectsOf(home).activeId).mediaLibrary).toEqual(home.mediaLibrary);
    expect(deleteMediaAsset(home, image.id).blocks).toBe(home.blocks);
    expect(validateDraft(home).status).toBe("loaded");
  });
});

it("создаёт доступные для вставки колонки и сохраняет прежние изображения, ссылки и подписи", () => {
  expect(createInsertedBlock("section")).toMatchObject({ layoutCells: [[]] });
  expect(createInsertedBlock("grid")).toMatchObject({ layoutColumns: 3, layoutCells: [[], [], []] });
  const old = createDefaultBlock("grid");
  old.items = [{ id: "a", src: "./cat.png", alt: "Кот", caption: "Фото" }];
  expect(editableLegacyLayout(old)).toMatchObject({
    layoutColumns: 3,
    items: [],
    layoutCells: [[{ type: "img", src: "./cat.png", alt: "Кот", caption: "Фото" }], [], []],
  });
  expect(old.items).toHaveLength(1);
  expect(createInsertedBlock("bio-card")).toMatchObject({
    type: "section",
    layoutPreset: [1, 2],
    layoutCells: [[{ type: "img" }], [{ type: "heading" }, { type: "p" }, { type: "social" }]],
  });
});
