import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import MobileNavigation from "./MobileNavigation";

describe("нижняя навигация", () => {
  it("показывает основные разделы и отмечает текущий", () => {
    const html = renderToStaticMarkup(<MobileNavigation active="messages" onNavigate={() => undefined} />);
    for (const label of ["Лента", "Чаты", "Серверы", "Защита", "Ещё"]) expect(html).toContain(label);
    expect(html).toContain('aria-label="Основные разделы"');
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
  });
});
