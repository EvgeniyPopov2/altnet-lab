import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CarWriter } from "@ipld/car";
import { importer } from "ipfs-unixfs-importer";
import { CID } from "multiformats/cid";
import { verifyUnixfsSite } from "../src/core/sites/unixfsSite";

const [action, dir] = process.argv.slice(2);
if (!dir || !["create", "verify"].includes(action)) throw new Error("Укажите create|verify и каталог теста");
if (action === "create") {
  const blocks = new Map<string, { cid: CID; bytes: Uint8Array }>();
  const store = { async put(cid: CID, source: Uint8Array | Iterable<Uint8Array> | AsyncIterable<Uint8Array>) {
    const parts: Uint8Array[] = [];
    if (source instanceof Uint8Array) parts.push(source); else for await (const part of source) parts.push(part);
    blocks.set(cid.toString(), { cid, bytes: Buffer.concat(parts) }); return cid;
  } };
  let root: CID | undefined;
  const hostileHtml = '<h1>Проверка UnixFS через Tor</h1><script>document.body.dataset.attack="executed";fetch("https://example.invalid/attack")</script><img src="https://example.invalid/pixel">';
  for await (const entry of importer([{ path: "index.html", content: new TextEncoder().encode(hostileHtml) }], store, { wrapWithDirectory: true })) root = entry.cid;
  if (!root) throw new Error("Нет корня UnixFS");
  const { writer, out } = CarWriter.create([root]);
  const output = (async () => { const parts: Uint8Array[] = []; for await (const part of out) parts.push(part); return Buffer.concat(parts); })();
  for (const block of blocks.values()) await writer.put(block);
  await writer.close();
  await writeFile(join(dir, "site.car"), await output, { flag: "wx" });
  await writeFile(join(dir, "root.txt"), root.toV1().toString(), { flag: "wx" });
} else {
  const root = (await readFile(join(dir, "root.txt"), "utf8")).trim();
  const site = await verifyUnixfsSite(new Uint8Array(await readFile(join(dir, "received.car"))), root);
  if (!site.pages.some(page => page.html.includes("Проверка UnixFS через Tor"))) throw new Error("Содержимое UnixFS не совпадает");
}
