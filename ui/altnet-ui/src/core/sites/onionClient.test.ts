import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchOnionCar } from "./onionCar";
import { shareStatus } from "./onionShare";

afterEach(() => vi.unstubAllGlobals());

describe("обновление работающего клиента", () => {
  it("объясняет необходимость перезапуска, если у старого клиента нет API", async () => {
    vi.stubGlobal("document", { querySelector: () => ({ content: "test-session" }) });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 404 })));
    const root = "bafyreigtyjaoj5k2suhsp5ntybwqu6m7ljsn2dawfsvnctymnj4p3muv3i";
    await expect(fetchOnionCar("a".repeat(56) + ".onion", root)).rejects.toThrow("Перезапустите AltNet");
    await expect(shareStatus()).rejects.toThrow("Перезапустите AltNet");
  });
});
