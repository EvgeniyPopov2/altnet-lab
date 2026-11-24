import { describe, expect, it, vi } from "vitest";
import { CarReader, CarWriter } from "@ipld/car";
import * as cbor from "@ipld/dag-cbor";
import { CID } from "multiformats/cid";
import * as raw from "multiformats/codecs/raw";
import { sha256 } from "multiformats/hashes/sha2";
import { createSitePackage, parseSiteRoot, SITE_CHUNK_BYTES, verifySitePackage } from "./ipfsSitePackage";
import { adaptFromSiteBuilderDoc, exportSingleHtml } from "../../builder/exporter";

async function archive(roots: CID[], blocks: { cid: CID; bytes: Uint8Array }[]) {
  const { writer, out } = CarWriter.create(roots);
  const reading = (async () => {
    const pieces: Uint8Array[] = [];
    let size = 0;
    for await (const p of out) { pieces.push(p); size += p.length; }
    const result = new Uint8Array(size);
    let offset = 0;
    for (const p of pieces) { result.set(p, offset); offset += p.length; }
    return result;
  })();
  for (const block of blocks) await writer.put(block);
  await writer.close();
  return reading;
}

describe("проверяемый IPLD-пакет сайта", () => {
  const pages = [
    { path: "index.html", title: "Главная", html: "<h1>Привет, AltNet</h1>" },
    { path: "about.html", title: "О нас", html: "<p>" + "x".repeat(SITE_CHUNK_BYTES + 11) + "</p>" },
  ];
  it("создаёт воспроизводимый CAR с настоящими ссылками IPLD и восстанавливает страницы", async () => {
    const first = await createSitePackage("Проверка", pages);
    const second = await createSitePackage("Проверка", [...pages].reverse());
    expect(first.root).toBe(second.root);
    expect(first.car).toEqual(second.car);
    const reader = await CarReader.fromBytes(first.car);
    const root = parseSiteRoot(first.root);
    const manifest = cbor.decode((await reader.get(root))!.bytes) as { pages: { chunks: unknown[] }[] };
    expect(CID.asCID(manifest.pages[0].chunks[0])).not.toBeNull();
    const result = await verifySitePackage(first.car, first.root);
    expect(result).toEqual({root:first.root,title:"Проверка",pages:[pages[1],pages[0]]});
  });
  it("отклоняет подмену содержимого, несовпадающий корень и посторонние блоки", async () => {
    const site = await createSitePackage("Проверка", pages);
    const reader = await CarReader.fromBytes(site.car);
    const root = (await reader.getRoots())[0];
    const blocks = [];
    for await (const block of reader.blocks()) blocks.push(block);
    const altered = blocks.map((block, index) => index === 1 ? { ...block, bytes: block.bytes.slice() } : block);
    altered[1].bytes[0] ^= 1;
    await expect(verifySitePackage(await archive([root], altered), site.root)).rejects.toThrow(/целостности/);
    await expect(verifySitePackage(await archive([root], blocks.slice(0, -1)), site.root)).rejects.toThrow(/отсутствует/);
    const other = await createSitePackage("Другое", pages);
    await expect(verifySitePackage(site.car, other.root)).rejects.toThrow(/не совпадает/);
    const extraBytes = new TextEncoder().encode("extra");
    const extra = {cid:CID.createV1(raw.code,await sha256.digest(extraBytes)),bytes:extraBytes};
    await expect(verifySitePackage(await archive([root], [...blocks,extra]), site.root)).rejects.toThrow(/лишние/);
    await expect(verifySitePackage(await archive([root], [...blocks,blocks[0]]), site.root)).rejects.toThrow(/набор блоков/);
  });
  it("отклоняет опасные пути, дубли, отсутствующую главную и неправильные CID", async () => {
    await expect(createSitePackage("x", [{path:"../index.html",title:"x",html:"x"}])).rejects.toThrow();
    await expect(createSitePackage("x", [{path:"x.html",title:"x",html:"x"}])).rejects.toThrow(/главная/);
    await expect(createSitePackage("x", [pages[0],pages[0]])).rejects.toThrow();
    expect(() => parseSiteRoot("cidv1-sha256-not-a-real-cid")).toThrow();
    const cid = CID.createV1(raw.code,await sha256.digest(new TextEncoder().encode("x")));
    expect(() => parseSiteRoot(cid.toString())).toThrow(/формат CID/);
  });
  it("проверяет схему манифеста даже при правильном хеше", async () => {
    const bytes = cbor.encode({format:"altnet-site",version:1,title:"x",pages:[],hidden:"лишнее"});
    const cid = CID.createV1(cbor.code,await sha256.digest(bytes));
    await expect(verifySitePackage(await archive([cid],[{cid,bytes}]),cid.toString())).rejects.toThrow(/описание сайта/);
  });
  it("сохраняет CID при повторной сборке неизменённой страницы в другое время", async () => {
    vi.useFakeTimers();
    try {
      const model = adaptFromSiteBuilderDoc({title:"Тест",blocks:[{id:"p",type:"p",text:"Без изменений"}]});
      vi.setSystemTime(new Date("2025-01-01T00:00:00Z"));
      const html1 = await (await exportSingleHtml(model,{bundleAssets:false,deterministic:true})).text();
      vi.setSystemTime(new Date("2026-11-24T00:00:00Z"));
      const html2 = await (await exportSingleHtml(model,{bundleAssets:false,deterministic:true})).text();
      expect(html2).toBe(html1);
      expect((await createSitePackage("Тест",[{path:"index.html",title:"Тест",html:html1}])).root)
        .toBe((await createSitePackage("Тест",[{path:"index.html",title:"Тест",html:html2}])).root);
    } finally { vi.useRealTimers(); }
  });
  it("отклоняет архив с чрезмерным числом блоков без построения полного индекса", async () => {
    const site = await createSitePackage("Проверка", [pages[0]]);
    const reader = await CarReader.fromBytes(site.car);
    const root = (await reader.getRoots())[0];
    const blocks = [];
    for await (const block of reader.blocks()) blocks.push(block);
    for (let i=0;i<1030;i++) {
      const bytes = new TextEncoder().encode("лишний блок " + i);
      blocks.push({cid:CID.createV1(raw.code,await sha256.digest(bytes)),bytes});
    }
    await expect(verifySitePackage(await archive([root],blocks),site.root)).rejects.toThrow(/набор блоков/);
  });
});
