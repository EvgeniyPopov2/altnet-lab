import { describe, expect, it } from "vitest";
import { resolveSitePath, validSitePath } from "./sitePath";

describe("пути внутри проверенного сайта", () => {
  it("разрешает только пути внутри корня и сохраняет вложенные папки", () => {
    expect(resolveSitePath("pages/about.html", "../images/a.png")).toBe("images/a.png");
    expect(resolveSitePath("pages/about.html", "/index.html")).toBe("index.html");
    for (const path of ["../../outside.html", "//host/a", "https://host/a", "%2e%2e/a", "a\\b", "a?x=1"]) expect(resolveSitePath("pages/about.html", path)).toBeNull();
    expect(validSitePath("../index.html")).toBe(false);
    expect(validSitePath("pages/about.html")).toBe(true);
  });
});
