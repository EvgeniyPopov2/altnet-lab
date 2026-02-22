import { describe, expect, it } from "vitest";

import { createEmptyJournal, mergeJournals } from "./journal";
import type { DmJournalV1, DmMessage } from "./types";

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

describe("mergeJournals", () => {
  it("returns first journal when dmId differs", () => {
    const a = mkJournal("a", [mkMsg({ id: "a1" })]);
    const b = mkJournal("b", [mkMsg({ id: "b1" })]);
    const m = mergeJournals(a, b);
    expect(m.dmId).toBe("a");
    expect(m.entries).toHaveLength(1);
    expect(m.entries[0]?.id).toBe("a1");
  });

  it("adds new messages from b", () => {
    const a = mkJournal("dm", [mkMsg({ id: "m1" })]);
    const b = mkJournal("dm", [mkMsg({ id: "m2" })]);
    const m = mergeJournals(a, b);
    const ids = m.entries.map((x) => x.id).sort();
    expect(ids).toEqual(["m1", "m2"]);
  });

  it("merges reactions as union", () => {
    const a = mkJournal("dm", [
      mkMsg({ id: "m1", reactions: { "👍": ["me"], "🔥": ["me"] }, updatedAt: 10 }),
    ]);
    const b = mkJournal("dm", [
      mkMsg({ id: "m1", reactions: { "👍": ["them"], "👀": ["them"] }, updatedAt: 20 }),
    ]);
    const m = mergeJournals(a, b);
    const r = m.entries[0]?.reactions ?? {};
    expect(r["👍"] ?? []).toEqual(expect.arrayContaining(["me", "them"]));
    expect(r["🔥"] ?? []).toEqual(expect.arrayContaining(["me"]));
    expect(r["👀"] ?? []).toEqual(expect.arrayContaining(["them"]));
  });

  it("keeps tombstone deletedAt when present", () => {
    const a = mkJournal("dm", [mkMsg({ id: "m1", text: "ok", updatedAt: 10 })]);
    const b = mkJournal("dm", [mkMsg({ id: "m1", text: "ok", deletedAt: 999, updatedAt: 999 })]);
    const m = mergeJournals(a, b);
    expect(m.entries[0]?.deletedAt).toBe(999);
  });

  it("uses max delivery state", () => {
    const a = mkJournal("dm", [mkMsg({ id: "m1", delivery: "sent", updatedAt: 10 })]);
    const b = mkJournal("dm", [mkMsg({ id: "m1", delivery: "read", updatedAt: 5 })]);
    const m = mergeJournals(a, b);
    expect(m.entries[0]?.delivery).toBe("read");
  });

  it("merges attachments as union", () => {
    const a = mkJournal("dm", [
      mkMsg({
        id: "m1",
        attachments: [{ cid: "cidv1-sha256-aaa", name: "a.png", mime: "image/png", size: 111 }],
        updatedAt: 10,
      }),
    ]);
    const b = mkJournal("dm", [
      mkMsg({
        id: "m1",
        attachments: [
          { cid: "cidv1-sha256-bbb", name: "b.png", mime: "image/png", size: 222 },
          { cid: "cidv1-sha256-aaa", name: "a.png", mime: "image/png", size: 111 },
        ],
        updatedAt: 20,
      }),
    ]);

    const m = mergeJournals(a, b);
    const keys = (m.entries[0]?.attachments ?? []).map((x) => `${x.cid}|${x.name}`).sort();
    expect(keys).toEqual(["cidv1-sha256-aaa|a.png", "cidv1-sha256-bbb|b.png"]);
  });
});

describe("createEmptyJournal", () => {
  it("returns baseline shape", () => {
    const j = createEmptyJournal("dm");
    expect(j.version).toBe(1);
    expect(j.dmId).toBe("dm");
    expect(j.entries).toEqual([]);
  });
});
