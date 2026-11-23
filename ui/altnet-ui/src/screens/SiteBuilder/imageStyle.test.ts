import { describe, expect, it } from "vitest";
import { imageAlignment, imageCaptionStyle, imageHoverStyle, imageStyle, imageTransition } from "./imageStyle";

describe("адаптивное оформление изображения", () => {
  it("наследует настройки и применяет безопасные границы", () => {
    const styles = { desktop: { width: 80, opacity: 75, fit: "cover" }, tablet: { width: 120 }, mobile: { height: 180, opacity: -5 } };
    expect(imageStyle(styles, "desktop")).toEqual({ width: "80%", opacity: 0.75, objectFit: "cover" });
    expect(imageStyle(styles, "mobile")).toEqual({ width: "120%", height: "180px", opacity: 0, objectFit: "cover" });
    expect(imageStyle({ desktop: { width: "1%;color:red", fit: "url(https://example.invalid)", height: Infinity } }, "desktop")).toEqual({});
  });
  it("наследует фильтры по экрану и изменяет при наведении только заданные параметры", () => {
    const styles = { desktop: { brightness: 120, contrast: 80, hoverBlur: 4, hoverOpacity: 40, radius: 10, borderWidth: 2, borderColor: "#abc", duration: 300 }, mobile: { brightness: 90, hoverBlur: 8 } };
    expect(imageStyle(styles, "mobile")).toMatchObject({ filter: "brightness(90%) contrast(80%) saturate(100%) blur(0px)", borderRadius: "10px", borderWidth: "2px", borderStyle: "solid", borderColor: "#abc" });
    expect(imageHoverStyle(styles, "mobile")).toEqual({ opacity: 0.4, filter: "brightness(90%) contrast(80%) saturate(100%) blur(8px)" });
    expect(imageTransition(styles, "tablet")).toBe(300);
  });
  it("отбрасывает небезопасные значения и ограничивает числа", () => {
    const styles = { desktop: { borderColor: "red;position:fixed", brightness: Infinity, hoverBorderColor: "url(https://example.invalid)", hoverBlur: -2, duration: 5000 } };
    expect(imageStyle(styles, "desktop")).toEqual({});
    expect(imageHoverStyle(styles, "desktop")).toEqual({ filter: "brightness(100%) contrast(100%) saturate(100%) blur(0px)" });
    expect(imageTransition(styles, "desktop")).toBe(2000);
  });
  it("поддерживает независимую тень и безопасное отключение при наведении", () => {
    const styles = { desktop: { shadowMode: "on", shadowColor: "#ff000080", shadowX: -3, shadowBlur: 9, hoverShadowMode: "off" }, mobile: { shadowX: 5 } };
    expect(imageStyle(styles, "desktop").boxShadow).toBe("-3px 4px 9px 0px #ff000080");
    expect(imageStyle(styles, "mobile").boxShadow).toBe("5px 4px 9px 0px #ff000080");
    expect(imageHoverStyle(styles, "mobile").boxShadow).toBe("none");
    expect(imageStyle({ desktop: { shadowMode: "on", shadowColor: "red;position:fixed", shadowX: -999 } }, "desktop").boxShadow).toBe("-128px 4px 12px 0px #00000080");
  });
  it("согласует выравнивание, подпись и типы рамки на разных экранах", () => {
    const styles = { desktop: { align: "center", borderType: "double", borderWidth: 5, captionAlign: "right", captionSize: 18, captionSpacing: 12, captionColor: "#abc", captionFont: "Georgia", hoverBorderType: "dashed" }, mobile: { align: "left", captionSize: 13, captionSpacing: 4 } };
    expect(imageAlignment(styles, "mobile")).toBe("left");
    expect(imageStyle(styles, "tablet")).toMatchObject({ display: "inline-block", borderWidth: "5px", borderStyle: "double" });
    expect(imageHoverStyle(styles, "tablet")).toMatchObject({ borderStyle: "dashed" });
    expect(imageCaptionStyle(styles, "mobile")).toEqual({ fontSize: "13px", marginTop: "4px", color: "#abc", textAlign: "right", fontFamily: "Georgia" });
  });
  it("не допускает внедрения CSS в настройки подписи и рамки", () => {
    const styles = { desktop: { align: "center;position:fixed", borderType: "solid;display:none", hoverBorderType: "url(x)", captionFont: "x;display:none", captionColor: "red;display:none", captionAlign: "left;display:none", captionSize: Infinity } };
    expect(imageAlignment(styles, "desktop")).toBeUndefined();
    expect(imageCaptionStyle(styles, "desktop")).toEqual({});
    expect(imageStyle(styles, "desktop")).toEqual({});
    expect(imageHoverStyle(styles, "desktop")).toEqual({});
  });
});
