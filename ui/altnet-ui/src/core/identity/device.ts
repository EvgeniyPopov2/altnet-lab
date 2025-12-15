// ui/altnet-ui/src/core/identity/device.ts
// Утилиты идентичности устройства (MVP).
// В проде будет связка с device keys / attestation, но для UI-моков достаточно стабильного id.

const DEVICE_ID_KEY = "altnet.deviceId.v1";
const SEQ_KEY = "altnet.deviceSeq.v1";

function getLS(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function randomHex(bytesLen: number): string {
  const bytes = new Uint8Array(bytesLen);
  const c = globalThis.crypto;

  if (c && "getRandomValues" in c) {
    c.getRandomValues(bytes);
  } else {
    // Fallback (на случай очень старой среды). Для MVP допустимо.
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }

  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function getOrCreateDeviceId(): string {
  const ls = getLS();
  if (!ls) return "dev-ephemeral";

  const existing = ls.getItem(DEVICE_ID_KEY);
  if (existing) return existing;

  const id = `dev-${randomHex(8)}`;
  ls.setItem(DEVICE_ID_KEY, id);
  return id;
}

export function nextDeviceSeq(): number {
  const ls = getLS();
  if (!ls) return Date.now();

  const raw = ls.getItem(SEQ_KEY);
  const n = raw ? Number(raw) : 0;

  const next = Number.isFinite(n) ? n + 1 : 1;
  ls.setItem(SEQ_KEY, String(next));
  return next;
}
