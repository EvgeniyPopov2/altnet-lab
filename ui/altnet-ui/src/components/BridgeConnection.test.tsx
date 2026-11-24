import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import BridgeConnection from "./BridgeConnection";
import { connectionText, type BridgeStatus } from "./bridgeStatus";

describe("управление мостами", () => {
  it("даёт офлайн-подсказку и не выдаёт отсутствующий клиент за готовое соединение", () => {
    const html = renderToStaticMarkup(<BridgeConnection panic={false} />);
    for (const text of ["Нет данных от локального клиента", "@GetBridgesBot", "iat-mode=0",
      "Сменить мост", "Добавить и проверить", "Обновить список"]) expect(html).toContain(text);
    expect(html).not.toContain("Соединение Tor через мост подтверждено");
  });
  it("различает восстановление, исчерпанный резерв и подтверждение", () => {
    const flag = (phase: BridgeStatus["phase"]) => connectionText({phase} as BridgeStatus);
    expect(flag("recovering")).toContain("Восстанавливаем");
    expect(flag("waiting")).toContain("повторит");
    expect(flag("ready")).toContain("подтверждено");
  });
});

