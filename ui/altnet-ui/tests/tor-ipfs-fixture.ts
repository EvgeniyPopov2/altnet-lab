import { createSitePackage } from "../src/core/sites/ipfsSitePackage";
import { cacheVerifiedSite, readCachedSite } from "../src/core/sites/ipfsSiteCache";

async function run(): Promise<void> {
  const html = "<!doctype html><h1>AltNet Tor test</h1>";
  const pack = await createSitePackage("Проверка", [{ path: "index.html", title: "Главная", html }]);
  const verified = await cacheVerifiedSite(pack.car, pack.root);
  if (verified.root !== pack.root || (await readCachedSite(pack.root))?.pages[0].html !== html) throw new Error("Повторное чтение отличается от исходной страницы");
  const bad = pack.car.slice();
  const marker = new TextEncoder().encode("AltNet Tor test");
  let offset = -1;
  for (let i = 0; i <= bad.length - marker.length; i++) {
    if (marker.every((byte, j) => bad[i + j] === byte)) { offset = i; break; }
  }
  if (offset < 0) throw new Error("Не найден тестовый текст");
  bad[offset] ^= 1;
  let rejected = false;
  try { await cacheVerifiedSite(bad, pack.root); } catch { rejected = true; }
  if (!rejected || (await readCachedSite(pack.root))?.pages[0].html !== html) throw new Error("Повреждённый CAR не отклонён или заменил оригинал");
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open("altnet-ipfs-site-cache", 1);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("cars", "readwrite");
    tx.objectStore("cars").put(bad.buffer, pack.root);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  rejected = false;
  try { await readCachedSite(pack.root); } catch { rejected = true; }
  if (!rejected) throw new Error("Повреждённый кэш не отклонён");
  document.body.textContent = "PASS: проверенный CAR, повторное чтение и отклонение повреждения";
}

try {
  await run();
  await fetch("/report?result=pass", { cache: "no-store" });
} catch (error) {
  document.body.textContent = `FAIL: ${error instanceof Error ? error.message : String(error)}`;
  await fetch(`/report?result=fail&detail=${encodeURIComponent(document.body.textContent)}`, { cache: "no-store" });
}
