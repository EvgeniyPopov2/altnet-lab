import { describe, it, expect } from "vitest";
import { adaptFromSiteBuilderDoc, exportSingleHtml } from "../../builder/exporter";
import { activePageForBuild } from "./siteTemplates";
import { importLegacyDoc } from "./legacyImport";
import { textPathOptions, validPath, shapes } from "./textPath";
import { postExcerpt, moreFragment } from "./postExcerpt";
import { soundSettings, soundTrack } from "./soundCloud";
import type { Doc } from "./types";

const html = async (doc: Doc, restricted = false) =>
  (
    await exportSingleHtml(adaptFromSiteBuilderDoc(activePageForBuild(doc)), {
      bundleAssets: false,
      restrictExternalMedia: restricted,
    })
  ).text();

describe("текст по контуру, анонсы и аудио", () => {
  it("распознаёт геометрию и отбрасывает неподдерживаемые открытые данные", () => {
    for (const path of Object.values(shapes)) expect(validPath(path)).toBe(true);
    for (const path of ["M1", "M1 3 Q 4", "M0 0Z8", "M0 0 A3 4 0 2 1 5 5", 'M0 0"><image/>', "M9e100 0"])
      expect(validPath(path)).toBe(false);
    expect(
      textPathOptions({
        shape: "custom",
        d: "M3 5L4 8",
        viewBox: "0 0 100 100",
        unit: "vh",
        align: "middle",
        rotate: 900,
      })
    ).toMatchObject({ start: 50, rotate: 360, unit: "px", cx: 50 });
    expect(textPathOptions({ shape: "custom", d: "<script>" }).d).toBe("");
  });
  it("выдаёт отдельный SVG-контур каждой надписи в экспортированном документе", async () => {
    const page = importLegacyDoc({
      title: "Надписи",
      blocks: [
        { id: "a", type: "textpath", text: "<Линия>", showPath: true, align: "middle" },
        { id: "b", type: "textpath", shape: "circle", text: "Кольцо" },
      ],
    });
    const text = await html(page);
    expect(text).toContain('href="#sb-path-0-curve"');
    expect(text).toContain('id="sb-path-1-curve"');
    expect(text).toContain('startOffset="50%"');
    expect(text).toContain("&lt;Линия&gt;");
    expect(text).not.toContain("unknown-widget");
  });
  it("отделяет анонс записи на странице списка и оставляет полный текст на самой записи", async () => {
    const article: Doc = {
      title: "Репортаж",
      entry: { kind: "post" },
      blocks: [
        { type: "p", id: "p", text: "Вступление." },
        { type: "section", id: "s", layoutCells: [[{ type: "readmore", id: "чтение", label: "Полная статья" }]] },
        { type: "p", id: "after", text: "Продолжение." },
      ],
    };
    const index: Doc = {
      title: "Лента",
      blocks: [{ type: "loopgrid", id: "entries", source: "post" }],
      sitePages: {
        version: 1,
        activeId: "home",
        pages: [
          { id: "home", path: "index.html" },
          { id: "article", path: "article.html", document: article },
        ],
      },
    };
    expect(postExcerpt(article).excerpt).toBe("Вступление.");
    const list = await html(index),
      full = await html(article);
    expect(list).toContain("Вступление.");
    expect(list).not.toContain("Продолжение.");
    expect(list).toContain('href="./article.html#' + moreFragment("чтение") + '"');
    expect(full).toContain("Продолжение.");
    expect(full).toContain('id="' + moreFragment("чтение") + '"');
  });
  it("включает внешний аудиоплеер по выбору посетителя, ограничивая источник его адреса", async () => {
    const doc: Doc = {
      title: "Звук",
      blocks: [
        {
          type: "soundcloud",
          id: "s",
          track: "https://soundcloud.com/artist/sets/tracks?ref=social",
          flags: { visual: true, show_artwork: false },
        },
      ],
    };
    for (const input of [
      "http://soundcloud.com/a/b",
      "https://soundcloud.com.other/a/b",
      "https://user@soundcloud.com/a/b",
      "https://soundcloud.com:8443/a/b",
      "data:text/html,hi",
    ])
      expect(soundTrack(input)).toBe("");
    const config = soundSettings(doc.blocks[0]),
      params = new URL(config.embed).searchParams;
    expect(params.get("url")).toBe("https://soundcloud.com/artist/sets/tracks");
    expect(params.get("show_artwork")).toBe("false");
    expect(config.height).toBe(400);
    const external = await html(doc),
      local = await html(doc, true);
    expect(external).toContain("frame-src https://w.soundcloud.com");
    expect(external).toContain('<button type="button" data-soundcloud-player=');
    expect(external).not.toContain("<iframe");
    expect(local).not.toContain('<button type="button" data-soundcloud-player=');
    expect(local).not.toContain("frame-src https://w.soundcloud.com");
  });
});
