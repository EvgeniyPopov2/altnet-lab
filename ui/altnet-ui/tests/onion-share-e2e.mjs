import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createInterface } from "node:readline";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { chromium, firefox, webkit } from "playwright";

// Два локальных клиента; Tor controller и SOCKS-канал имитируются.
const { values } = parseArgs({ options: { engine: { type: "string", default: "chromium" } } });
const engines = { chromium, firefox, webkit };
if (!Object.hasOwn(engines, values.engine)) throw new Error("Unsupported browser engine");
const fixture = spawn("python", ["-B", "../../tests/site-share-e2e-fixture.py"], { stdio: ["ignore", "pipe", "inherit"], windowsHide: true });
let browser;
try {
  const lines = createInterface({ input: fixture.stdout });
  const [line] = await Promise.race([once(lines, "line"), once(fixture, "exit").then(() => { throw new Error("Fixture exited"); })]);
  const ports = JSON.parse(line);
  const authorUrl = `http://127.0.0.1:${ports.author}/`;
  const readerUrl = `http://127.0.0.1:${ports.reader}/`;
  browser = await engines[values.engine].launch(values.engine === "chromium" ? { executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" } : {});
  const allowLocal = route => /^https?:/.test(route.request().url()) && !route.request().url().startsWith(authorUrl) && !route.request().url().startsWith(readerUrl) ? route.abort() : route.continue();
  const author = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await author.route("**/*", allowLocal);
  const page = await author.newPage();
  await page.goto(authorUrl);
  await page.evaluate(() => localStorage.setItem("altnet.sitebuilder.v1", JSON.stringify({ title: "Сайт участника", blocks: [{ id: "head", type: "h1", text: "Передача между участниками" }] })));
  await page.getByRole("button", { name: "Браузер .alt", exact: true }).click();
  await page.getByRole("button", { name: "Создать сайт", exact: true }).click();
  await page.getByRole("button", { name: "Раздача через Tor", exact: true }).click();
  const panel = page.getByRole("region", { name: "Временная раздача через Tor" });
  const start = panel.getByRole("button", { name: "Начать открытую раздачу" });
  await start.waitFor();
  for (let i = 0; i < 50 && !(await start.isEnabled()); i++) await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(await start.isEnabled(), true);
  await start.click();
  await panel.getByText("Раздача запущена; доступность ещё не подтверждена.").waitFor();
  const [onion, cid, shareLink] = await panel.locator("code").allTextContents();
  assert.match(onion, /^[a-z2-7]{56}\.onion$/);
  assert.match(cid, /^bafy[a-z2-7]+$/);
  assert.equal(shareLink, `alt://onion/${onion}/${cid}`);
  await page.evaluate(() => Object.defineProperty(navigator, "clipboard", {
    configurable: true, value: { writeText: async value => { window.__altnetCopiedLink = value; } },
  }));
  await panel.getByRole("button", { name: "Копировать ссылку Alt" }).click();
  assert.equal(await page.evaluate(() => window.__altnetCopiedLink), shareLink);
  await panel.getByText("Ссылка Alt скопирована.").waitFor();
  for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
    const reader = await browser.newContext({ viewport });
    await reader.route("**/*", allowLocal);
    const visit = await reader.newPage();
    await visit.goto(readerUrl);
    if (viewport.width < 768) await visit.getByRole("button", { name: "Ещё", exact: true }).click();
    await visit.getByRole("button", { name: "Браузер .alt", exact: true }).click();
    if (viewport.width < 768) {
      let requests = 0;
      visit.on("request", request => { if (request.url().endsWith("/api/sites/onion-car")) requests++; });
      await visit.getByLabel("Адрес сайта").fill(shareLink);
      await visit.getByLabel("Адрес сайта").press("Enter");
      await visit.getByRole("heading", { name: "Получить сайт через Tor" }).waitFor();
      if (process.env.ALTNET_E2E_SCREENSHOT_DIR) await visit.screenshot({ path: join(process.env.ALTNET_E2E_SCREENSHOT_DIR, `share-${values.engine}-${viewport.width}.png`), fullPage: true });
      assert.equal(requests, 0, "A share link must not fetch before explicit user action");
      await visit.getByRole("button", { name: "Получить и открыть" }).click();
      await visit.frameLocator('iframe[title="Сайт участника"]').getByText("Передача между участниками").waitFor();
      assert.equal(requests, 1);
    } else {
      await visit.getByText("Открыть IPFS-пакет CAR с устройства", { exact: true }).click();
      await visit.getByLabel("CID сайта для импорта").fill(cid);
      await visit.getByLabel("Адрес onion-шлюза").fill(onion);
      await visit.getByRole("button", { name: "Получить через Tor и открыть" }).click();
      await visit.frameLocator('iframe[title="Сайт участника"]').getByText("Передача между участниками").waitFor();
    }
    await reader.close();
  }
  const raceReader = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await raceReader.route("**/*", allowLocal);
  let releaseRequest, requestArrived;
  const held = new Promise(resolve => { releaseRequest = resolve; });
  const arrived = new Promise(resolve => { requestArrived = resolve; });
  await raceReader.route("**/api/sites/onion-car", async route => { requestArrived(); await held; await route.continue(); });
  const racePage = await raceReader.newPage();
  await racePage.goto(readerUrl);
  await racePage.getByRole("button", { name: "Браузер .alt", exact: true }).click();
  await racePage.getByLabel("Адрес сайта").fill(shareLink);
  await racePage.getByLabel("Адрес сайта").press("Enter");
  await racePage.getByRole("heading", { name: "Получить сайт через Tor" }).waitFor();
  if (process.env.ALTNET_E2E_SCREENSHOT_DIR) await racePage.screenshot({ path: join(process.env.ALTNET_E2E_SCREENSHOT_DIR, `share-${values.engine}-1440.png`), fullPage: true });
  await racePage.getByRole("button", { name: "Получить и открыть" }).click();
  await arrived;
  await racePage.getByLabel("Адрес сайта").fill("alt://home");
  await racePage.getByLabel("Адрес сайта").press("Enter");
  await racePage.getByText("Домашняя .alt", { exact: true }).waitFor();
  await racePage.getByLabel("Адрес сайта").fill(shareLink);
  await racePage.getByLabel("Адрес сайта").press("Enter");
  await racePage.getByRole("heading", { name: "Получить сайт через Tor" }).waitFor();
  const response = racePage.waitForResponse(result => result.url().endsWith("/api/sites/onion-car"));
  releaseRequest();
  assert.equal((await response).status(), 200);
  await racePage.waitForFunction(async root => {
    const names = await indexedDB.databases();
    if (!names.some(db => db.name === "altnet-ipfs-site-cache")) return false;
    return new Promise(resolve => {
      const request = indexedDB.open("altnet-ipfs-site-cache", 1);
      request.onerror = () => resolve(false);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction("cars", "readonly");
        const get = tx.objectStore("cars").get(root);
        get.onsuccess = () => resolve(Boolean(get.result));
        tx.oncomplete = () => db.close();
      };
    });
  }, cid);
  await racePage.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await racePage.getByRole("heading", { name: "Получить сайт через Tor" }).waitFor();
  assert.equal(await racePage.getByLabel("Адрес сайта").inputValue(), shareLink);
  await raceReader.close();
  await panel.getByRole("button", { name: "Остановить раздачу" }).click();
  await panel.getByRole("button", { name: "Начать открытую раздачу" }).waitFor();
  const lateReader = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await lateReader.route("**/*", allowLocal);
  const latePage = await lateReader.newPage();
  await latePage.goto(readerUrl);
  await latePage.getByRole("button", { name: "Браузер .alt", exact: true }).click();
  await latePage.getByText("Открыть IPFS-пакет CAR с устройства", { exact: true }).click();
  await latePage.getByLabel("CID сайта для импорта").fill(cid);
  await latePage.getByLabel("Адрес onion-шлюза").fill(onion);
  await latePage.getByRole("button", { name: "Получить через Tor и открыть" }).click();
  await latePage.getByRole("alert").filter({ hasText: "Не удалось получить" }).waitFor();
  assert.equal(await latePage.locator("iframe").count(), 0);
  await lateReader.close();
  console.log(values.engine, "PASS: author shares CAR, independent clients open it, author stops share; simulated Tor only");
  await author.close();
} finally {
  if (browser) await browser.close();
  fixture.kill();
}
