import { describe, expect, it, vi } from "vitest";
import { DraftWriter, writeIndexedDraft } from "./draftPersistence";
import { INDEXED_DB_MARKER, STORAGE_KEY } from "./storage";
import type { Doc } from "./types";

const doc = (title: string): Doc => ({ title, blocks: [] });
function deferred() {
  let resolve!: () => void, reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function storage() {
  let value = JSON.stringify(doc("Предыдущий"));
  return {
    get: () => value,
    setItem: (key: string, text: string) => {
      expect(key).toBe(STORAGE_KEY);
      if (text.includes("LARGE")) throw new Error("quota");
      value = text;
    },
  };
}

describe("надёжное сохранение черновика", () => {
  it("прерывает зависшую транзакцию и сообщает об ошибке", async () => {
    vi.useFakeTimers();
    const abort = vi.fn(), close = vi.fn();
    const tx = { objectStore: () => ({ put: vi.fn() }), abort, oncomplete: null, onabort: null, onerror: null };
    const db = { transaction: () => tx, close, onversionchange: null };
    const request = { result: db, onsuccess: null as (() => void) | null, onerror: null, onblocked: null, onupgradeneeded: null };
    vi.stubGlobal("indexedDB", { open: () => { queueMicrotask(() => request.onsuccess?.()); return request; } });
    try {
      const result = writeIndexedDraft("{}");
      const rejected = expect(result).rejects.toThrow("слишком много времени");
      await Promise.resolve(); await Promise.resolve();
      await vi.advanceTimersByTimeAsync(30000);
      await rejected;
      expect(abort).toHaveBeenCalledOnce();
      expect(close).toHaveBeenCalledOnce();
    } finally { vi.unstubAllGlobals(); vi.useRealTimers(); }
  });
  it("записывает крупный документ в IndexedDB до замены указателя", async () => {
    const target = storage(), io = deferred(), write = vi.fn<(json: string) => Promise<void>>(() => io.promise);
    const writer = new DraftWriter(target, write);
    writer.save(doc("LARGE 1"));
    expect(writer.status).toBe("saving");
    expect(JSON.parse(target.get()).title).toBe("Предыдущий");
    io.resolve(); await writer.waitForIdle();
    expect(target.get()).toBe(INDEXED_DB_MARKER);
    expect(JSON.parse(write.mock.calls[0][0]).title).toBe("LARGE 1");
    expect(writer.status).toBe("indexeddb");
  });

  it("не позволяет старой фоновой записи заменить более новый обычный документ", async () => {
    const target = storage(), io = deferred(), writer = new DraftWriter(target, () => io.promise);
    writer.save(doc("LARGE старая"));
    writer.save(doc("Новая"));
    io.resolve(); await writer.waitForIdle();
    expect(JSON.parse(target.get()).title).toBe("Новая");
    expect(writer.status).toBe("saved");
  });

  it("объединяет ожидающие изменения и сохраняет последнее состояние", async () => {
    const target = storage(), first = deferred(), last = deferred();
    const write = vi.fn<(_json: string) => Promise<void>>().mockImplementationOnce(() => first.promise).mockImplementationOnce(() => last.promise);
    const writer = new DraftWriter(target, write);
    writer.save(doc("LARGE 1")); writer.save(doc("LARGE 2")); writer.save(doc("LARGE 3"));
    first.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(write).toHaveBeenCalledTimes(2);
    expect(JSON.parse(write.mock.calls[1][0]).title).toBe("LARGE 3");
    last.resolve(); await writer.waitForIdle();
    expect(target.get()).toBe(INDEXED_DB_MARKER);
    expect(writer.status).toBe("indexeddb");
  });

  it("при ошибке сохраняет прежний черновик и оставляет несохранённые данные доступными", async () => {
    const target = storage(), writer = new DraftWriter(target, async () => { throw new Error("disk"); });
    const current = doc("LARGE несохранённый");
    writer.save(current); await writer.waitForIdle();
    expect(JSON.parse(target.get()).title).toBe("Предыдущий");
    expect(writer.status).toBe("failed");
    expect(writer.getUnsaved()).toBe(current);
  });

  it("не восстанавливает старую запись после явного сброса", async () => {
    const target = storage(), io = deferred(), writer = new DraftWriter(target, () => io.promise);
    writer.save(doc("LARGE старый")); writer.invalidate(); writer.save(doc("После сброса"));
    io.resolve(); await writer.waitForIdle();
    expect(JSON.parse(target.get()).title).toBe("После сброса");
  });

  it("после переполнения сразу использует IndexedDB и возвращается к малому документу при отказе базы", async () => {
    const target = storage(), setItem = vi.fn(target.setItem);
    const write = vi.fn<(_json: string) => Promise<void>>().mockResolvedValueOnce().mockRejectedValueOnce(new Error("offline"));
    const writer = new DraftWriter({ setItem }, write);
    writer.save(doc("LARGE первая")); await writer.waitForIdle();
    expect(writer.status).toBe("indexeddb");
    setItem.mockClear();
    writer.save(doc("Маленькая")); await writer.waitForIdle();
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(JSON.parse(target.get()).title).toBe("Маленькая");
    expect(writer.status).toBe("saved");
  });
});
