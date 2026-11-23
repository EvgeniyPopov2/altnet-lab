import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import IconBoxView from "./blocks/iconbox/view";
import ImageBoxView from "./blocks/imagebox/view";
import { createDefaultBlock } from "./registry";
import TestimonialsView from "./blocks/testimonials/view";
import PriceListView from "./blocks/pricelist/view";

describe("содержимое карточек", () => {
  it("отображает реальные данные иконки вместо демонстрационных карточек", () => {
    const html = renderToStaticMarkup(<IconBoxView block={{ id: "a", type: "iconbox", title: "Реальный заголовок", icon: "shield" }} />);
    expect(html).toContain("Реальный заголовок");
    expect(html).not.toContain("Функция A");
  });
  it("не подставляет сторонние изображения в новую карточку", () => {
    const html = renderToStaticMarkup(<ImageBoxView block={createDefaultBlock("imagebox")} />);
    expect(html).not.toContain("picsum.photos");
  });
  it("показывает текст отзыва и описание тарифа из данных документа", () => {
    const reviews = renderToStaticMarkup(<TestimonialsView block={{ items: [{ id: "r", author: "Автор", text: "Настоящий отзыв" }] }} />);
    const prices = renderToStaticMarkup(<PriceListView block={{ items: [{ id: "p", title: "Тариф", desc: "Подробности" }] }} />);
    expect(reviews).toContain("Настоящий отзыв");
    expect(prices).toContain("Подробности");
  });
});
