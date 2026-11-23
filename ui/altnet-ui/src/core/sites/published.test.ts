import { afterEach, describe, expect, it, vi } from "vitest";
import { deletePublishedSite, getPublishedSite, listPublishedSites, slugify, upsertPublishedSite } from "./published";

describe("локальные публикации при недоступном IndexedDB", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("показывает старую копию с предупреждением и не заявляет успешную запись", async () => {
    const values = new Map([
      ["altnet.sites.published.index.v1", JSON.stringify([{ slug: "legacy", title: "Старый сайт", createdAt: 1, updatedAt: 2, extra: "сохранить" }])],
      ["altnet.sites.published.site.v1:legacy", "<p>Содержимое</p>"],
    ]);
    const setItem = vi.fn(), removeItem = vi.fn();
    vi.stubGlobal("window", { localStorage: { getItem: (key: string) => values.get(key) ?? null, setItem, removeItem } });
    vi.stubGlobal("indexedDB", { open: () => { throw new Error("unavailable"); } });
    const catalog = await listPublishedSites();
    expect(catalog.sites).toMatchObject([{ slug: "legacy", extra: "сохранить" }]);
    expect(catalog.warning).toContain("новое хранилище");
    expect(await getPublishedSite("legacy")).toMatchObject({ html: "<p>Содержимое</p>", storageWarning: expect.any(String) });
    await expect(upsertPublishedSite({ title: "Новый", html: "<p>Новый</p>" })).rejects.toThrow();
    await expect(deletePublishedSite("legacy")).rejects.toThrow();
    expect(setItem).not.toHaveBeenCalled(); expect(removeItem).not.toHaveBeenCalled();
  });

  it("выделяет повреждённый старый список вместо молчаливой потери данных", async () => {
    vi.stubGlobal("window", { localStorage: { getItem: () => "{" } });
    vi.stubGlobal("indexedDB", { open: () => { throw new Error("unavailable"); } });
    const catalog = await listPublishedSites();
    expect(catalog.sites).toEqual([]);
    expect(catalog.warning).toContain("новое хранилище и старый список");
  });
});

it("строит читаемый адрес для русских названий", () => {
  expect(slugify("Новый сайт AltNet")).toBe("novyy-sayt-altnet");
});
