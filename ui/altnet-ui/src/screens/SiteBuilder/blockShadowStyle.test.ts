import { describe, expect, it } from "vitest";
import { blockShadowStyle } from "./blockShadowStyle";
import { resolveResponsiveStyle } from "./responsiveStyle";
import { adaptFromSiteBuilderDoc, exportSingleHtml } from "../../builder/exporter";

describe("тень блока", () => {
  it("проверяет настройки, значения по умолчанию и отключение", () => {
    expect(blockShadowStyle({})).toEqual({});
    expect(blockShadowStyle({blockShadow:"outer"})).toEqual({boxShadow:"0px 8px 24px 0px #00000040"});
    expect(blockShadowStyle({blockShadow:"inset",blockShadowX:-4,blockShadowSpread:3,blockShadowColor:"#abc"}))
      .toEqual({boxShadow:"inset -4px 8px 24px 3px #abc"});
    expect(blockShadowStyle({blockShadow:"none"})).toEqual({boxShadow:"none"});
    expect(blockShadowStyle({blockShadow:"outer",blockShadowColor:"red;display:none"}).boxShadow).toContain("#00000040");
  });
  it("наследует настройки для планшета и отключается на телефоне в HTML", async () => {
    const styles = {desktop:{blockShadow:"outer",blockShadowX:5},mobile:{blockShadow:"none"}};
    expect(blockShadowStyle(resolveResponsiveStyle({}, styles, "tablet")).boxShadow).toContain("5px");
    const model = adaptFromSiteBuilderDoc({blocks:[{id:"p",type:"p",text:"Текст",styleByBp:styles}]});
    const html = await (await exportSingleHtml(model,{bundleAssets:false})).text();
    expect(html).toContain("box-shadow:5px 8px 24px 0px #00000040");
    expect(html).toContain("box-shadow:none");
  });
});
