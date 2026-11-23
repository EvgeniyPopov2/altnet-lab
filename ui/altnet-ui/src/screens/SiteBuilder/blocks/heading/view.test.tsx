import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import HeadingView from "./view";

describe("предпросмотр заголовка", () => {
  it.each(["h1", "h2", "h3", "h4", "h5", "h6", "div", "span", "p"] as const)("показывает тег %s и ссылку", level => {
    const html = renderToStaticMarkup(<HeadingView block={{ id: "h", type: "heading", text: "Заголовок", level, href: "./contacts.html" }} />);
    expect(html).toContain(`<${level} `);
    expect(html).toContain('href="./contacts.html"');
    expect(html).toContain("Заголовок");
  });
  it("нейтрализует небезопасную ссылку", () => {
    const html = renderToStaticMarkup(<HeadingView block={{ id: "h", type: "heading", text: "Текст", href: "javascript:evil()" }} />);
    expect(html).toContain('href="#"');
    expect(html).not.toContain("evil");
  });
});
