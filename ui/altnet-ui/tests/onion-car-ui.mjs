import assert from "node:assert/strict";
import { parseArgs } from "node:util";
import { chromium, firefox, webkit } from "playwright";
import { build } from "esbuild";

// Локальная имитация API проверяет интерфейс, а не реальную работу Tor.
const { values } = parseArgs({ options: { url: { type: "string", default: "http://127.0.0.1:5179/" }, engine: { type: "string", default: "chromium" } } });
const engines = { chromium, firefox, webkit };
if (!Object.hasOwn(engines, values.engine)) throw new Error("Unsupported browser engine");
const bundled = await build({ entryPoints: ["src/core/sites/ipfsSitePackage.ts"], bundle: true, platform: "node", format: "esm", write: false });
const packer = await import("data:text/javascript;base64," + Buffer.from(bundled.outputFiles[0].contents).toString("base64"));
const site = await packer.createSitePackage("Проверка Tor", [{ path: "index.html", title: "Главная", html: "<p>Проверенный сайт</p>" }]);
const bad = Buffer.from(site.car);
bad[bad.indexOf(Buffer.from("Проверенный сайт"))] ^= 1;
const onion = "a".repeat(56) + ".onion";
const browser = await engines[values.engine].launch(values.engine === "chromium" ? { executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" } : {});
try {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
    const context = await browser.newContext({ viewport });
    let response = "unavailable";
    let calls = 0;
    await context.route("**/*", async route => {
      const url = route.request().url();
      if (url.endsWith("/api/sites/onion-car")) {
        calls++;
        assert.equal(route.request().headers()["x-altnet-session"], "test-session");
        assert.deepEqual(route.request().postDataJSON(), { onion, cid: site.root });
        if (response === "unavailable") return route.fulfill({ status: 502 });
        const body = response === "tampered" ? bad : Buffer.from(site.car);
        return route.fulfill({ status: 200, contentType: "application/vnd.ipld.car", headers: { "content-length": String(body.length) }, body });
      }
      if (/^https?:/.test(url) && !url.startsWith(values.url)) return route.abort();
      return route.continue();
    });
    const page = await context.newPage();
    await page.goto(values.url);
    await page.evaluate(() => { const meta = document.createElement("meta"); meta.name = "altnet-session"; meta.content = "test-session"; document.head.append(meta); });
    if (viewport.width < 768) await page.getByRole("button", { name: "Ещё", exact: true }).click();
    await page.getByRole("button", { name: "Браузер .alt", exact: true }).click();
    await page.getByText("Открыть IPFS-пакет CAR с устройства", { exact: true }).click();
    await page.getByLabel("CID сайта для импорта").fill(site.root);
    await page.getByLabel("Адрес onion-шлюза").fill(onion);
    const open = page.getByRole("button", { name: "Получить через Tor и открыть" });
    await open.click();
    await page.getByRole("alert").filter({ hasText: "Не удалось получить" }).waitFor();
    assert.equal(await page.locator("iframe").count(), 0);
    response = "tampered";
    await open.click();
    await page.getByRole("alert").filter({ hasText: "целостности" }).waitFor();
    assert.equal(await page.locator("iframe").count(), 0);
    response = "valid";
    await open.click();
    await page.frameLocator('iframe[title="Проверка Tor"]').getByText("Проверенный сайт").waitFor();
    assert.equal(calls, 3);
    await context.close();
  }
  console.log(values.engine, "PASS: simulated API failure, tampering rejection, verified CAR opening on mobile and desktop");
} finally { await browser.close(); }
