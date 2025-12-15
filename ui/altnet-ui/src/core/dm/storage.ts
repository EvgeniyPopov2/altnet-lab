// ui/altnet-ui/src/core/dm/storage.ts
// Persistence DM журнала в localStorage (MVP).

import type { DmJournalV1 } from "./types";

function getLS(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function key(dmId: string): string {
  return `altnet.dm.${dmId}.journal.v1`;
}

export function loadDmJournal(dmId: string): DmJournalV1 | null {
  const ls = getLS();
  if (!ls) return null;

  const raw = ls.getItem(key(dmId));
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<DmJournalV1>;
    if (parsed.version !== 1) return null;
    if (parsed.dmId !== dmId) return null;
    if (!Array.isArray(parsed.entries)) return null;

    return parsed as DmJournalV1;
  } catch {
    return null;
  }
}

export function saveDmJournal(dmId: string, journal: DmJournalV1): void {
  const ls = getLS();
  if (!ls) return;

  // journal.dmId должен совпадать dmId — это инвариант
  ls.setItem(key(dmId), JSON.stringify(journal));
}

export function clearDmJournal(dmId: string): void {
  const ls = getLS();
  if (!ls) return;

  ls.removeItem(key(dmId));
}
