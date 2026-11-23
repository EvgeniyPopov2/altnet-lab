import { afterEach, describe, expect, it, vi } from "vitest";
import { externalLinkRels, fetchAndCleanImage, sanitizeHref, tryReencodeToPng } from "./cdr";

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

describe("очистка изображений конструктора", () => {
  afterEach(() => vi.unstubAllGlobals());

  function mockCanvas(output: Blob | null, contextAvailable = true) {
    const close = vi.fn();
    const drawImage = vi.fn();
    const toBlob = vi.fn((callback: (blob: Blob | null) => void) => callback(output));
    const getContext = vi.fn(() => contextAvailable ? { drawImage } : null);
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue({ width: 4, height: 3, close }));
    vi.stubGlobal("document", { createElement: () => ({ getContext, toBlob }) });
    return { close, drawImage, toBlob };
  }

  it("возвращает новый PNG и освобождает изображение после перекодирования", async () => {
    const original = new Blob(["исходные данные и метаданные"], { type: "image/jpeg" });
    const encoded = new Blob(["очищенные данные"], { type: "image/png" });
    const { close, drawImage, toBlob } = mockCanvas(encoded);

    const result = await tryReencodeToPng(original);

    expect(result).toBe(encoded);
    expect(result).not.toBe(original);
    expect(drawImage).toHaveBeenCalledOnce();
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), "image/png");
    expect(close).toHaveBeenCalledOnce();
  });

  it("отклоняет изображение при ошибке декодирования", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn().mockRejectedValue(new Error("ошибка декодирования")));
    const original = new Blob(["исходные данные"], { type: "image/jpeg" });
    await expect(tryReencodeToPng(original)).rejects.toThrow("исходный файл не используется");
  });

  it("не возвращает исходное изображение, если Canvas недоступен", async () => {
    const { close } = mockCanvas(null, false);
    await expect(tryReencodeToPng(new Blob(["оригинал"]))).rejects.toThrow("исходный файл не используется");
    expect(close).toHaveBeenCalledOnce();
  });

  it.each([
    ["пустой ответ Canvas", null],
    ["пустой PNG", new Blob([], { type: "image/png" })],
    ["неверный тип результата", new Blob(["данные"], { type: "image/jpeg" })],
  ])("отклоняет %s", async (_description, output) => {
    const { close } = mockCanvas(output);
    await expect(tryReencodeToPng(new Blob(["оригинал"]))).rejects.toThrow("исходный файл не используется");
    expect(close).toHaveBeenCalledOnce();
  });

  it("перекодирует изображение при частичных настройках и называет результат PNG", async () => {
    const original = new Blob(["оригинал"], { type: "image/jpeg" });
    const encoded = new Blob(["очищенное изображение"], { type: "image/png" });
    mockCanvas(encoded);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(original)));

    const result = await fetchAndCleanImage("https://example.org/photo.jpg", {
      timeoutMs: 500,
      preferredExt: "jpg",
    });

    expect(result.blob).toBe(encoded);
    expect(result.name).toMatch(/^img-[0-9a-f]{8}\.png$/);
    expect(result.hash).toHaveLength(64);
  });

  it("не позволяет отключить очистку и не начинает загрузку", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchAndCleanImage("https://example.org/photo.jpg", { toPng: false })).rejects.toThrow("очистку изображения нельзя");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
