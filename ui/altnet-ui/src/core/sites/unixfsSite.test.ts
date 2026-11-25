import { describe, expect, it } from "vitest";
import { CarWriter } from "@ipld/car";
import { importer } from "ipfs-unixfs-importer";
import { exporter } from "ipfs-unixfs-exporter";
import { CID } from "multiformats/cid";
import { parseBrowserAddress } from "./browserNavigation";
import { verifyUnixfsSite } from "./unixfsSite";

async function fixture(sharded = false, large = false, extra: "invalid" | "many" | "" = "") {
  const blocks = new Map<string, { cid: CID; bytes: Uint8Array }>();
  const store = { *get(cid: CID) { const block = blocks.get(cid.toString()); if (!block) throw new Error("Missing fixture block"); yield block.bytes; }, async put(cid: CID, source: Uint8Array | Iterable<Uint8Array> | AsyncIterable<Uint8Array>) {
    const parts: Uint8Array[] = [];
    if (source instanceof Uint8Array) parts.push(source);
    else for await (const part of source) parts.push(part);
    const bytes = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
    let offset = 0; for (const part of parts) { bytes.set(part, offset); offset += part.length; }
    blocks.set(cid.toString(), { cid, bytes });
    return cid;
  } };
  const enc = new TextEncoder();
  let root: CID | undefined;
  const files = [{ path: "index.html", content: enc.encode("<h1>UnixFS</h1>" + (large ? "x".repeat(300_000) : "")) }, { path: "about.html", content: enc.encode("<p>О нас</p>") }];
  if (extra === "invalid") files.push({ path: "bad\u0001name/index.html", content: enc.encode("bad") });
  if (extra === "many") for (let i = 0; i < 500; i++) files.push({ path: `file-${i}.txt`, content: enc.encode("same") });
  for await (const entry of importer(files, store, { wrapWithDirectory: true, cidVersion: 0, rawLeaves: false, ...(sharded ? { shardSplitThresholdBytes: 1 } : {}) })) root = entry.cid;
  if (!root) throw new Error("fixture root missing");
  async function car(items = [...blocks.values()], carRoot = root!) {
    const { writer, out } = CarWriter.create([carRoot]);
    const output = (async () => { const parts: Uint8Array[] = []; let size = 0; for await (const p of out) { parts.push(p); size += p.length; } const result = new Uint8Array(size); let at = 0; for (const p of parts) { result.set(p, at); at += p.length; } return result; })();
    for (const item of items) await writer.put(item);
    await writer.close(); return output;
  }
  return { root, blocks: [...blocks.values()], car, store };
}

describe("проверка стандартного сайта UnixFS", () => {
  it("открывает настоящий CAR с CIDv0 и приводит адрес к CIDv1", async () => {
    const f = await fixture();
    expect(f.root.version).toBe(0);
    const site = await verifyUnixfsSite(await f.car(), f.root.toString());
    expect(site.root).toBe(f.root.toV1().toString());
    expect(site.pages.find(p => p.path === "index.html")?.html).toBe("<h1>UnixFS</h1>");
    expect(site.pages.find(p => p.path === "about.html")?.html).toContain("О нас");
    expect(parseBrowserAddress(`ipfs://${f.root}`).url).toBe(`ipfs://${site.root}`);
    expect(parseBrowserAddress(`alt://onion/${"a".repeat(56)}.onion/${f.root}`)).toMatchObject({ kind: "onion-share", root: site.root });
  });
  it("отклоняет подменённые и отсутствующие блоки и неверный корень", async () => {
    const f = await fixture();
    const corrupt = f.blocks.map((b, i) => i ? b : { ...b, bytes: Uint8Array.of(1, 2, 3) });
    await expect(verifyUnixfsSite(await f.car(corrupt), f.root.toString())).rejects.toThrow(/целостности/);
    await expect(verifyUnixfsSite(await f.car(f.blocks.slice(0, -1)), f.root.toString())).rejects.toThrow();
    await expect(verifyUnixfsSite(await f.car(), f.blocks[0].cid.toString())).rejects.toThrow(/не совпадает/);
  });
  it("читает страницы из шардированного каталога UnixFS", async () => {
    const f = await fixture(true);
    const rootEntry = await exporter(f.root, f.store);
    expect(rootEntry.type === "directory" && rootEntry.unixfs.type).toBe("hamt-sharded-directory");
    const site = await verifyUnixfsSite(await f.car(), f.root.toString());
    expect(site.pages.map(page => page.path).sort()).toEqual(["about.html", "index.html"]);
  });
  it("восстанавливает страницу из нескольких проверенных блоков", async () => {
    const f = await fixture(false, true);
    expect(f.blocks.length).toBeGreaterThanOrEqual(5);
    const site = await verifyUnixfsSite(await f.car(), f.root.toString());
    expect(site.pages.find(page => page.path === "index.html")?.html).toBe("<h1>UnixFS</h1>" + "x".repeat(300_000));
  });
  it("отклоняет недопустимые имена и слишком большое число файлов", async () => {
    for (const extra of ["invalid", "many"] as const) {
      const f = await fixture(false, false, extra);
      await expect(verifyUnixfsSite(await f.car(), f.root.toString())).rejects.toThrow(/путь|содержимое каталога/);
    }
  });
});
