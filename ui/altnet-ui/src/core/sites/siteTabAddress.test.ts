import { describe, expect, it } from "vitest";
import { isSiteTabHash, parseSiteTabHash, siteTabHash } from "./siteTabAddress";

describe("адрес отдельной вкладки сайта", () => {
  it("сохраняет канонический адрес и профиль без сетевого адреса назначения", () => {
    const hash = siteTabHash("alt://site/example/about.html#team", "anon");
    expect(isSiteTabHash(hash)).toBe(true);
    expect(parseSiteTabHash(hash)).toEqual({ address: "alt://site/example/about.html#team", profile: "anon" });
    expect(siteTabHash("ipfs://bafkreiaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "fast")).toContain("profile=fast");
  });
  it("отклоняет внешние адреса, onion-раздачи, повторяющиеся и неизвестные поля", () => {
    expect(() => siteTabHash("https://example.com/", "anon")).toThrow();
    expect(parseSiteTabHash("#altnet-view?address=alt%3A%2F%2Fsite%2Fa&profile=anon&profile=fast")).toBeNull();
    expect(parseSiteTabHash("#altnet-view?address=alt%3A%2F%2Fsite%2Fa&profile=anon&extra=1")).toBeNull();
    expect(parseSiteTabHash("#altnet-view?address=https%3A%2F%2Fexample.com&profile=anon")).toBeNull();
    expect(parseSiteTabHash("#altnet-view?address=alpha&profile=anon")).toBeNull();
    expect(parseSiteTabHash("#other")).toBeNull();
  });
});
