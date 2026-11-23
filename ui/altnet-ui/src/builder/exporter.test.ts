import JSZip from "jszip";
import { afterEach, describe, expect, it, vi } from "vitest";
import { exportSingleHtml, exportSiteZip } from "./exporter";

describe("безопасный экспорт сайта", () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each(["HTML", "ZIP"] as const)("не добавляет исходное изображение при ошибке очистки: %s", async (format) => {
    const originalUrl = "https://example.org/private-photo.jpg";
    const placeholder = "data:image/png;base64,Y2xlYW4=";
    const progress = vi.fn();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new Blob(["небезопасные данные"], { type: "image/jpeg" }))));
    vi.stubGlobal("createImageBitmap", vi.fn().mockRejectedValue(new Error("ошибка изображения")));
    vi.stubGlobal("document", {
      createElement: () => ({
        getContext: () => ({ fillRect: vi.fn(), fillText: vi.fn() }),
        toDataURL: () => placeholder,
      }),
    });

    const model = { title: "Сайт", blocks: [{ type: "image", props: { src: originalUrl, alt: "Изображение" } }] };
    const options = { bundleAssets: true, onProgress: progress };
    const blob = format === "ZIP" ? await exportSiteZip(model, options) : await exportSingleHtml(model, options);
    const html = format === "ZIP"
      ? await (await JSZip.loadAsync(await blob.arrayBuffer())).file("index.html")!.async("string")
      : await blob.text();

    expect(html).toContain(placeholder);
    expect(html).not.toContain(originalUrl);
    expect(html).not.toContain("небезопасные данные");
    expect(progress).toHaveBeenCalledWith(0, 1);
    expect(progress).toHaveBeenLastCalledWith(1, 1);
  });
});
