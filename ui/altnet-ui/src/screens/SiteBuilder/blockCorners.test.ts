import { describe, expect, it } from "vitest";
import { blockCornerStyle } from "./blockCorners";
import { resolveResponsiveStyle } from "./responsiveStyle";
import { withStyleClasses } from "./styleClasses";
import { adaptFromSiteBuilderDoc, exportSingleHtml } from "../../builder/exporter";
import type { Block, StyleClass } from "./types";

describe("адаптивные углы блока", () => {
  it("сохраняет общий радиус старых документов и переопределяет отдельные углы", () => {
    expect(blockCornerStyle({br:12})).toEqual({});
    expect(blockCornerStyle({blockCornerTopLeft:8,blockCornerBottomRight:25,blockCornerUnit:"%"}))
      .toEqual({borderTopLeftRadius:"8%",borderBottomRightRadius:"25%"});
    expect(blockCornerStyle({blockCornerTopLeft:Infinity,blockCornerUnit:"px; color:red"})).toEqual({});
  });
  it("новый общий радиус заменяет старые углы, пока они заново не заданы", () => {
    const styles={desktop:{br:10,blockCornerTopLeft:20},tablet:{br:30},mobile:{blockCornerBottomRight:40}};
    const tablet=resolveResponsiveStyle({},styles,"tablet"),mobile=resolveResponsiveStyle({},styles,"mobile");
    expect(tablet).toEqual({br:30});
    expect(mobile).toEqual({br:30,blockCornerBottomRight:40});
  });
  it("локальный общий радиус имеет приоритет над отдельными углами класса", () => {
    const rule:StyleClass={id:"global",name:"global",layers:{desktop:{blockCornerTopLeft:45,blockCornerBottomRight:9}}};
    const block:Block={type:"p",id:"p",text:"Текст",styleClassIds:["global"],styleByBp:{mobile:{br:5}}};
    const result=withStyleClasses(block,[rule]);
    expect(result.styleByBp?.desktop).toMatchObject({blockCornerTopLeft:45});
    expect(result.styleByBp?.mobile).toEqual({br:5});
  });
  it("применяет общие и индивидуальные радиусы в опубликованном HTML", async () => {
    const model=adaptFromSiteBuilderDoc({blocks:[{type:"p",id:"p",text:"Текст",styleByBp:{desktop:{br:10,blockCornerTopLeft:25},mobile:{br:3,blockCornerBottomRight:17}}}]});
    const html=await (await exportSingleHtml(model,{bundleAssets:false})).text();
    expect(html).toContain("border-radius:10px;border-top-left-radius:25px");
    expect(html).toContain("border-radius:3px;border-bottom-right-radius:17px");
  });
});
