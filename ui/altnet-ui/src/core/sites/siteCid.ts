import { CID } from "multiformats/cid";
import { sha256 } from "multiformats/hashes/sha2";

/** Канонический CIDv1 DAG-CBOR/SHA-256 формата сайта AltNet, без пути. */
export function parseSiteRoot(value: string): CID {
  if (typeof value !== "string" || value.length > 120) throw new Error("Некорректный адрес сайта.");
  let cid: CID;
  try { cid = CID.parse(value); } catch { throw new Error("Некорректный адрес сайта."); }
  if (cid.version !== 1 || cid.code !== 0x71 || cid.multihash.code !== sha256.code || cid.multihash.size !== 32) throw new Error("Неподдерживаемый формат CID сайта.");
  if (cid.toString() !== value) throw new Error("Используйте канонический адрес CIDv1.");
  return cid;
}
