import { parseSiteRoot, SITE_MAX_CAR_BYTES } from "./ipfsSitePackage";

/** Запрос к локальному клиенту; к onion подключается только его Tor-транспорт. */
export async function fetchOnionCar(onion: string, cid: string): Promise<Uint8Array> {
  parseSiteRoot(cid);
  if (!/^[a-z2-7]{56}\.onion$/.test(onion)) throw new Error("Введите полный адрес onion v3 без протокола и пути.");
  const token = document.querySelector<HTMLMetaElement>('meta[name="altnet-session"]')?.content;
  if (!token) throw new Error("Откройте AltNet через локальный клиент.");
  const response = await fetch("/api/sites/onion-car", {
    method: "POST", mode: "same-origin", cache: "no-store", redirect: "error", referrerPolicy: "same-origin",
    headers: { "X-AltNet-Session": token, "Content-Type": "application/json" },
    body: JSON.stringify({ onion, cid }), signal: AbortSignal.timeout(135000),
  });
  if (response.status === 404) throw new Error("Запущенный клиент не поддерживает загрузку сайтов. Перезапустите AltNet, чтобы применить обновление.");
  if (!response.ok) throw new Error("Не удалось получить пакет через Tor. Проверьте адреса, подключение и доступность узла.");
  const length = response.headers.get("content-length");
  if (!length || !/^\d+$/.test(length) || Number(length) < 1 || Number(length) > SITE_MAX_CAR_BYTES || !response.body) {
    throw new Error("Некорректный размер пакета сайта.");
  }
  const expected = Number(length);
  const result = new Uint8Array(expected);
  const reader = response.body.getReader();
  let offset = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (offset + value.length > expected) throw new Error("Пакет сайта превышает заявленный размер.");
      result.set(value, offset);
      offset += value.length;
    }
  } finally { reader.releaseLock(); }
  if (offset !== expected) throw new Error("Пакет сайта получен не полностью.");
  return result;
}
