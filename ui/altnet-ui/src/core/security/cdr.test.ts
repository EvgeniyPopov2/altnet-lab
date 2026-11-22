import { afterEach, describe, expect, it, vi } from "vitest";
import { cdrSanitizeUpload } from "./cdr";

describe("проверка вложений", () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    ["опасный.svg", "image/svg+xml"],
    ["документ.pdf", "application/pdf"],
    ["архив.zip", "application/zip"],
    ["файл.exe", "application/octet-stream"],
    ["без-типа", ""],
    ["страница.html", "text/html"],
  ])("не пропускает неподдерживаемое вложение %s", async (name, type) => {
    const file = new File(["данные"], name, { type });
    await expect(cdrSanitizeUpload(file)).rejects.toMatchObject({ code: "UNSUPPORTED_TYPE" });
  });

  it("отклоняет файл больше установленного ограничения", async () => {
    const file = new File(["12345"], "фото.png", { type: "image/png" });
    await expect(cdrSanitizeUpload(file, 4)).rejects.toMatchObject({ code: "TOO_LARGE" });
  });

  it("отклоняет изображение, которое не удалось декодировать", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn().mockRejectedValue(new Error("ошибка декодирования")));
    const file = new File(["не изображение"], "фото.png", { type: "image/png" });
    await expect(cdrSanitizeUpload(file)).rejects.toMatchObject({ code: "DECODE_FAILED" });
  });

  it("не возвращает исходное изображение при ошибке перекодирования", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue({ width: 1, height: 1 }));
    vi.stubGlobal("document", { createElement: () => ({ getContext: () => null }) });
    const file = new File(["данные"], "фото.png", { type: "image/png" });
    await expect(cdrSanitizeUpload(file)).rejects.toMatchObject({ code: "ENCODE_FAILED" });
  });
});
