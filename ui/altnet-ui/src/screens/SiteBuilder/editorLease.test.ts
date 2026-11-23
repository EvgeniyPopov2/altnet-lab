import { describe, expect, it } from "vitest";
import { DraftWriter } from "./draftPersistence";
import { EditorLease } from "./editorLease";
import type { Doc } from "./types";

function fakeLocks(): Pick<LockManager, "request"> {
  let held = false;
  const request = async (_name: string, _options: unknown, callback: (lock: Lock | null) => unknown) => {
    await Promise.resolve();
    if (held) return callback(null);
    held = true;
    try { return await callback({ name: "draft", mode: "exclusive" } as Lock); }
    finally { held = false; }
  };
  return { request: request as LockManager["request"] };
}
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const documentWithTitle = (title: string): Doc => ({ title, blocks: [] });
function deferred() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; }
function writer(write: (json: string) => Promise<void>) {
  return new DraftWriter({ setItem: (_key, value) => { if (value.includes("LARGE")) throw new Error("quota"); } }, write);
}

describe("защита черновика между вкладками", () => {
  it("разрешает редактировать только одной вкладке и освобождает блокировку при закрытии", async () => {
    const locks = fakeLocks(), a = new EditorLease(locks, undefined), b = new EditorLease(locks, undefined);
    expect(await a.acquire()).toBe("owned");
    expect(await b.acquire()).toBe("busy");
    b.release(); a.release(); await tick();
    expect(await b.acquire()).toBe("owned");
    b.release(); await tick();
  });

  it("не освобождает блокировку, пока идёт запись большого документа", async () => {
    const locks = fakeLocks(), io = deferred(), w = writer(() => io.promise);
    const a = new EditorLease(locks, w), b = new EditorLease(locks, undefined);
    expect(await a.acquire()).toBe("owned");
    w.save(documentWithTitle("LARGE")); a.release(); await tick();
    expect(await b.acquire()).toBe("busy"); b.release();
    io.resolve(); await w.waitForIdle(); await tick();
    expect(await b.acquire()).toBe("owned"); b.release(); await tick();
  });

  it("удерживает блокировку при несохранённой ошибке, пока данные не будут сохранены", async () => {
    const locks = fakeLocks(), w = writer(async () => { throw new Error("disk"); });
    const a = new EditorLease(locks, w), b = new EditorLease(locks, undefined);
    expect(await a.acquire()).toBe("owned");
    w.save(documentWithTitle("LARGE")); await w.waitForIdle(); a.release(); await tick();
    expect(await b.acquire()).toBe("busy"); b.release();
    expect(await a.acquire()).toBe("owned");
    w.save(documentWithTitle("Сохранено")); a.release(); await tick();
    expect(await b.acquire()).toBe("owned"); b.release(); await tick();
  });

  it("переживает быстрое повторное монтирование и сообщает об отсутствии API", async () => {
    const locks = fakeLocks(), a = new EditorLease(locks, undefined), b = new EditorLease(locks, undefined);
    const first = a.acquire(); a.release(); const second = a.acquire();
    expect(await first).toBe("owned"); expect(await second).toBe("owned");
    expect(await b.acquire()).toBe("busy"); b.release(); a.release(); await tick();
    expect(await b.acquire()).toBe("owned"); b.release(); await tick();
    expect(await new EditorLease(undefined, undefined).acquire()).toBe("unsupported");
  });
});
