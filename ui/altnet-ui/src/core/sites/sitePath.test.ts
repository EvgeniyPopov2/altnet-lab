import { describe, expect, it } from "vitest";
import { decodeSitePath, encodeSitePath, resolveSitePath, validSitePath } from "./sitePath";

describe("пути внутри проверенного сайта", () => {
  it("разрешает только пути внутри корня и сохраняет вложенные папки", () => {
    expect(resolveSitePath("pages/about.html", "../images/a.png")).toBe("images/a.png");
    expect(resolveSitePath("pages/about.html", "/index.html")).toBe("index.html");
    for (const path of ["../../outside.html", "//host/a", "https://host/a", "%2e%2e/a", "a\\b", "a?x=1"]) expect(resolveSitePath("pages/about.html", path)).toBeNull();
    expect(validSitePath("../index.html")).toBe(false);
    expect(validSitePath("pages/about.html")).toBe(true);
    expect(validSitePath("_assets/.theme/main.css")).toBe(true);
    expect(resolveSitePath("Каталог/index.html", "../медиа/картинка%201.png")).toBe("медиа/картинка 1.png");
    expect(decodeSitePath(encodeSitePath("Каталог/о нас.html"))).toBe("Каталог/о нас.html");
    for (const path of ["a/%2fetc", "a/%5cetc", "a/%2e%2e/b", "a/%00", "a/%ZZ"]) expect(decodeSitePath(path)).toBeNull();
  });
});
