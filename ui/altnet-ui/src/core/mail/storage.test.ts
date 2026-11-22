import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearMailStore, gcMailStoreByTTL, loadMailStore, saveMailStore } from "./storage";
import type { MailMessage, MailStoreV1 } from "./types";

function createStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() { return data.size; },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => Array.from(data.keys())[index] ?? null,
    removeItem: (key) => { data.delete(key); },
    setItem: (key, value) => { data.set(key, String(value)); },
  };
}

function message(id: string, expiresAt?: number): MailMessage {
  return { id, folder: "inbox", createdAt: 1, updatedAt: 1, from: "a", to: ["b"], subject: "Тема", body: "Текст", expiresAt };
}

describe("локальное хранилище почты", () => {
  beforeEach(() => vi.stubGlobal("localStorage", createStorage()));
  afterEach(() => vi.unstubAllGlobals());

  it("сохраняет и восстанавливает письмо", () => {
    const store: MailStoreV1 = { version: 1, messages: [message("1")] };
    saveMailStore(store);
    expect(loadMailStore(100)).toEqual(store);
  });

  it("удаляет письма, срок которых истёк, и сохраняет остальные", () => {
    saveMailStore({ version: 1, messages: [message("старое", 100), message("новое", 101), message("без срока")] });
    expect(loadMailStore(100)?.messages.map((item) => item.id)).toEqual(["новое", "без срока"]);
    expect(loadMailStore(99)?.messages.map((item) => item.id)).toEqual(["новое", "без срока"]);
  });

  it("не меняет хранилище, если просроченных писем нет", () => {
    const store: MailStoreV1 = { version: 1, messages: [message("1", 101)] };
    expect(gcMailStoreByTTL(store, 100)).toBe(store);
  });

  it("не загружает повреждённый или несовместимый журнал", () => {
    localStorage.setItem("altnet.mail.store.v1", "{ошибка");
    expect(loadMailStore()).toBeNull();
    localStorage.setItem("altnet.mail.store.v1", JSON.stringify({ version: 2, messages: [] }));
    expect(loadMailStore()).toBeNull();
  });

  it("отбрасывает повреждённые записи, сохраняя корректные", () => {
    localStorage.setItem("altnet.mail.store.v1", JSON.stringify({ version: 1, messages: [message("1"), { id: "пустое" }] }));
    expect(loadMailStore()?.messages.map((item) => item.id)).toEqual(["1"]);
  });

  it("очищает сохранённый журнал", () => {
    saveMailStore({ version: 1, messages: [message("1")] });
    clearMailStore();
    expect(loadMailStore()).toBeNull();
  });
});
