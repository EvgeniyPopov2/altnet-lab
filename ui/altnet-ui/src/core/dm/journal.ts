// ui/altnet-ui/src/core/dm/journal.ts
// CRDT-мок: по сути "наблюдаемый набор" сообщений (dedupe по id) + порядок по времени.
// Для DM этого достаточно как UI-движка; позже заменим на полноценный CRDT-журнал.

import type { DmAttachment, DmJournalV1, DmMessage, DmReactions } from "./types";

function ts(m: DmMessage): number {
  return m.updatedAt ?? m.createdAt;
}

function mergeReactions(a?: DmReactions, b?: DmReactions): DmReactions | undefined {
  if (!a && !b) return undefined;

  const out: DmReactions = {};
  const keys = new Set<string>();
  for (const k of Object.keys(a ?? {})) keys.add(k);
  for (const k of Object.keys(b ?? {})) keys.add(k);

  for (const k of keys) {
    const aa = a?.[k] ?? [];
    const bb = b?.[k] ?? [];
    const set = new Set<string>();
    for (const id of aa) set.add(id);
    for (const id of bb) set.add(id);
    const arr = Array.from(set);
    arr.sort();
    if (arr.length > 0) out[k] = arr;
  }

  return Object.keys(out).length > 0 ? out : undefined;
}

function mergeAttachments(a?: DmAttachment[], b?: DmAttachment[]): DmAttachment[] | undefined {
  if (!a && !b) return undefined;
  const out = new Map<string, DmAttachment>();

  const push = (att: DmAttachment) => {
    // key по cid + name (на MVP достаточно)
    const k = `${att.cid}|${att.name}`;
    out.set(k, att);
  };

  for (const att of a ?? []) push(att);
  for (const att of b ?? []) push(att);

  const arr = Array.from(out.values());
  return arr.length > 0 ? arr : undefined;
}

function deliveryRank(d?: DmMessage["delivery"]): number {
  switch (d) {
    case "read":
      return 3;
    case "delivered":
      return 2;
    case "sent":
      return 1;
    default:
      return 0;
  }
}

function maxDelivery(a?: DmMessage["delivery"], b?: DmMessage["delivery"]): DmMessage["delivery"] | undefined {
  return deliveryRank(a) >= deliveryRank(b) ? a : b;
}

function mergeMessage(a: DmMessage, b: DmMessage): DmMessage {
  // 1) Tombstone побеждает (если кто-то удалил — считаем удалённым).
  const deletedAt = Math.max(a.deletedAt ?? 0, b.deletedAt ?? 0) || undefined;

  // 2) LWW по updatedAt/createdAt для «тела».
  const newer = ts(a) >= ts(b) ? a : b;
  const older = newer === a ? b : a;

  // 3) Поля, которые мержим независимо.
  const reactions = mergeReactions(a.reactions, b.reactions);
  const attachments = mergeAttachments(a.attachments, b.attachments);
  const delivery = maxDelivery(a.delivery, b.delivery);

  const merged: DmMessage = {
    ...older,
    ...newer,
    // инварианты
    id: a.id,
    author: a.author,
    createdAt: Math.min(a.createdAt, b.createdAt),
    updatedAt: Math.max(ts(a), ts(b)),
    deletedAt,
    reactions,
    attachments,
    delivery,
  };

  return merged;
}

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
  for (const m of b.entries) {
    const prev = map.get(m.id);
    map.set(m.id, prev ? mergeMessage(prev, m) : m);
  }

  return { ...a, entries: Array.from(map.values()) };
}

export function getOrderedMessages(journal: DmJournalV1): DmMessage[] {
  return [...journal.entries].sort((x, y) => {
    const t = x.createdAt - y.createdAt;
    if (t !== 0) return t;
    return x.id.localeCompare(y.id);
  });
}
