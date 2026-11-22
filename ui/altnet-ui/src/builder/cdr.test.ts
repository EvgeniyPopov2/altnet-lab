import { describe, expect, it } from "vitest";
import { externalLinkRels, sanitizeHref } from "./cdr";

describe("ссылки в конструкторе сайтов", () => {
  it.each(["javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html,test", "vbscript:run", "file:///tmp/file", "//evil.example/x", "/\\evil.example/x", "https:\\evil.example/x", "https://example.org/\npath"])(
    "блокирует небезопасную или неоднозначную ссылку %s",
    (value) => expect(sanitizeHref(value)).toBe("#"),
  );

  it.each(["https://example.org/path", "http://example.org", "mailto:help@example.org", "tel:+12345678", "ipfs://cid", "alt://site", "/page", "./page", "../page", "#SectionA"])(
    "сохраняет допустимую ссылку %s",
    (value) => expect(sanitizeHref(value)).toBe(value),
  );

  it("добавляет защитные атрибуты для внешней HTTPS-ссылки", () => {
    expect(externalLinkRels("https://example.org")).toBe("noopener noreferrer nofollow");
  });

  it("не объявляет локальный путь внешним", () => {
    expect(externalLinkRels("/page")).toBeUndefined();
  });
});
