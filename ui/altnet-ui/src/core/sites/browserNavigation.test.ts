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
});
