import { afterEach, describe, expect, it, vi } from "vitest";
import { buttonLinkOptions, externalLinkRels, fetchAndCleanImage, sanitizeHref, tryReencodeToPng } from "./cdr";

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
  it("сохраняет безопасные атрибуты при выборе способа открытия и индексации", () => {
    expect(buttonLinkOptions("https://example.org", undefined, undefined)).toEqual({ target: "_blank", rel: "noopener noreferrer nofollow" });
    expect(buttonLinkOptions("HTTPS://example.org", "same", "follow")).toEqual({ target: "_self", rel: "noopener noreferrer" });
    expect(buttonLinkOptions("./contacts.html", "new", "nofollow")).toEqual({ target: "_blank", rel: "noopener noreferrer nofollow" });
    expect(buttonLinkOptions("./contacts.html", "same", "follow")).toEqual({ target: "_self", rel: "noopener noreferrer" });
    expect(buttonLinkOptions("#details", "invalid", "invalid")).toEqual({ target: "_self" });
    expect(buttonLinkOptions("https://example.org", "invalid", "invalid")).toEqual({ target: "_blank", rel: "noopener noreferrer nofollow" });
  });
});

describe("очистка изображения для экспорта", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("отклоняет ошибку декодирования и не возвращает исходный файл", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn().mockRejectedValue(new Error("decode")));
    await expect(tryReencodeToPng(new Blob(["original"], { type: "image/png" }))).rejects.toThrow();
  });

  it.each(["context", "encoding"])("отклоняет ошибку %s и освобождает изображение", async (failure) => {
    const close = vi.fn();
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue({ width: 2, height: 2, close }));
    vi.stubGlobal("document", { createElement: () => ({
      getContext: () => failure === "context" ? null : { drawImage: vi.fn() },
      toBlob: (callback: (value: null) => void) => callback(null),
    }) });
    await expect(tryReencodeToPng(new Blob(["original"], { type: "image/jpeg" }))).rejects.toThrow();
    expect(close).toHaveBeenCalledOnce();
  });

  it("возвращает перекодированный PNG и освобождает изображение", async () => {
    const close = vi.fn();
    const cleaned = new Blob(["cleaned"], { type: "image/png" });
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue({ width: 2, height: 2, close }));
    vi.stubGlobal("document", { createElement: () => ({
      getContext: () => ({ drawImage: vi.fn() }),
      toBlob: (callback: (value: Blob) => void) => callback(cleaned),
    }) });
    await expect(tryReencodeToPng(new Blob(["original"], { type: "image/jpeg" }))).resolves.toBe(cleaned);
    expect(close).toHaveBeenCalledOnce();
  });

  it("отклоняет неподдерживаемый формат и слишком большой файл", async () => {
    await expect(tryReencodeToPng(new Blob(["svg"], { type: "image/svg+xml" }))).rejects.toThrow();
    await expect(tryReencodeToPng(new Blob([new Uint8Array(10 * 1024 * 1024 + 1)], { type: "image/png" }))).rejects.toThrow();
  });

  it("отклоняет чрезмерное разрешение и освобождает изображение", async () => {
    const close = vi.fn();
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue({ width: 5000, height: 5000, close }));
    await expect(tryReencodeToPng(new Blob(["image"], { type: "image/png" }))).rejects.toThrow();
    expect(close).toHaveBeenCalledOnce();
  });

  it("не позволяет отключить очистку при экспорте", async () => {
    await expect(fetchAndCleanImage("https://example.org/image", { toPng: false })).rejects.toThrow();
  });

  it("прерывает скачивание после достижения лимита", async () => {
    let signal: AbortSignal | undefined;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) { controller.enqueue(new Uint8Array(1024 * 1024)); },
    });
    vi.stubGlobal("fetch", vi.fn().mockImplementation((_url, opts) => {
      signal = opts.signal;
      return Promise.resolve(new Response(stream, { headers: { "Content-Type": "image/png" } }));
    }));
    await expect(fetchAndCleanImage("https://example.org/image")).rejects.toThrow("10 МиБ");
    expect(signal?.aborted).toBe(true);
  });
});
