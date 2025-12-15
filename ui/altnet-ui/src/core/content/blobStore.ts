// ui/altnet-ui/src/core/content/blobStore.ts
// In-memory blob store для предпросмотра вложений в UI.
// В проде blob будет подтягиваться через контент-слой (IPFS/IPLD) по CID.

import type { CID } from "./cid";

export type BlobEntry = {
  cid: CID;
  url: string;
  name: string;
  mime: string;
  size: number;
  addedAt: number;
};

const store = new Map<CID, BlobEntry>();

export function putFile(cid: CID, file: File): BlobEntry {
  const prev = store.get(cid);
  if (prev) {
    try {
      URL.revokeObjectURL(prev.url);
    } catch {
      // ignore
    }
  }

  const url = URL.createObjectURL(file);
  const entry: BlobEntry = {
    cid,
    url,
    name: file.name,
    mime: file.type || "application/octet-stream",
    size: file.size,
    addedAt: Date.now(),
  };

  store.set(cid, entry);
  return entry;
}

export function getBlob(cid: CID): BlobEntry | null {
  return store.get(cid) ?? null;
}

export function getUrl(cid: CID): string | null {
  return store.get(cid)?.url ?? null;
}

export function revoke(cid: CID): void {
  const entry = store.get(cid);
  if (!entry) return;

  try {
    URL.revokeObjectURL(entry.url);
  } catch {
    // ignore
  }

  store.delete(cid);
}

export function clearAllBlobs(): void {
  for (const cid of store.keys()) revoke(cid);
}
