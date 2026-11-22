// ui/altnet-ui/src/core/content/cid.ts
// CID (MVP мок): делаем вид "CIDv1", но по факту это sha256-хэш.
// В дальнейшем заменим на multiformats + реальный CIDv1.

export type CID = string;

function bufToHex(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function fileToCid(file: Blob): Promise<CID> {
  const c = globalThis.crypto;
  if (!c?.subtle) {
    // Без WebCrypto нельзя надёжно идентифицировать содержимое.
    throw new Error("Хеширование недоступно: файл не может быть добавлен.");
  }

  const ab = await file.arrayBuffer();
  const digest = await c.subtle.digest("SHA-256", ab);
  const hex = bufToHex(digest);

  return `cidv1-sha256-${hex}`;
}

export function shortCid(cid: CID): string {
  if (cid.length <= 22) return cid;
  return `${cid.slice(0, 14)}…${cid.slice(-6)}`;
}
