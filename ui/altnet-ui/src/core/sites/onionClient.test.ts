import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchOnionCar } from "./onionCar";
import { shareStatus } from "./onionShare";

afterEach(() => vi.unstubAllGlobals());

describe("обновление работающего клиента", () => {
  it("объясняет необходимость перезапуска, если у старого клиента нет API", async () => {
    vi.stubGlobal("document", { querySelector: () => ({ content: "test-session" }) });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 404 })));
    const root = "bafyreigtyjaoj5k2suhsp5ntybwqu6m7ljsn2dawfsvnctymnj4p3muv3i";
    await expect(fetchOnionCar("a".repeat(56) + ".onion", root, "anon")).rejects.toThrow("Перезапустите AltNet");
    await expect(shareStatus()).rejects.toThrow("Перезапустите AltNet");
  });
  it("не выполняет сетевых запросов в быстром профиле без подтверждённого маршрута", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(fetchOnionCar("a".repeat(56) + ".onion", "not-used", "fast")).rejects.toThrow("Быстрый маршрут");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("прерывает запрос при отмене владельцем профиля", async () => {
    const root = "bafyreigtyjaoj5k2suhsp5ntybwqu6m7ljsn2dawfsvnctymnj4p3muv3i";
    const controller = new AbortController();
    vi.stubGlobal("document", { querySelector: () => ({ content: "test-session" }) });
    vi.stubGlobal("fetch", vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(new DOMException("Отменено", "AbortError")));
    })));
    const request = fetchOnionCar("a".repeat(56) + ".onion", root, "anon", controller.signal);
    controller.abort();
    await expect(request).rejects.toMatchObject({ name: "AbortError" });
  });
});
