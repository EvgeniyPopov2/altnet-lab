import { CarBlockIterator, CarWriter } from "@ipld/car";
import * as cbor from "@ipld/dag-cbor";
import { CID } from "multiformats/cid";
import * as raw from "multiformats/codecs/raw";
import { sha256 } from "multiformats/hashes/sha2";
import { equals as digestEquals } from "multiformats/hashes/digest";
import { isRecord } from "../records";
import type { PublishedPage } from "./publishedDb";
import { parseSiteRoot } from "./siteCid";
export { parseSiteRoot } from "./siteCid";

// Ограничения применяются до разбора и до выделения памяти под страницы.
export const SITE_CHUNK_BYTES = 256 * 1024;
export const SITE_MAX_PAGE_BYTES = 16 * 1024 * 1024;
export const SITE_MAX_TOTAL_BYTES = 64 * 1024 * 1024;
export const SITE_MAX_CAR_BYTES = 72 * 1024 * 1024;
const MAX_PAGES = 500;
const MAX_BLOCKS = 1024;
const MAX_MANIFEST_BYTES = 512 * 1024;
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const validPath = (path: string) => /^[a-z0-9][a-z0-9-]{0,63}\.html$/.test(path);
const validTitle = (value: unknown): value is string => typeof value === "string" && value.length <= 300;

type SiteManifest = {
  format: "altnet-site";
  version: 1;
  title: string;
  pages: { path: string; title: string; size: number; chunks: CID[] }[];
};
type Block = { cid: CID; bytes: Uint8Array };
export type SitePackage = { root: string; car: Uint8Array };
export type VerifiedSite = { root: string; title: string; pages: PublishedPage[] };

function assertCid(cid: CID, codec: number) {
  if (cid.version !== 1 || cid.code !== codec || cid.multihash.code !== sha256.code || cid.multihash.size !== 32) {
    throw new Error("Неподдерживаемый формат CID сайта.");
  }
}

async function makeBlock(codec: number, bytes: Uint8Array): Promise<Block> {
  return { cid: CID.createV1(codec, await sha256.digest(bytes)), bytes };
}

function join(parts: Uint8Array[], length: number): Uint8Array {
  const result = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  if (offset !== length) throw new Error("Размер данных сайта не совпадает.");
  return result;
}

/** Создаёт настоящий CAR с IPLD-ссылками, но не устанавливает сетевое соединение. */
export async function createSitePackage(title: string, pages: PublishedPage[]): Promise<SitePackage> {
  if (!validTitle(title) || !Array.isArray(pages) || pages.length < 1 || pages.length > MAX_PAGES) throw new Error("Некорректный состав сайта.");
  if (pages.some(page => !page || typeof page.path !== "string")) throw new Error("Некорректная страница сайта.");
  const ordered = [...pages].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  const seen = new Set<string>();
  const chunks = new Map<string, Block>();
  const records: SiteManifest["pages"] = [];
  let total = 0;
  for (const page of ordered) {
    if (!page || typeof page.path !== "string" || !validPath(page.path) || seen.has(page.path) || !validTitle(page.title) || typeof page.html !== "string" || !page.html) throw new Error("Некорректная страница сайта.");
    seen.add(page.path);
    if (page.html.length > SITE_MAX_PAGE_BYTES) throw new Error("Сайт превышает допустимый размер.");
    const bytes = encoder.encode(page.html);
    total += bytes.length;
    if (bytes.length > SITE_MAX_PAGE_BYTES || total > SITE_MAX_TOTAL_BYTES) throw new Error("Сайт превышает допустимый размер.");
    const links: CID[] = [];
    for (let i = 0; i < bytes.length; i += SITE_CHUNK_BYTES) {
      const block = await makeBlock(raw.code, bytes.slice(i, i + SITE_CHUNK_BYTES));
      links.push(block.cid);
      chunks.set(block.cid.toString(), block);
      if (chunks.size > MAX_BLOCKS) throw new Error("Слишком много блоков сайта.");
    }
    records.push({ path: page.path, title: page.title, size: bytes.length, chunks: links });
  }
  if (!seen.has("index.html")) throw new Error("В сайте отсутствует главная страница.");
  const manifest: SiteManifest = { format: "altnet-site", version: 1, title, pages: records };
  const manifestBytes = cbor.encode(manifest);
  if (manifestBytes.length > MAX_MANIFEST_BYTES) throw new Error("Описание сайта слишком большое.");
  const root = await makeBlock(cbor.code, manifestBytes);
  const { writer, out } = CarWriter.create([root.cid]);
  const reading = (async () => {
    const parts: Uint8Array[] = [];
    let size = 0;
    for await (const part of out) {
      size += part.length;
      if (size > SITE_MAX_CAR_BYTES) throw new Error("Архив сайта слишком большой.");
      parts.push(part);
    }
    return join(parts, size);
  })();
  await writer.put(root);
  for (const block of chunks.values()) await writer.put(block);
  await writer.close();
  return { root: root.cid.toString(), car: await reading };
}

