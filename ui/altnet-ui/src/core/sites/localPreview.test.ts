import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { LOCAL_NAV_HASH, LOCAL_NAV_RUNTIME, prepareLocalPreviewHtml } from "./localPreview";
import { SITE_RUNTIME_HASH } from "../../builder/siteRuntime";

describe("изоляция локальной публикации", () => {
  it("разрешает в CSP только неизменённый обработчик локальной навигации", () => {
    expect(createHash("sha256").update(LOCAL_NAV_RUNTIME).digest("base64")).toBe(LOCAL_NAV_HASH);
  });
  it("без DOM показывает исходный HTML только как текст", () => {
    const html = prepareLocalPreviewHtml('<script>bad()</script><img src="https://example.org/a">');
    expect(html).toContain(`script-src 'sha256-${SITE_RUNTIME_HASH}'`);
    expect(html).toContain("style-src-attr 'none'");
    expect(html).not.toContain("unsafe-inline");
    expect(html).toContain("&lt;script&gt;bad()&lt;/script&gt;");
    expect(html).not.toContain('<img src="https://example.org/a">');
  });
});
