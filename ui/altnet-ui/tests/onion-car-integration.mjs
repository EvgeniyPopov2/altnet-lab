import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createInterface } from "node:readline";
import { parseArgs } from "node:util";
import { chromium, firefox, webkit } from "playwright";
import { build } from "esbuild";

// API и SOCKS настоящие локальные; шлюз имитируется. Публичная сеть не используется.
const { values } = parseArgs({ options: { engine: { type: "string", default: "chromium" } } });
const engines = { chromium, firefox, webkit };
if (!Object.hasOwn(engines, values.engine)) throw new Error("Unsupported browser engine");
const bundled = await build({ entryPoints: ["src/core/sites/ipfsSitePackage.ts"], bundle: true, platform: "node", format: "esm", write: false });
const packer = await import("data:text/javascript;base64," + Buffer.from(bundled.outputFiles[0].contents).toString("base64"));
const site = await packer.createSitePackage("Тест транспорта", [{ path: "index.html", title: "Главная", html: "<p>Открыто через локальный SOCKS</p>" }]);
const fixture = spawn("python", ["-B", "../../tests/onion-ui-fixture.py"], { stdio: ["pipe", "pipe", "inherit"], windowsHide: true });
fixture.stdin.end(Buffer.from(site.car).toString("base64") + "\n");
let browser;
try {
  const lines = createInterface({ input: fixture.stdout });
  const [line] = await Promise.race([once(lines, "line"), once(fixture, "exit").then(() => { throw new Error("Fixture exited"); })]);
  const { port, onion } = JSON.parse(line);
  const url = `http://127.0.0.1:${port}/`;
  browser = await engines[values.engine].launch(values.engine === "chromium" ? { executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" } : {});
  for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
    const context = await browser.newContext({ viewport });
    await context.route("**/*", route => {
      const request = route.request().url();
      return /^https?:/.test(request) && !request.startsWith(url) ? route.abort() : route.continue();
    });
    const page = await context.newPage();
    let apiStatus = "no request";
    let origin = "unknown";
    page.on("request", request => { if (request.url().endsWith("/api/sites/onion-car")) origin = request.headers().origin ?? "missing"; });
    page.on("response", response => { if (response.url().endsWith("/api/sites/onion-car")) apiStatus = String(response.status()); });
    await page.goto(url);
    await page.getByRole("button", { name: "Мосты Tor", exact: true }).click();
    const refresh = page.getByRole("button", { name: "Обновить список", exact: true });
    await refresh.waitFor({ state: "visible" });
    await expectEnabled(refresh);
    const [bridgeResponse] = await Promise.all([
      page.waitForResponse(response => response.url().endsWith("/api/bridges/refresh")), refresh.click(),
    ]);
    assert.equal(bridgeResponse.status(), 202);
    await page.getByRole("dialog").getByRole("button", { name: "Закрыть", exact: true }).click();
    if (viewport.width < 768) await page.getByRole("button", { name: "Ещё", exact: true }).click();
    await page.getByRole("button", { name: "Браузер .alt", exact: true }).click();
    await page.getByText("Открыть IPFS-пакет CAR с устройства", { exact: true }).click();
    await page.getByLabel("CID сайта для импорта").fill(site.root);
    await page.getByLabel("Адрес onion-шлюза").fill(onion);
    await page.getByRole("button", { name: "Получить через Tor и открыть" }).click();
    const frame = page.frameLocator('iframe[title="Тест транспорта"]');
    try { await frame.getByText("Открыто через локальный SOCKS").waitFor({ timeout: 10000 }); }
    catch (error) { throw new Error(`Opening failed (API ${apiStatus}, Origin ${origin}): ${await page.getByRole("alert").allTextContents()}`, { cause: error }); }
    assert.equal(await page.locator('iframe[title="Тест транспорта"]').getAttribute("sandbox"), "allow-scripts");
    await context.close();
  }
  console.log(values.engine, "PASS: browser → local API → simulated SOCKS/gateway → verified sandbox on mobile and desktop");
} finally {
  if (browser) await browser.close();
  fixture.kill();
}

async function expectEnabled(locator) {
  for (let i = 0; i < 40; i++) {
    if (await locator.isEnabled()) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error("Bridge controls did not become ready");
}