/** Проверяет CAR, корневой CID и каждый блок до передачи HTML в песочницу. */
export async function verifySitePackage(car: Uint8Array, expectedRoot: string): Promise<VerifiedSite> {
  const root = parseSiteRoot(expectedRoot);
  if (!(car instanceof Uint8Array) || !car.length || car.length > SITE_MAX_CAR_BYTES) throw new Error("Некорректный размер архива сайта.");
  let reader: CarBlockIterator;
  try { reader = await CarBlockIterator.fromBytes(car.slice(), {maxAllowedHeaderSize:1024,maxAllowedSectionSize:MAX_MANIFEST_BYTES + 128}); }
  catch { throw new Error("Архив сайта повреждён."); }
  const roots = await reader.getRoots();
  if (roots.length !== 1 || !roots[0].equals(root)) throw new Error("Корень архива не совпадает с адресом сайта.");
  const blocks = new Map<string, Uint8Array>();
  for await (const block of reader) {
    if (blocks.size >= MAX_BLOCKS + 1 || blocks.has(block.cid.toString())) throw new Error("Некорректный набор блоков сайта.");
    if (block.cid.equals(root)) {
      assertCid(block.cid, cbor.code);
      if (block.bytes.length > MAX_MANIFEST_BYTES) throw new Error("Описание сайта слишком большое.");
    } else {
      assertCid(block.cid, raw.code);
      if (!block.bytes.length || block.bytes.length > SITE_CHUNK_BYTES) throw new Error("Некорректный размер блока сайта.");
    }
    if (!digestEquals(await sha256.digest(block.bytes), block.cid.multihash)) throw new Error("Проверка целостности блока сайта не прошла.");
    blocks.set(block.cid.toString(), block.bytes);
  }
  const rootBytes = blocks.get(root.toString());
  if (!rootBytes) throw new Error("Отсутствует описание сайта.");
  let manifest: unknown;
  try { manifest = cbor.decode(rootBytes); } catch { throw new Error("Описание сайта повреждено."); }
  if (!isRecord(manifest) || Object.keys(manifest).sort().join(",") !== "format,pages,title,version" || manifest.format !== "altnet-site" || manifest.version !== 1 || !validTitle(manifest.title) || !Array.isArray(manifest.pages) || !manifest.pages.length || manifest.pages.length > MAX_PAGES) throw new Error("Некорректное описание сайта.");
  const used = new Set([root.toString()]), paths = new Set<string>();
  const pages: PublishedPage[] = [];
  let total = 0;
  for (const page of manifest.pages) {
    if (!isRecord(page) || Object.keys(page).sort().join(",") !== "chunks,path,size,title" || typeof page.path !== "string" || !validPath(page.path) || paths.has(page.path) || !validTitle(page.title) || typeof page.size !== "number" || !Number.isInteger(page.size) || page.size < 1 || page.size > SITE_MAX_PAGE_BYTES || !Array.isArray(page.chunks) || page.chunks.length !== Math.ceil(page.size / SITE_CHUNK_BYTES)) throw new Error("Некорректное описание страницы.");
    paths.add(page.path);
    total += page.size;
    if (total > SITE_MAX_TOTAL_BYTES) throw new Error("Сайт превышает допустимый размер.");
    const parts: Uint8Array[] = [];
    for (const [index, value] of page.chunks.entries()) {
      const cid = CID.asCID(value);
      if (!cid) throw new Error("Некорректная ссылка на блок.");
      assertCid(cid, raw.code);
      const key = cid.toString(), bytes = blocks.get(key);
      const expected = index === page.chunks.length - 1 ? page.size - index * SITE_CHUNK_BYTES : SITE_CHUNK_BYTES;
      if (!bytes || bytes.length !== expected) throw new Error("Блок страницы отсутствует или повреждён.");
      used.add(key); parts.push(bytes);
    }
    let html: string;
    try { html = decoder.decode(join(parts, page.size)); } catch { throw new Error("Страница содержит неверный UTF-8."); }
    pages.push({ path: page.path, title: page.title, html });
  }
  if (!paths.has("index.html") || used.size !== blocks.size) throw new Error("Архив содержит лишние или отсутствующие данные.");
  return { root: root.toString(), title: manifest.title, pages };
}
