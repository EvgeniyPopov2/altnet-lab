import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import JSZip from "jszip";
import { adaptFromSiteBuilderDoc, exportSingleHtml, exportSiteZip, unsupportedBlockTypes } from "./exporter";
import { LOTTIE_HASH, loadLottieRenderer } from "./lottieRenderer";
import { readAnimation, lottieOptions } from "../screens/SiteBuilder/lottie";
import { mapSettings, mapUrls, overviewSvg } from "../screens/SiteBuilder/blocks/map/geometry";
import { SITE_RUNTIME_HASH, SITE_RUNTIME } from "./siteRuntime";

const json = JSON.stringify({
  v: "5.10.0",
  fr: 30,
  ip: 0,
  op: 30,
  w: 100,
  h: 100,
  layers: [{ ty: 4, ind: 1, shapes: [] }],
});
const png =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/ZKkAAAAASUVORK5CYII=";
async function exported(blocks: unknown[], format: string, restrict = false) {
  const model = adaptFromSiteBuilderDoc({ title: "Проверка", blocks });
  if (format === "html") {
    const html = await (await exportSingleHtml(model, { bundleAssets: false, restrictExternalMedia: restrict })).text();
    return { html, css: html };
  }
  const zip = await JSZip.loadAsync(
    await (await exportSiteZip(model, { bundleAssets: false, restrictExternalMedia: restrict })).arrayBuffer()
  );
  return { html: await zip.file("index.html")!.async("string"), css: await zip.file("styles.css")!.async("string") };
}
describe("HTML и ZIP", () => {
  it.each(["html", "zip"])("сохраняет адаптивное появление и настройки доступности в %s", async (format) => {
    const { html, css } = await exported([{type:"p", text:"Привет", styleByBp:{desktop:{entranceType:"up", entranceDuration:350, entranceDistance:45, entranceRepeat:"repeat", op:60}, mobile:{entranceType:"none"}}}], format);
    expect(html).toContain("data-entrance");
    expect(html).toContain(SITE_RUNTIME_HASH);
    expect(css).toContain("--sb-entry-name:sb-entry-up");
    expect(css).toContain("--sb-entry-distance:45px");
    expect(css).toContain("--sb-entry-opacity:0.6");
    expect(css).toContain("--sb-entry-name:none");
    expect(css).toContain("prefers-reduced-motion:reduce");
  });
  it.each(["html", "zip"])(
    "публикует Flex, индивидуальные углы и трансформации вложенного виджета в %s",
    async (format) => {
      const { html, css } = await exported(
        [
          {
            type: "section",
            layoutPreset: [2, 1],
            layoutGapX: 6,
            layoutGapY: 10,
            flexByBp: {
              desktop: { direction: "row-reverse", wrap: "wrap", justify: "space-around", basis: 90 },
              mobile: { direction: "column" },
            },
            layoutCells: [
              [
                {
                  type: "btn",
                  label: "Перейти",
                  href: "#part",
                  styleByBp: {
                    desktop: { pt: 2, paddingUnit: "em", rotate: 14, hoverScaleX: 1.4, transformDuration: 300 },
                  },
                  buttonStyleByBp: { desktop: { radiusTopLeft: 12, hoverRadiusBottomRight: 25, hoverRadiusUnit: "%" } },
                },
              ],
              [],
            ],
          },
        ],
        format
      );
      expect(html).toContain("Перейти");
      for (const value of [
        "display:flex",
        "flex-direction:row-reverse",
        "justify-content:space-around",
        "column-gap:6px",
        "row-gap:10px",
        "2 1 180px",
        "flex-direction:column",
        "padding-top:2em",
        "rotate(14deg)",
        "scaleX(1.4)",
        "border-top-left-radius:12px",
        "border-bottom-right-radius:25%",
      ])
        expect(css).toContain(value);
    }
  );
  it.each(["html", "zip"])(
    "публикует активный источник подписи и просмотр только для выбранных картинок в %s",
    async (format) => {
      const { html } = await exported(
        [
          {
            type: "img",
            src: png,
            alt: "Обложка",
            caption: "Скрытая подпись",
            captionSource: "media",
            mediaCaption: "Фото <1>",
            linkTo: "media",
            href: "./old.html",
          },
          { type: "gallery", lightbox: true, items: [{ src: png, caption: "Кадр & два" }] },
        ],
        format
      );
      expect(html).toContain("Фото &lt;1&gt;");
      expect(html).toContain("Кадр &amp; два");
      expect(html).not.toContain("./old.html");
      expect(html).toContain("data-lightbox-group");
      expect(html).toContain("data-lightbox-open aria-haspopup");
      expect(html).toContain("sha256-" + SITE_RUNTIME_HASH);
      const { html: disabled } = await exported(
        [{ type: "img", src: png, caption: "скрытая", captionSource: "none", linkTo: "none", href: "./old.html" }],
        format
      );
      expect(disabled).not.toContain("./old.html");
      expect(disabled).not.toContain("скрытая");
      expect(disabled).toContain("script-src 'none'");
    }
  );
  it.each(["html", "zip"])(
    "публикует автономную карту и включает подробную только для явно разрешённого режима в %s",
    async (format) => {
      const map = { type: "map", lat: 55, lon: 37, zoom: 15, height: 315, detailMap: true, label: "Парк <центра>" };
      const { html, css } = await exported([map], format);
      expect(html).toContain("Метка на обзорной карте");
      expect(html).toContain("Парк &lt;центра&gt;");
      expect(html).toContain("data-map-open=");
      expect(css).toContain("height:315px");
      expect(html).toContain("frame-src https://www.openstreetmap.org");
      expect(html).not.toMatch(/<iframe[^>]+src="https:/);
      const { html: privateView } = await exported([map], format, true);
      expect(privateView).toContain("frame-src 'none'");
      expect(privateView).not.toContain("data-map-open=");
      expect(privateView).toContain("Метка на обзорной карте");
    }
  );
  it.each(["html", "zip"])(
    "использует локальный проигрыватель Lottie с проверяемым хешем только в нужных страницах %s",
    async (format) => {
      const { html } = await exported(
        [{ type: "lottie", animationJson: json, caption: "Движение <1>", trigger: "click", speed: 1.6 }],
        format,
        true
      );
      const engine = await loadLottieRenderer();
      expect(createHash("sha256").update(engine).digest("base64")).toBe(LOTTIE_HASH);
      expect(html).toContain("<script data-altnet-lottie>" + engine + "</script>");
      expect(html).toContain("sha256-" + LOTTIE_HASH);
      expect(html).toContain("Движение &lt;1&gt;");
      expect(html).toContain("data-animation-json");
      expect(html).not.toContain("unsafe-eval");
      expect((await exported([{ type: "p", text: "Текст" }], format)).html).not.toContain(
        "<script data-altnet-lottie>"
      );
    }
  );
  it("держит актуальный хеш сценария публикации", () =>
    expect(createHash("sha256").update(SITE_RUNTIME).digest("base64")).toBe(SITE_RUNTIME_HASH));
});
describe("содержимое виджетов", () => {
  it("проверяет координаты и границы проекции вблизи полюсов", () => {
    const cfg = mapSettings({ lat: 100, lon: -240, zoom: 200, height: "1", label: "A" });
    expect(cfg).toMatchObject({ lat: 90, lon: -180, zoom: 20, height: 280 });
    expect(mapUrls(cfg).embed).not.toContain("NaN");
    expect(overviewSvg(cfg, "edge")).toContain('<path id="sb-map-land-edge"');
  });
  it("сохраняет остановку старой анимации, скорость и границы фрагмента", () => {
    expect(lottieOptions({ autoplay: false, speed: 55, start: 83, end: 4, align: "unsupported" })).toMatchObject({
      trigger: "click",
      speed: 5,
      start: 83,
      end: 84,
      align: "center",
    });
    expect(readAnimation(json).w).toBe(100);
    expect(unsupportedBlockTypes(adaptFromSiteBuilderDoc({ blocks: [{ type: "lottie", src: "./old.json" }] }))).toEqual(
      ["lottie"]
    );
  });
  it.each([
    { assets: [{ id: "bad", p: "image.png" }] },
    { layers: [{ ty: 0, refId: "a" }], assets: [{ id: "a", layers: [{ ty: 0, refId: "a" }] }] },
    {
      layers: [
        { ty: 4, ind: 1, parent: 2 },
        { ty: 4, ind: 2, parent: 1 },
      ],
    },
    { fr: 0 },
    { layers: [] },
    { segments: [] },
  ])("отклоняет неподдерживаемые ресурсы и повреждённую композицию", (patch) =>
    expect(() => readAnimation(JSON.stringify({ ...JSON.parse(json), ...patch }))).toThrow()
  );
});
