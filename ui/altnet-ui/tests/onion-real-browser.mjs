import assert from "node:assert/strict";
import { chromium } from "playwright";

// Invoked by site-share-network.py while two isolated test Tor clients are running.
// The browser connects only to the test client on loopback; Tor is used by that client.
const [port, onion, cid, executablePath, mode = "altnet"] = process.argv.slice(2);
if (!/^\d{1,5}$/.test(port || "") || !/^[a-z2-7]{56}\.onion$/.test(onion || "") || !/^b[a-z2-7]{58}$/.test(cid || "")) throw new Error("Invalid test parameters");
const base = `http://127.0.0.1:${port}/`;
const browser = await chromium.launch(executablePath ? { executablePath } : {});
try {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
    const context = await browser.newContext({ viewport });
    await context.route("**/*", route => /^https?:/.test(route.request().url()) && !route.request().url().startsWith(base) ? route.abort() : route.continue());
    const page = await context.newPage();
    let requests = 0;
    page.on("request", request => { if (request.url().endsWith("/api/sites/onion-car")) requests++; });
    await page.goto(base);
    if (viewport.width < 768) await page.getByRole("button", { name: "Ещё", exact: true }).click();
    await page.getByRole("button", { name: "Браузер .alt", exact: true }).click();
    await page.getByLabel("Адрес сайта").fill(`alt://onion/${onion}/${cid}`);
    await page.getByLabel("Адрес сайта").press("Enter");
    await page.getByRole("heading", { name: "Получить сайт через Tor" }).waitFor();
    assert.equal(requests, 0);
    await page.getByRole("button", { name: "Получить и открыть" }).click();
    const title = mode === "unixfs" ? "index.html" : "Главная";
    const expected = mode === "unixfs" ? "Проверка UnixFS через Tor" : "Привет из AltNet";
    await page.frameLocator(`iframe[title="${title}"]`).getByText(expected).waitFor({ timeout: 150000 });
    assert.equal(requests, 1);
    assert.equal(await page.locator(`iframe[title="${title}"]`).getAttribute("sandbox"), "allow-scripts");
    // Повторное открытие после перезапуска UI должно использовать проверяемую
    // локальную копию, даже если запрос к onion-источнику больше недоступен.
    await page.route("**/api/sites/onion-car", route => route.abort());
    await page.reload();
    if (viewport.width < 768) await page.getByRole("button", { name: "Ещё", exact: true }).click();
    await page.getByRole("button", { name: "Браузер .alt", exact: true }).click();
    await page.getByLabel("Адрес сайта").fill(`ipfs://${cid}`);
    await page.getByLabel("Адрес сайта").press("Enter");
    await page.frameLocator(`iframe[title="${title}"]`).getByText(expected).waitFor({ timeout: 30000 });
    assert.equal(requests, 1, "Повторное открытие не должно загружать CAR из сети");
    await context.close();
  }
  console.log("PASS: ссылка Alt открыла сайт через Tor; IPFS-копия повторно открылась без сети на двух размерах экрана.");
} finally {
  await browser.close();
}
