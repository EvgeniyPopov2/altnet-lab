import { describe, expect, it } from "vitest";
import { buttonStyle } from "./buttonStyle";
import { buttonIconPath } from "./buttonIcons";

describe("адаптивное оформление кнопки", () => {
  it("наследует обычное и наведённое состояния независимо", () => {
    const values = { desktop: { color: "#123456", bg: "#abcdef", paddingX: 24, hoverBg: "#ff9900", duration: 300 }, mobile: { paddingX: 8, hoverColor: "#fff" } };
    expect(buttonStyle(values, "desktop")).toEqual({ normal: { color: "#123456", "background-color": "#abcdef", "padding-inline": "24px" }, hover: { "background-color": "#ff9900" }, active: {}, duration: 300 });
    expect(buttonStyle(values, "mobile")).toEqual({ normal: { color: "#123456", "background-color": "#abcdef", "padding-inline": "8px" }, hover: { color: "#fff", "background-color": "#ff9900" }, active: {}, duration: 300 });
  });
  it("отклоняет внедрение CSS и ограничивает размеры и время перехода", () => {
    const result = buttonStyle({ desktop: { bg: "red; background:url(https://example.invalid)", hoverColor: "</style>", borderWidth: 999, radius: -10, duration: 10000 } }, "desktop");
    expect(result).toEqual({ normal: { "border-width": "32px", "border-radius": "0px" }, hover: {}, active: {}, duration: 2000 });
  });
  it("согласует общие и отдельные отступы при переходе между устройствами", () => {
    const styles = { desktop: { paddingX: 20, paddingY: 10, paddingTop: 3, hoverPaddingLeft: 5 }, tablet: { paddingLeft: 7 }, mobile: { paddingY: 6 } };
    expect(buttonStyle(styles, "desktop").normal).toEqual({ "padding-top": "3px", "padding-right": "20px", "padding-bottom": "10px", "padding-left": "20px" });
    expect(buttonStyle(styles, "mobile").normal).toEqual({ "padding-top": "6px", "padding-right": "20px", "padding-bottom": "6px", "padding-left": "7px" });
    expect(buttonStyle(styles, "mobile").hover).toEqual({ "padding-left": "5px" });
  });
  it("ограничивает размер и отступ локальных иконок", () => {
    expect(buttonStyle({ desktop: { iconSize: 500, iconGap: -4 } }, "desktop")).toMatchObject({ iconSize: 128, iconGap: 0 });
    expect(buttonIconPath("arrow-right")).toBeTruthy();
    expect(buttonIconPath('x\" onload=\"evil')).toBeUndefined();
    expect(buttonIconPath("__proto__")).toBeUndefined();
  });
  it("строит только проверенные градиенты и тени и наследует их по устройствам", () => {
    const styles = { desktop: { backgroundType: "gradient", gradientStart: "#123456", gradientEnd: "#abcdef", gradientAngle: 90, shadowMode: "on", shadowX: -8, shadowColor: "#ff000080" }, mobile: { backgroundType: "solid", hoverShadowMode: "off" } };
    expect(buttonStyle(styles, "desktop").normal["background-image"]).toBe("linear-gradient(90deg,#123456,#abcdef)");
    expect(buttonStyle(styles, "desktop").normal["box-shadow"]).toBe("-8px 4px 12px 0px #ff000080");
    expect(buttonStyle(styles, "mobile").normal["background-image"]).toBe("none");
    expect(buttonStyle(styles, "mobile").hover["box-shadow"]).toBe("none");
    const unsafe = buttonStyle({ desktop: { backgroundType: "gradient", gradientStart: "#fff);url(https://example.invalid)", gradientEnd: "#123456", shadowMode: "on", shadowColor: "red;url(evil)", shadowX: -1000 } }, "desktop");
    expect(unsafe.normal["background-image"]).toBeUndefined();
    expect(unsafe.normal["box-shadow"]).toBe("-128px 4px 12px 0px #00000040");
  });
  it("отдельно наследует состояние нажатия и проверяет его параметры", () => {
    const value = { desktop: { activeBg: "#112233", activePaddingX: 10, activeShadowMode: "off" }, mobile: { activePaddingLeft: 3 } };
    expect(buttonStyle(value, "mobile").active).toEqual({ "background-color": "#112233", "padding-right": "10px", "padding-left": "3px", "box-shadow": "none" });
    expect(buttonStyle({ desktop: { activeBg: "red;url(evil)", activeBorderWidth: -2 } }, "desktop").active).toEqual({ "border-width": "0px" });
  });
});
