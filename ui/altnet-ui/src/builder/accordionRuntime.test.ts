import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { SITE_RUNTIME, SITE_RUNTIME_HASH } from "./siteRuntime";

describe("проверенный обработчик аккордеона", () => {
  it("соответствует хешу, разрешённому политикой безопасности", () => {
    expect(createHash("sha256").update(SITE_RUNTIME, "utf8").digest("base64")).toBe(SITE_RUNTIME_HASH);
    expect(SITE_RUNTIME.toLowerCase()).not.toContain("</script");
  });
});
