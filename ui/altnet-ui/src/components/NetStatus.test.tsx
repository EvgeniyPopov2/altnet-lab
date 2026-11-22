import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import NetStatus from "./NetStatus";

describe("состояние сети до подключения транспорта", () => {
  it.each(["anon", "fast"] as const)("не выдаёт неподтверждённую сеть за работающую: %s", (profile) => {
    const html = renderToStaticMarkup(<NetStatus profile={profile} />);
    expect(html).toContain("Сеть ещё не подключена");
    expect(html).toContain("Маршрут и шифрование не подтверждены");
    expect(html).toContain("Путь: не подтверждён");
    expect(html).toContain("Запланированные правила профиля");
    expect(html).not.toContain("Hot-failover: готов");
  });
});
