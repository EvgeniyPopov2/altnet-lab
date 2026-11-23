import { describe, expect, it } from "vitest";
import { readWidgetType, WIDGET_DRAG_TYPE } from "./drag";

describe("данные перетаскиваемого виджета", () => {
  it("принимает тип из палитры и отклоняет неизвестные значения", () => {
    const transfer = (value: string) => ({ getData: (type: string) => type === WIDGET_DRAG_TYPE ? value : "" }) as DataTransfer;
    expect(readWidgetType(transfer("heading"))).toBe("heading");
    expect(readWidgetType(transfer("unsupported"))).toBeNull();
    expect(readWidgetType(transfer("malicious"))).toBeNull();
    expect(readWidgetType(transfer(""))).toBeNull();
  });
});
