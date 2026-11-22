import { afterEach, describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { fileToCid, shortCid } from "./cid";

describe("временный идентификатор содержимого", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("вычисляет известный SHA-256 для содержимого файла", async () => {
    vi.stubGlobal("crypto", webcrypto);
    expect(await fileToCid(new Blob(["abc"]))).toBe(
      "cidv1-sha256-ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("даёт одинаковый результат для одинакового содержимого", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const first = await fileToCid(new Blob(["одинаковые данные"]));
    const second = await fileToCid(new Blob(["одинаковые данные"]));
    expect(first).toBe(second);
  });

  it("отказывает в добавлении файла, если хеширование недоступно", async () => {
    vi.stubGlobal("crypto", undefined);
    await expect(fileToCid(new Blob(["abc"]))).rejects.toThrow("Хеширование недоступно");
  });

  it("сокращает длинный идентификатор для отображения", () => {
    expect(shortCid("cidv1-sha256-abcdefghijklmnopqrstuvwxyz")).toBe("cidv1-sha256-a…uvwxyz");
  });
});
