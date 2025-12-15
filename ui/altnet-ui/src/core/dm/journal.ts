// ui/altnet-ui/src/core/dm/journal.ts
// CRDT-мок: по сути "наблюдаемый набор" сообщений (dedupe по id) + порядок по времени.
// Для DM этого достаточно как UI-движка; позже заменим на полноценный CRDT-журнал.

import type { DmJournalV1, DmMessage } from "./types";

export function createEmptyJournal(dmId: string): DmJournalV1 {
  return { version: 1, dmId, entries: [] };
}

export function appendMessage(journal: DmJournalV1, msg: DmMessage): DmJournalV1 {
  if (journal.entries.some((m) => m.id === msg.id)) return journal;
  return { ...journal, entries: [...journal.entries, msg] };
}

export function mergeJournals(a: DmJournalV1, b: DmJournalV1): DmJournalV1 {
  if (a.dmId !== b.dmId) return a;

  const map = new Map<string, DmMessage>();
  for (const m of a.entries) map.set(m.id, m);
  for (const m of b.entries) map.set(m.id, m);

  return { ...a, entries: Array.from(map.values()) };
}

export function getOrderedMessages(journal: DmJournalV1): DmMessage[] {
  return [...journal.entries].sort((x, y) => {
    const t = x.createdAt - y.createdAt;
    if (t !== 0) return t;
    return x.id.localeCompare(y.id);
  });
}
