import assert from "node:assert/strict";
import { parseArgs } from "node:util";
import { CarWriter } from "@ipld/car";
import { importer } from "ipfs-unixfs-importer";
import { chromium, firefox, webkit } from "playwright";

const { values } = parseArgs({ options: { url: { type: "string", default: "http://127.0.0.1:18881/" }, engine: { type: "string", default: "chromium" } } });
const engines = { chromium, firefox, webkit };
if (!Object.hasOwn(engines, values.engine)) throw new Error("Unsupported browser engine");
const blocks = new Map();
const store = { async put(cid, source) {
  const parts = [];
  if (source instanceof Uint8Array) parts.push(source);
  else for await (const part of source) parts.push(part);
  blocks.set(cid.toString(), { cid, bytes: Buffer.concat(parts) });
  return cid;
} };
const files = [
  { path: "index.html", content: new TextEncoder().encode('<link rel="stylesheet" href="_assets/style.css"><h1>Проверенный UnixFS</h1><a href="pages/">О сайте</a><img id="local" src="images/pixel.png"><img src="https://example.invalid/tracker"><script>document.body.dataset.attack="yes"</script>') },
  { path: "pages/index.html", content: new TextEncoder().encode('<link rel="stylesheet" href="../_assets/style.css"><h1>Вторая страница</h1><a href="../index.html">Домой</a>') },
  { path: "_assets/style.css", content: new TextEncoder().encode('h1 { color: rgb(12, 34, 56); background-image: url("../images/pixel.png") }') },
  { path: "images/pixel.png", content: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64") },
];
let root;
for await (const entry of importer(files, store, { wrapWithDirectory: true, cidVersion: 0, rawLeaves: false })) root = entry.cid;
const { writer, out } = CarWriter.create([root]);
const collecting = (async () => { const parts = []; for await (const part of out) parts.push(part); return Buffer.concat(parts); })();
for (const block of blocks.values()) await writer.put(block);
await writer.close();
const car = await collecting;
const browser = await engines[values.engine].launch(values.engine === "chromium" ? { executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" } : {});
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const leaked = [];
  await context.route("**/*", route => {
    const url = route.request().url();
    if (/^https?:/.test(url) && !url.startsWith(values.url)) {
      const host = new URL(url).hostname;
      if (!["gc.kis.v2.scr.kaspersky-labs.com", "ff.kis.v2.scr.kaspersky-labs.com", "local.adguard.org"].includes(host)) leaked.push(url);
      return route.abort();
    }
    return route.continue();
  });
  const page = await context.newPage();
  await page.goto(values.url);
  await page.getByRole("button", { name: "Ещё", exact: true }).click();
  await page.getByRole("button", { name: "Браузер .alt", exact: true }).click();
  await page.getByText("Открыть IPFS-пакет CAR с устройства").click();
  await page.getByLabel("CID сайта для импорта").fill(root.toString());
  await page.getByLabel("Файл CAR").setInputFiles({ name: "site.car", mimeType: "application/vnd.ipld.car", buffer: car });
  await page.getByRole("button", { name: "Проверить и открыть" }).click();
  const frame = page.frameLocator('iframe[title="index.html"]');
  try { await frame.getByText("Проверенный UnixFS").waitFor({ timeout: 12000 }); }
  catch (error) { console.error("Page state:", await page.locator("body").innerText()); throw error; }
  assert.equal(await frame.locator("body").getAttribute("data-attack"), null);
  assert.equal(await frame.locator("h1").evaluate(e => getComputedStyle(e).color), "rgb(12, 34, 56)");
  assert.match(await frame.locator("h1").evaluate(e => getComputedStyle(e).backgroundImage), /data:image\/png;base64/);
  assert.match(await frame.locator("#local").getAttribute("src"), /^data:image\/png;base64,/);
  await frame.getByText("О сайте").click();
  const nested = page.frameLocator('iframe[title="pages/index.html"]');
  await nested.getByText("Вторая страница").waitFor();
  assert.equal(await nested.locator("h1").evaluate(e => getComputedStyle(e).color), "rgb(12, 34, 56)");
  await nested.getByText("Домой").click();
  await frame.getByText("Проверенный UnixFS").waitFor();
  await page.reload();
  await page.getByRole("button", { name: "Ещё", exact: true }).click();
  await page.getByRole("button", { name: "Браузер .alt", exact: true }).click();
  await page.getByRole("textbox", { name: "Адрес сайта" }).fill(`ipfs://${root}`);
  await page.getByRole("textbox", { name: "Адрес сайта" }).press("Enter");
  await frame.getByText("Проверенный UnixFS").waitFor();
  assert.equal(await frame.locator("h1").evaluate(e => getComputedStyle(e).color), "rgb(12, 34, 56)");
  let requestsToPeer = 0;
  await context.route("**/api/sites/onion-car", route => {
    requestsToPeer++;
    assert.equal(route.request().postDataJSON().cid, root.toV1().toString());
    return route.fulfill({ status: 200, headers: { "content-type": "application/vnd.ipld.car", "content-length": String(car.length) }, body: car });
  });
  await page.evaluate(() => { const meta = document.createElement("meta"); meta.name = "altnet-session"; meta.content = "test-session"; document.head.append(meta); });
  const address = page.getByRole("textbox", { name: "Адрес сайта" });
  await address.fill(`alt://onion/${"a".repeat(56)}.onion/${root}`);
  await address.press("Enter");
  assert.equal(requestsToPeer, 0);
  await page.getByRole("button", { name: "Получить и открыть" }).click();
  await frame.getByText("Проверенный UnixFS").waitFor();
  assert.equal(requestsToPeer, 1);
  assert.deepEqual(leaked, []);
  await context.close();
  console.log(`${values.engine} PASS: verified UnixFS CAR, CSS, image, page navigation and script/network isolation`);
} finally { await browser.close(); }
