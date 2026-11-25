import { describe, expect, it } from "vitest";
import { runInNewContext } from "node:vm";
import { compactDecrypt, decodeProtectedHeader } from "jose";
import { decryptTransfer, encryptTransfer, newTransferKey } from "./encryptedTransfer";

describe("зашифрованный контейнер для переноса", () => {
  it("создаёт стандартный JWE без исходного текста и расшифровывается отдельно", async () => {
    const bytes = new TextEncoder().encode("Проверочные сообщения и черновик: не пользовательские данные");
    const key = newTransferKey();
    const envelope = await encryptTransfer(bytes, key);
    expect(envelope).not.toContain("черновик");
    expect(decodeProtectedHeader(envelope)).toEqual({ alg: "dir", enc: "A256GCM", typ: "altnet-transfer+jwe" });
    expect((await compactDecrypt(envelope, key)).plaintext).toEqual(bytes);
    expect(await decryptTransfer(envelope, key)).toEqual(bytes);
    expect(await encryptTransfer(bytes, key)).not.toBe(envelope);
    expect(newTransferKey()).not.toEqual(key);
  });

  it("отклоняет неверный ключ, изменение содержимого и неожиданные заголовки", async () => {
    const key = newTransferKey();
    const envelope = await encryptTransfer(new TextEncoder().encode("test"), key);
    await expect(decryptTransfer(envelope, newTransferKey())).rejects.toThrow("расшифровать");
    const parts = envelope.split(".");
    const changed = [...parts];
    changed[3] = (changed[3][0] === "A" ? "B" : "A") + changed[3].slice(1);
    await expect(decryptTransfer(changed.join("."), key)).rejects.toThrow("расшифровать");
    const header = btoa(JSON.stringify({ alg: "dir", enc: "A256GCM", typ: "other" })).replace(/=/g, "");
    await expect(decryptTransfer([header, ...parts.slice(1)].join("."), key)).rejects.toThrow("расшифровать");
    await expect(decryptTransfer(envelope + "\n", key)).rejects.toThrow("Некорректный");
    await expect(encryptTransfer(new Uint8Array(), key)).rejects.toThrow("размер");
    await expect(decryptTransfer(envelope, new Uint8Array(16))).rejects.toThrow("ключ");
  });

  it("поддерживает байтовые массивы из другого контекста браузера", async () => {
    const data = runInNewContext("new Uint8Array([1,2,3,255])") as Uint8Array;
    const key = runInNewContext("new Uint8Array(32).fill(7)") as Uint8Array;
    const envelope = await encryptTransfer(data, key);
    expect(await decryptTransfer(envelope, key)).toEqual(Uint8Array.from([1, 2, 3, 255]));
    expect(Array.from(data)).toEqual([1, 2, 3, 255]);
    expect(Array.from(key)).toEqual(Array(32).fill(7));
  });
});
