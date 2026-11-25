import { CompactEncrypt, compactDecrypt, decodeProtectedHeader } from "jose";

// Временный контейнер для переноса: только шифротекст, ключ передаётся отдельно.
// Модуль пока не подключён к пользовательскому хранилищу и не выполняет запись.
const TYPE = "altnet-transfer+jwe";
const MAX_BYTES = 128 * 1024 * 1024;
const MAX_COMPACT_LENGTH = Math.ceil(MAX_BYTES * 4 / 3) + 2048;

function isBytes(value: unknown): value is Uint8Array {
  return ArrayBuffer.isView(value) && Object.prototype.toString.call(value) === "[object Uint8Array]";
}

function validKey(key: Uint8Array): void {
  if (!isBytes(key) || key.byteLength !== 32) throw new Error("Нужен отдельный случайный 256-битный ключ переноса.");
}

export function newTransferKey(): Uint8Array {
  if (!globalThis.crypto?.getRandomValues) throw new Error("Безопасный генератор случайных чисел недоступен.");
  return globalThis.crypto.getRandomValues(new Uint8Array(32));
}

export async function encryptTransfer(snapshot: Uint8Array, key: Uint8Array): Promise<string> {
  validKey(key);
  if (!isBytes(snapshot) || !snapshot.byteLength || snapshot.byteLength > MAX_BYTES) throw new Error("Недопустимый размер данных переноса.");
  const data = Uint8Array.from(snapshot), localKey = Uint8Array.from(key);
  try { return await new CompactEncrypt(data).setProtectedHeader({ alg: "dir", enc: "A256GCM", typ: TYPE }).encrypt(localKey); }
  finally { data.fill(0); localKey.fill(0); }
}

export async function decryptTransfer(envelope: string, key: Uint8Array): Promise<Uint8Array> {
  validKey(key);
  if (typeof envelope !== "string" || !envelope.length || envelope.length > MAX_COMPACT_LENGTH || !/^[A-Za-z0-9_.-]+$/.test(envelope)) throw new Error("Некорректный контейнер переноса.");
  try {
    const header = decodeProtectedHeader(envelope);
    if (Object.keys(header).length !== 3 || header.alg !== "dir" || header.enc !== "A256GCM" || header.typ !== TYPE) throw new Error();
    const localKey = Uint8Array.from(key);
    try {
      const { plaintext } = await compactDecrypt(envelope, localKey, { keyManagementAlgorithms: ["dir"], contentEncryptionAlgorithms: ["A256GCM"] });
      if (!plaintext.byteLength || plaintext.byteLength > MAX_BYTES) throw new Error();
      return plaintext;
    } finally { localKey.fill(0); }
  } catch {
    throw new Error("Не удалось проверить и расшифровать данные переноса.");
  }
}
