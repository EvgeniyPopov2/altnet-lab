import { createEmptyJournal, mergeJournals } from "./journal";
import type { DmJournalV1, DmMessage } from "./types";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

function mkMsg(patch: Partial<DmMessage>): DmMessage {
  const base: DmMessage = {
    id: "m1",
    createdAt: 1000,
    updatedAt: 1000,
    author: "me",
    text: "hi",
    delivery: "sent",
  };
  return { ...base, ...patch };
}

function mkJournal(dmId: string, entries: DmMessage[]): DmJournalV1 {
  return { version: 1, dmId, entries };
}

const tests: Array<[string, () => void]> = [
  [
    "mergeJournals: разные dmId -> возвращаем a",
    () => {
      const a = mkJournal("a", [mkMsg({ id: "a1" })]);
      const b = mkJournal("b", [mkMsg({ id: "b1" })]);
      const m = mergeJournals(a, b);
      assert(m.dmId === "a", "dmId должен остаться от a");
      assert(m.entries.length === 1, "должна остаться 1 запись");
      assert(m.entries[0]?.id === "a1", "должно остаться сообщение a1");
    },
  ],
  [
    "mergeJournals: добавляет новые сообщения из b",
    () => {
      const a = mkJournal("dm", [mkMsg({ id: "m1" })]);
      const b = mkJournal("dm", [mkMsg({ id: "m2" })]);
      const m = mergeJournals(a, b);
      const ids = m.entries.map((x) => x.id).sort();
      assert(ids.join(",") === "m1,m2", `ожидали m1,m2, got ${ids.join(",")}`);
    },
  ],
  [
    "mergeJournals: реакции мержатся union-ом",
    () => {
      const aMsg = mkMsg({
        id: "m1",
        reactions: { "👍": ["me"], "🔥": ["me"] },
        updatedAt: 10,
      });
      const bMsg = mkMsg({
        id: "m1",
        reactions: { "👍": ["them"], "👀": ["them"] },
        updatedAt: 20,
      });
      const a = mkJournal("dm", [aMsg]);
      const b = mkJournal("dm", [bMsg]);
      const m = mergeJournals(a, b);
      assert(m.entries.length === 1, "ожидали 1 сообщение");
      const r = m.entries[0]?.reactions ?? {};
      assert((r["👍"] ?? []).includes("me"), "👍 должен содержать me");
      assert((r["👍"] ?? []).includes("them"), "👍 должен содержать them");
      assert((r["🔥"] ?? []).includes("me"), "🔥 должен содержать me");
      assert((r["👀"] ?? []).includes("them"), "👀 должен содержать them");
    },
  ],
  [
    "mergeJournals: tombstone (deletedAt) побеждает",
    () => {
      const aMsg = mkMsg({ id: "m1", text: "ok", deletedAt: undefined, updatedAt: 10 });
      const bMsg = mkMsg({ id: "m1", text: "ok", deletedAt: 999, updatedAt: 999 });
      const a = mkJournal("dm", [aMsg]);
      const b = mkJournal("dm", [bMsg]);
      const m = mergeJournals(a, b);
      assert(m.entries[0]?.deletedAt === 999, "deletedAt должен сохраниться");
    },
  ],
  [
    "mergeJournals: delivery берётся максимальный (sent < delivered < read)",
    () => {
      const aMsg = mkMsg({ id: "m1", delivery: "sent", updatedAt: 10 });
      const bMsg = mkMsg({ id: "m1", delivery: "read", updatedAt: 5 });
      const a = mkJournal("dm", [aMsg]);
      const b = mkJournal("dm", [bMsg]);
      const m = mergeJournals(a, b);
      assert(m.entries[0]?.delivery === "read", "должен победить read");
        },
    ],
    [
        "mergeJournals: вложения (attachments) мержатся union-ом",
        () => {
            const aMsg = mkMsg({
                id: "m1",
                attachments: [
                    { cid: "cidv1-sha256-aaa", name: "a.png", mime: "image/png", size: 111 },
                ],
                updatedAt: 10,
            });
            const bMsg = mkMsg({
                id: "m1",
                attachments: [
                    { cid: "cidv1-sha256-bbb", name: "b.png", mime: "image/png", size: 222 },
                    // дубликат по cid+name
                    { cid: "cidv1-sha256-aaa", name: "a.png", mime: "image/png", size: 111 },
                ],
                updatedAt: 20,
            });
            const a = mkJournal("dm", [aMsg]);
            const b = mkJournal("dm", [bMsg]);
            const m = mergeJournals(a, b);
            const atts = m.entries[0]?.attachments ?? [];
            const keys = atts.map((x) => `${x.cid}|${x.name}`).sort();
            assert(keys.length === 2, `ожидали 2 вложения, got ${keys.length}`);
            assert(keys[0] === "cidv1-sha256-aaa|a.png", "должно быть вложение a.png");
            assert(keys[1] === "cidv1-sha256-bbb|b.png", "должно быть вложение b.png");
        },
    ],

  [
    "createEmptyJournal: базовые поля",
    () => {
      const j = createEmptyJournal("dm");
      assert(j.version === 1, "version должен быть 1");
      assert(j.dmId === "dm", "dmId должен совпасть");
      assert(Array.isArray(j.entries) && j.entries.length === 0, "entries должны быть пустыми");
    },
  ],
];

for (const [name, fn] of tests) {
  try {
    fn();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`[dm/journal.test] ${name}: ${msg}`);
  }
}

export {};
