import { describe, expect, it } from "vitest";
import { blockBorderStyle } from "./blockBorders";
import { resolveResponsiveStyle } from "./responsiveStyle";
import { withStyleClasses } from "./styleClasses";
import { adaptFromSiteBuilderDoc, exportSingleHtml } from "../../builder/exporter";
import type { Block, StyleClass } from "./types";

describe("толщина рамки по сторонам", () => {
  it("проверяет значения и сохраняет нулевую толщину", () => {
    expect(blockBorderStyle({bw:3})).toEqual({});
    expect(blockBorderStyle({blockBorderTop:0,blockBorderRight:7,blockBorderBottom:Infinity}))
      .toEqual({borderTopWidth:"0px",borderRightWidth:"7px"});
  });
  it("новая общая толщина заменяет предыдущие стороны на меньшем экране", () => {
    const styles={desktop:{bw:4,blockBorderTop:10},tablet:{bw:2},mobile:{blockBorderBottom:7}};
    expect(resolveResponsiveStyle({},styles,"tablet")).toEqual({bw:2});
    expect(resolveResponsiveStyle({},styles,"mobile")).toEqual({bw:2,blockBorderBottom:7});
  });
  it("локальные настройки блока перекрывают общий класс", () => {
    const rule:StyleClass={id:"s",name:"style",layers:{desktop:{blockBorderTop:8}}};
    const block:Block={id:"p",type:"p",text:"Текст",styleClassIds:["s"],styleByBp:{mobile:{bw:3}}};
    expect(withStyleClasses(block,[rule]).styleByBp?.desktop).toEqual({blockBorderTop:8});
    expect(withStyleClasses(block,[rule]).styleByBp?.mobile).toEqual({bw:3});
  });
  it("сохраняет стили рамок в экспортированном HTML", async () => {
    const model=adaptFromSiteBuilderDoc({blocks:[{id:"p",type:"p",text:"Текст",styleByBp:{desktop:{bs:"solid",bw:3,blockBorderTop:10},mobile:{bw:2,blockBorderBottom:7}}}]});
    const html=await (await exportSingleHtml(model,{bundleAssets:false})).text();
    expect(html).toContain("border-width:3px;border-top-width:10px");
    expect(html).toContain("border-width:2px;border-bottom-width:7px");
  });
});
