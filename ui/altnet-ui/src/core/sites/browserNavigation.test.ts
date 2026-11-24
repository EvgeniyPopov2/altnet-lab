import { describe, expect, it } from "vitest";
import { parseBrowserAddress } from "./browserNavigation";

describe("адреса браузера Alt", () => {
  it("нормализует домашнюю и локальные страницы", () => {
    expect(parseBrowserAddress("")).toEqual({ kind: "home", url: "alt://home" });
    expect(parseBrowserAddress("my-site")).toMatchObject({ kind: "site", url: "alt://site/my-site", path: "index.html" });
    expect(parseBrowserAddress("site/my-site/about.html#contacts")).toMatchObject({ kind: "site", slug: "my-site", path: "about.html", fragment: "contacts" });
    expect(parseBrowserAddress("alt://site/my-site/index.html#top")).toMatchObject({ url: "alt://site/my-site#top" });
  });

  it.each(["alt://homeevil", "alt://home/path", "alt://site/a/../../index.html", "alt://site/a?x=1", "alt://site/a#bad%20fragment", "javascript:alert(1)", "file:///C:/secret", "example.com", "alt://site/a\nfoo"])("отклоняет неподдерживаемый или неоднозначный адрес %s", input => {
    expect(() => parseBrowserAddress(input)).toThrow();
  });

  it("распознаёт веб-адрес без доступа к сети и отвергает учётные данные", () => {
    expect(parseBrowserAddress("https://example.invalid/test")).toEqual({ kind: "external", url: "https://example.invalid/test" });
    expect(() => parseBrowserAddress("https://user:password@example.invalid/")).toThrow();
  });

  it("принимает только канонический CID сайта и допустимую страницу IPFS", () => {
    const root = "bafyreigtyjaoj5k2suhsp5ntybwqu6m7ljsn2dawfsvnctymnj4p3muv3i";
    expect(parseBrowserAddress(`ipfs://${root}/index.html#top`)).toMatchObject({ kind: "ipfs", root, path: "index.html", url: `ipfs://${root}#top` });
    expect(parseBrowserAddress(`ipfs://${root}/about.html`)).toMatchObject({ kind: "ipfs", path: "about.html" });
    for (const bad of [`ipfs://${root}/../about.html`, `ipfs://${root}?x=1`, `ipfs://${root.toUpperCase()}`, "ipfs://example.com/", `ipfs://${root}/other.js`]) expect(() => parseBrowserAddress(bad)).toThrow();
  });

  it("разбирает ссылку onion-раздачи без сетевого запроса", () => {
    const root = "bafyreigtyjaoj5k2suhsp5ntybwqu6m7ljsn2dawfsvnctymnj4p3muv3i";
    const onion = "a".repeat(56) + ".onion";
    const url = `alt://onion/${onion}/${root}`;
    expect(parseBrowserAddress(url)).toEqual({ kind: "onion-share", onion, root, url });
    for (const bad of [url + "?x=1", url + "/index.html", url + "#x", url.toUpperCase(), `alt://onion/localhost/${root}`, `alt://onion/${onion}/bafy`]) {
      expect(() => parseBrowserAddress(bad)).toThrow();
    }
  });

  it.each(["http://example.invalid/", "HTTP://example.invalid/", "http://127.0.0.1/"])("отклоняет незащищённый веб-адрес %s", input => {
    expect(() => parseBrowserAddress(input)).toThrow("Незащищённый HTTP не поддерживается");
  });
});
