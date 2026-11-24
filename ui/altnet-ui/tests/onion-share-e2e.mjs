import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createInterface } from "node:readline";
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
  const [onion, cid] = await panel.locator("code").allTextContents();
  assert.match(onion, /^[a-z2-7]{56}\.onion$/);
  assert.match(cid, /^bafy[a-z2-7]+$/);
  for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
    const reader = await browser.newContext({ viewport });
    await reader.route("**/*", allowLocal);
    const visit = await reader.newPage();
    await visit.goto(readerUrl);
    if (viewport.width < 768) await visit.getByRole("button", { name: "Ещё", exact: true }).click();
    await visit.getByRole("button", { name: "Браузер .alt", exact: true }).click();
    await visit.getByText("Открыть IPFS-пакет CAR с устройства", { exact: true }).click();
    await visit.getByLabel("CID сайта для импорта").fill(cid);
    await visit.getByLabel("Адрес onion-шлюза").fill(onion);
    await visit.getByRole("button", { name: "Получить через Tor и открыть" }).click();
    await visit.frameLocator('iframe[title="Сайт участника"]').getByText("Передача между участниками").waitFor();
    await reader.close();
  }
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
