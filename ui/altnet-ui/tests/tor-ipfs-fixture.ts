import { createSitePackage } from "../src/core/sites/ipfsSitePackage";
import { cacheVerifiedSite, deleteCachedSite, readCachedSite } from "../src/core/sites/ipfsSiteCache";
import { prepareLocalPreviewHtml } from "../src/core/sites/localPreview";
import { CarWriter } from "@ipld/car";
import { CID } from "multiformats/cid";
import { sha256 } from "multiformats/hashes/sha2";

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
  await deleteCachedSite(pack.root);
  if (await readCachedSite(pack.root) !== null) throw new Error("Повреждённая копия не удалена");
  const rawBytes = new TextEncoder().encode("<h1>UnixFS Tor test</h1>");
  const rawCid = CID.createV1(0x55, await sha256.digest(rawBytes));
  const { writer, out } = CarWriter.create([rawCid]);
  const collecting = (async () => { const chunks: Uint8Array[] = []; let size = 0; for await (const chunk of out) { chunks.push(chunk); size += chunk.length; } const data = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.length; } return data; })();
  await writer.put({ cid: rawCid, bytes: rawBytes }); await writer.close();
  const unixfs = await cacheVerifiedSite(await collecting, rawCid.toString());
  if (unixfs.pages[0].html !== "<h1>UnixFS Tor test</h1>" || (await readCachedSite(rawCid.toString()))?.pages[0].html !== unixfs.pages[0].html) throw new Error("UnixFS не восстановлен в Tor Browser");
  await deleteCachedSite(rawCid.toString());
  let attacked = false;
  const onMessage = (event: MessageEvent) => { if (event.data === "altnet-test-attack") attacked = true; };
  window.addEventListener("message", onMessage);
  const frame = document.createElement("iframe");
  frame.setAttribute("sandbox", "allow-scripts");
  frame.srcdoc = prepareLocalPreviewHtml('<p>Тест</p><script>parent.postMessage("altnet-test-attack","*")</script><img src="https://example.invalid/pixel" onerror="parent.postMessage(\'altnet-test-attack\',\'*\')">');
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Изолированная страница не открылась")), 5000);
    frame.onload = () => { clearTimeout(timer); setTimeout(resolve, 300); };
    document.body.appendChild(frame);
  });
  frame.remove();
  window.removeEventListener("message", onMessage);
  if (attacked) throw new Error("Недоверенный код выполнился в песочнице");
  document.body.textContent = "PASS: проверенный CAR, повторное чтение и отклонение повреждения";
}

try {
  await run();
  await fetch("/report?result=pass", { cache: "no-store" });
} catch (error) {
  document.body.textContent = `FAIL: ${error instanceof Error ? error.message : String(error)}`;
  await fetch(`/report?result=fail&detail=${encodeURIComponent(document.body.textContent)}`, { cache: "no-store" });
}
