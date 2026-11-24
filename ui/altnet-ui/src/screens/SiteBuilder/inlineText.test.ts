import { expect, it } from "vitest";
import { editParagraph, formatSelection, inlineMarkup, paragraphRuns } from "./inlineText";
import { adaptFromSiteBuilderDoc, exportSingleHtml } from "../../builder/exporter";

it("оформляет пересекающиеся выделения и снимает оформление только с выделенного фрагмента", () => {
  const text = "Текст статьи";
  const bold = formatSelection(text, undefined, 0, 5, "bold");
  const both = formatSelection(text, bold, 3, 9, "italic");
  expect(paragraphRuns(text, both)).toMatchObject([
    { text: "Тек", bold: true },
    { text: "ст", bold: true, italic: true },
    { text: " ста", italic: true },
    { text: "тьи" },
  ]);
  const removed = formatSelection(text, both, 3, 5, "bold");
  expect(removed?.find((run) => run.text === "ст ста")).toEqual({ text: "ст ста", italic: true });
});
it("сдвигает стили при вставке и удалении и поддерживает старые текстовые черновики", () => {
  const text = "Один два",
    old = formatSelection(text, undefined, 5, 8, "bold");
  expect(editParagraph(text, old, "Этот один два").richRuns?.at(-1)).toEqual({ text: "два", bold: true });
  expect(editParagraph(text, old, "Один").richRuns).toBeUndefined();
  expect(paragraphRuns("Новые данные", old)).toEqual([{ text: "Новые данные" }]);
});
it("сохраняет уровни выделения, переносы и безопасные ссылки в HTML", async () => {
  const text = "Наш текст\n2",
    em = formatSelection(text, undefined, 4, 9, "italic"),
    linked = formatSelection(text, em, 4, 9, "href", "#chapter");
  const html = await (
    await exportSingleHtml(adaptFromSiteBuilderDoc({ blocks: [{ id: "p", type: "p", text, richRuns: linked }] }), {
      bundleAssets: false,
    })
  ).text();
  expect(html).toMatch(/<a href="#chapter"[^>]*><em>текст<\/em><\/a><br\/>2/);
  expect(inlineMarkup("а", [{ text: "а", href: "javascript:void(0)", bold: true }], (s) => s)).toBe(
    "<strong>а</strong>"
  );
});
