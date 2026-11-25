import { describe, expect, it } from "vitest";
import { CarWriter } from "@ipld/car";
import { importer } from "ipfs-unixfs-importer";
import { CID } from "multiformats/cid";
import { parseBrowserAddress } from "./browserNavigation";
import { verifyUnixfsSite } from "./unixfsSite";

async function fixture() {
  const blocks = new Map<string, { cid: CID; bytes: Uint8Array }>();
  const store = { async put(cid: CID, source: Uint8Array | Iterable<Uint8Array> | AsyncIterable<Uint8Array>) {
    const parts: number[] = [];
    if (source instanceof Uint8Array) parts.push(...source);
    else for await (const part of source) parts.push(...part);
    blocks.set(cid.toString(), { cid, bytes: Uint8Array.from(parts) });
    return cid;
  } };
  const enc = new TextEncoder();
  let root: CID | undefined;
  for await (const entry of importer([{ path: "index.html", content: enc.encode("<h1>UnixFS</h1>") }, { path: "about.html", content: enc.encode("<p>О нас</p>") }], store, { wrapWithDirectory: true, cidVersion: 0, rawLeaves: false })) root = entry.cid;
  if (!root) throw new Error("fixture root missing");
  async function car(items = [...blocks.values()], carRoot = root!) {
    const { writer, out } = CarWriter.create([carRoot]);
    const output = (async () => { const parts: Uint8Array[] = []; let size = 0; for await (const p of out) { parts.push(p); size += p.length; } const result = new Uint8Array(size); let at = 0; for (const p of parts) { result.set(p, at); at += p.length; } return result; })();
    for (const item of items) await writer.put(item);
    await writer.close(); return output;
  }
  return { root, blocks: [...blocks.values()], car };
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
  });
  it("отклоняет подменённые и отсутствующие блоки и неверный корень", async () => {
    const f = await fixture();
    const corrupt = f.blocks.map((b, i) => i ? b : { ...b, bytes: Uint8Array.of(1, 2, 3) });
    await expect(verifyUnixfsSite(await f.car(corrupt), f.root.toString())).rejects.toThrow(/целостности/);
    await expect(verifyUnixfsSite(await f.car(f.blocks.slice(0, -1)), f.root.toString())).rejects.toThrow();
    await expect(verifyUnixfsSite(await f.car(), f.blocks[0].cid.toString())).rejects.toThrow(/не совпадает/);
  });
});
