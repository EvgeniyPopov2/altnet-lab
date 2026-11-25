import { CarBlockIterator } from "@ipld/car";
import { exporter } from "ipfs-unixfs-exporter";
import { CID } from "multiformats/cid";
import { equals as digestEquals } from "multiformats/hashes/digest";
import { sha256 } from "multiformats/hashes/sha2";
import { SITE_MAX_CAR_BYTES, SITE_MAX_PAGE_BYTES, SITE_MAX_TOTAL_BYTES, type VerifiedSite } from "./ipfsSitePackage";
import { validSitePath } from "./sitePath";

/** UnixFS CIDv0/CIDv1 с SHA-256; нормализация нужна для единого ключа кэша. */
export function parseUnixfsRoot(value: string): CID {
  if (typeof value !== "string" || value.length > 120) throw new Error("Некорректный CID UnixFS.");
  let cid: CID;
  try { cid = CID.parse(value); } catch { throw new Error("Некорректный CID UnixFS."); }
  if (![0x55, 0x70].includes(cid.code) || cid.multihash.code !== sha256.code || cid.multihash.size !== 32 || cid.toString() !== value) throw new Error("Неподдерживаемый CID UnixFS.");
  return cid.toV1();
}

/** Проверяет каждый блок до доступа экспортёра к нему. Сетевого blockstore здесь нет. */
export async function verifyUnixfsSite(car: Uint8Array, expectedRoot: string): Promise<VerifiedSite> {
  const root = parseUnixfsRoot(expectedRoot);
  if (!(car instanceof Uint8Array) || !car.length || car.length > SITE_MAX_CAR_BYTES) throw new Error("Некорректный размер архива IPFS.");
  let reader: CarBlockIterator;
  try { reader = await CarBlockIterator.fromBytes(car.slice(), { maxAllowedHeaderSize: 1024, maxAllowedSectionSize: 1024 * 1024 + 128 }); }
  catch { throw new Error("Архив IPFS повреждён."); }
  const roots = await reader.getRoots();
  if (roots.length !== 1 || !roots[0].toV1().equals(root)) throw new Error("Корень архива не совпадает с адресом IPFS.");
  const blocks = new Map<string, Uint8Array>();
  let total = 0;
  for await (const { cid, bytes } of reader) {
    const key = cid.toV1().toString();
    if (blocks.size >= 4096 || blocks.has(key) || ![0x55, 0x70].includes(cid.code) || cid.multihash.code !== sha256.code || cid.multihash.size !== 32 || bytes.length > 1024 * 1024) throw new Error("Некорректный набор блоков UnixFS.");
    total += bytes.length;
    if (total > SITE_MAX_TOTAL_BYTES) throw new Error("Данные IPFS слишком велики.");
    if (!digestEquals(await sha256.digest(bytes), cid.multihash)) throw new Error("Проверка целостности блока IPFS не прошла.");
    blocks.set(key, bytes);
  }
  let reads = 0;
  const store = { *get(cid: CID) {
    if (++reads > 16384 || ![0x55, 0x70].includes(cid.code) || cid.multihash.code !== sha256.code || cid.multihash.size !== 32) throw new Error("Недопустимая структура UnixFS.");
    const bytes = blocks.get(cid.toV1().toString());
    if (!bytes) throw new Error("Блок UnixFS отсутствует в архиве.");
    yield bytes;
  } };
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const pages: VerifiedSite["pages"] = [];
  const resources: NonNullable<VerifiedSite["resources"]> = [];
  let extracted = 0;
  async function readFile(cid: CID) {
    const entry = await exporter(cid, store, { offline: true });
    if (entry.type !== "file" && entry.type !== "raw") throw new Error("Страница UnixFS не является файлом.");
    if (entry.size > BigInt(SITE_MAX_PAGE_BYTES)) throw new Error("Страница IPFS слишком велика.");
    const parts: Uint8Array[] = [];
    let size = 0;
    for await (const part of entry.content()) {
      size += part.length; extracted += part.length;
      if (size > SITE_MAX_PAGE_BYTES || extracted > SITE_MAX_TOTAL_BYTES) throw new Error("Страницы IPFS слишком велики.");
      parts.push(part);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const part of parts) { bytes.set(part, offset); offset += part.length; }
    return bytes;
  }
  async function readPage(cid: CID, path: string) {
    let html: string;
    try { html = decoder.decode(await readFile(cid)); } catch (error) {
      if (error instanceof TypeError) throw new Error("Страница IPFS содержит неверный UTF-8.");
      throw error;
    }
    pages.push({ path, title: path, html });
  }
  const entry = await exporter(root, store, { offline: true });
  if (entry.type === "file" || entry.type === "raw") await readPage(root, "index.html");
  else if (entry.type === "directory") {
    let count = 0;
    async function walk(cid: CID, prefix: string, parents: Set<string>) {
      const key = cid.toV1().toString();
      if (parents.has(key)) throw new Error("Циклический каталог UnixFS.");
      const dir = await exporter(cid, store, { offline: true });
      if (dir.type !== "directory") throw new Error("Недопустимый каталог UnixFS.");
      const ancestors = new Set(parents); ancestors.add(key);
    const names = new Set<string>();
    for await (const child of dir.entries()) {
      if (++count > 500 || names.has(child.name)) throw new Error("Некорректное содержимое каталога UnixFS.");
      names.add(child.name);
      const path = prefix ? `${prefix}/${child.name}` : child.name;
      if (!validSitePath(path)) throw new Error("Недопустимый путь UnixFS.");
      const childEntry = await exporter(child.cid, store, { offline: true });
      if (childEntry.type === "directory") { await walk(child.cid, path, ancestors); continue; }
      if (/\.html?$/i.test(child.name)) await readPage(child.cid, path);
      else if (/\.(?:css|png|jpe?g|webp|gif|mp4|webm|mp3|ogg|wav)$/i.test(child.name)) {
        const ext = child.name.split(".").pop()!.toLowerCase();
        const mime = ({css:"text/css",png:"image/png",jpg:"image/jpeg",jpeg:"image/jpeg",webp:"image/webp",gif:"image/gif",mp4:"video/mp4",webm:"video/webm",mp3:"audio/mpeg",ogg:"audio/ogg",wav:"audio/wav"} as Record<string, string>)[ext];
        const bytes = await readFile(child.cid);
        let binary = "";
        for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        resources.push({ path, mime, data: btoa(binary) });
      }
    }
    }
    await walk(root, "", new Set());
  } else throw new Error("Корень IPFS не является сайтом UnixFS.");
  if (!pages.some(page => page.path === "index.html")) throw new Error("В UnixFS не найдена страница index.html.");
  return { root: root.toString(), title: "Сайт IPFS", pages, resources };
}
