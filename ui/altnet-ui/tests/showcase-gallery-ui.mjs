import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { parseArgs } from "node:util";
import { chromium, firefox, webkit } from "playwright";

const { values } = parseArgs({ options: { url: { type: "string", default: "http://127.0.0.1:5179/" }, engine: { type: "string", default: "chromium" }, screenshots: { type: "string" }, focus: { type: "string" }, "full-export": { type: "boolean" } } });
const engines = { chromium, firefox, webkit };
if (!Object.hasOwn(engines, values.engine)) throw new Error("Unsupported browser engine");
const names = ["Тихая форма", "Тихий север", "Мякиш", "Авторская практика", "Между строк", "Новая перспектива", "Время для себя", "Земля рядом", "Открытый класс", "Точка встречи", "Чашка и время", "Сделано руками", "Свет и расстояние", "Соль и огонь", "Сад в городе", "Точка движения", "Дом для друга", "Горизонт знаний", "Форма и смысл", "Линия горизонта", "Мир больших идей"];
const namesToCheck = values.focus ? names.filter(name => name === values.focus) : values["full-export"] ? names.slice(0, 1) : names;
if (!namesToCheck.length) throw new Error("Unknown template");
const trace = message => { if (process.env.SHOWCASE_DEBUG === "1") console.log(message); };
async function waitForImage(locator) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await locator.evaluate(image => image.complete && image.naturalWidth > 0)) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error("Изображение не загрузилось");
}
const browser = await engines[values.engine].launch(values.engine === "chromium" ? { executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" } : {});
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const unexpected = [];
  const blockedEnvironment = new Set();
  await context.route("**/*", route => {
    const url = route.request().url();
    if (/^https?:/.test(url) && !url.startsWith(values.url)) {
      const host = new URL(url).hostname;
      if (["gc.kis.v2.scr.kaspersky-labs.com", "ff.kis.v2.scr.kaspersky-labs.com", "local.adguard.org"].includes(host)) blockedEnvironment.add(host);
      else unexpected.push(host);
      return route.abort();
    }
    return route.continue();
  });
  const page = await context.newPage();
  const tablet = await context.newPage();
  await tablet.setViewportSize({ width: 768, height: 1024 });
  const creationName = values["full-export"] && values.focus ? values.focus : "Тихая форма";
  let creationHeading = "";
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  page.on("console", message => { if (message.type() === "error") trace(`Console: ${message.text()}`); });
  await page.goto(values.url);
  await page.evaluate(() => localStorage.setItem("altnet.sitebuilder.v1", JSON.stringify({ title: "Исходный проект", blocks: [{ id: "original", type: "p", text: "Мой сохранённый текст" }] })));
  await page.getByRole("button", { name: "Браузер .alt", exact: true }).click();
  await page.getByRole("button", { name: "Создать сайт", exact: true }).click();
  await page.getByRole("button", { name: "Готовые сайты · 21" }).click();
  const dialog = page.getByRole("dialog", { name: "Галерея готовых сайтов" });
  await dialog.getByRole("button", { name: "Авторская витрина", exact: true }).click();
  assert.equal(await dialog.getByRole("button", { name: /^Форма и смысл/ }).count(), 1);
  assert.equal(await dialog.getByRole("button", { name: /^Тихая форма/ }).count(), 0);
  await dialog.getByRole("button", { name: "Все сайты", exact: true }).click();
  await dialog.getByRole("button", { name: /^Тихая форма/ }).click();
  const search = dialog.getByRole("searchbox", { name: "Найти тематику или название" });
  await search.fill("ФОТОГРАФИЯ");
  await dialog.getByText("Найдено: 1", { exact: true }).waitFor();
  await dialog.getByRole("button", { name: /^Свет и расстояние/ }).waitFor();
  assert.equal(await dialog.getByRole("button", { name: /^Тихая форма/ }).count(), 0);
  await search.fill("неизвестная тематика");
  await dialog.getByText("Таких шаблонов пока нет. Попробуйте другое слово.").waitFor();
  assert.equal(await dialog.getByRole("button", { name: "Создать проект из шаблона" }).isEnabled(), false);
  await search.clear();
  const previewPanel = dialog.locator(".sg-preview");
  const beforeScroll = await previewPanel.boundingBox();
  await previewPanel.locator("..").evaluate(element => { element.scrollTop = 500; });
  const afterScroll = await previewPanel.boundingBox();
  assert.ok(beforeScroll && afterScroll && Math.abs(beforeScroll.y - afterScroll.y) < 2, "Предпросмотр остаётся на месте при прокрутке списка");
  await previewPanel.locator("..").evaluate(element => { element.scrollTop = 0; });
  if (values.screenshots) {
    await mkdir(values.screenshots, { recursive: true });
    await dialog.locator('iframe[title="Предпросмотр: Тихая форма"]').waitFor();
    await waitForImage(page.frameLocator('iframe[title="Предпросмотр: Тихая форма"]').locator("img").first());
    await page.screenshot({ path: `${values.screenshots}/gallery-desktop.png` });
  }
  for (const [index, name] of namesToCheck.entries()) {
    trace(`Шаблон ${index + 1}: ${name}`);
    await dialog.getByRole("button", { name: new RegExp("^" + name) }).click();
    const locator = dialog.locator(`iframe[title="Предпросмотр: ${name}"]`);
    await locator.waitFor();
    const frame = page.frameLocator(`iframe[title="Предпросмотр: ${name}"]`);
    await frame.locator("h1").waitFor();
    if (name === creationName) creationHeading = await frame.locator("h1").first().innerText();
    const padding = await frame.locator("h1").first().evaluate(element => getComputedStyle(element.parentElement).paddingTop);
    assert.equal(padding, "0px", name + " heading padding");
    await frame.locator("img").first().waitFor();
    await frame.locator("img").first().scrollIntoViewIfNeeded();
    await waitForImage(frame.locator("img").first());
    await dialog.getByRole("button", { name: "Телефон", exact: true }).click();
    for (const target of ["offer", "contacts"]) {
      await frame.locator(`a[href="#${target}"]`).first().click();
      const navigation = await frame.locator(`#${target}`).evaluate(async element => {
        let position;
        for (let attempt = 0; attempt < 120; attempt++) {
          position = { top: element.getBoundingClientRect().top, height: window.innerHeight };
          if (position.top >= -1 && position.top < position.height) break;
          await new Promise(resolve => requestAnimationFrame(resolve));
        }
        return position;
      });
      assert.ok(navigation.top >= -1 && navigation.top < navigation.height, `${name} #${target}: ${JSON.stringify(navigation)}`);
    }
    if (name === "Форма и смысл" || name === "Линия горизонта") {
      const trigger = frame.locator("[data-lightbox-open]").first();
      await trigger.click();
      const lightbox = frame.getByRole("dialog", { name: "Просмотр изображения" });
      await lightbox.waitFor({ state: "visible" });
      await waitForImage(lightbox.locator("img"));
      await lightbox.getByRole("button", { name: "Закрыть", exact: true }).click();
      await lightbox.waitFor({ state: "hidden" });
    }
    if (name === "Дом для друга" || name === "Горизонт знаний" || name === "Мир больших идей") {
      const question = name === "Дом для друга" ? "Как узнать о животных?" : name === "Горизонт знаний" ? "Что можно найти в журнале?" : "Для кого это пространство?";
      const accordion = frame.getByRole("button", { name: question });
      assert.equal(await accordion.getAttribute("aria-expanded"), "false");
      await accordion.click();
      assert.equal(await accordion.getAttribute("aria-expanded"), "true");
      const answer = name === "Дом для друга" ? "Добавьте сюда актуальный способ связи с вашей командой и порядок знакомства." : name === "Горизонт знаний" ? "Опишите направления, авторов и форматы материалов вашего проекта." : "Добавьте возраст участников и описание ваших занятий.";
      const panel = frame.getByText(answer, { exact: true });
      assert.equal(await panel.isVisible(), true);
      assert.equal(await panel.evaluate(element => getComputedStyle(element).color), name === "Дом для друга" ? "rgb(59, 48, 40)" : name === "Горизонт знаний" ? "rgb(237, 247, 250)" : "rgb(23, 43, 99)");
      await accordion.click();
      assert.equal(await accordion.getAttribute("aria-expanded"), "false");
      assert.equal(await panel.isVisible(), false);
    }
    const dimensions = await frame.locator("html").evaluate(element => ({ inner: element.clientWidth, scroll: element.scrollWidth }));
    assert.ok(dimensions.inner <= 320 && dimensions.scroll <= dimensions.inner + 1, `${name}: ${JSON.stringify(dimensions)}`);
    const html = await locator.getAttribute("srcdoc");
    // Геометрию проверяем без повторного декодирования тяжёлой фотографии:
    // настоящее изображение уже проверено в iframe выше.
    const tabletHtml = html.replace(/data:image\/(?:jpeg|png|webp|gif);base64,[a-z0-9+/=]+/gi, "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/ZKkAAAAASUVORK5CYII=");
    await tablet.setContent(tabletHtml, { waitUntil: "domcontentloaded" });
    await tablet.locator("h1").waitFor();
    const tabletSize = await tablet.locator("html").evaluate(element => ({ inner: element.clientWidth, scroll: element.scrollWidth }));
    assert.ok(tabletSize.inner === 768 && tabletSize.scroll <= tabletSize.inner + 1, `${name} tablet: ${JSON.stringify(tabletSize)}`);
    if (values.screenshots && [0, 1, 5, 12, 13, 16, 17, 18, 19, 20].includes(names.indexOf(name))) {
      await mkdir(values.screenshots, { recursive: true });
      const shot = await context.newPage();
      for (const [label, width] of [["mobile", 390], ["desktop", 1440]]) {
        await shot.setViewportSize({ width, height: 900 });
        await shot.setContent(html);
        await shot.locator("img").first().waitFor({ state: "visible" });
        await shot.screenshot({ path: `${values.screenshots}/${String(names.indexOf(name)).padStart(2, "0")}-${label}.png`, fullPage: true });
      }
      await shot.close();
    }
    await dialog.getByRole("button", { name: "Десктоп", exact: true }).click();
  }
  await tablet.close();
  trace("Проверка проектов");
  await dialog.getByRole("button", { name: "Закрыть", exact: true }).click();
  await page.getByRole("button", { name: "Включить светлую тему конструктора" }).click();
  await page.getByRole("button", { name: "Готовые сайты · 21" }).click();
  assert.equal(await dialog.getAttribute("data-theme"), "light");
  await dialog.getByRole("button", { name: new RegExp("^" + creationName) }).click();
  await dialog.locator(`iframe[title="Предпросмотр: ${creationName}"]`).waitFor();
  if (values.screenshots) {
    await waitForImage(page.frameLocator(`iframe[title="Предпросмотр: ${creationName}"]`).locator("img").first());
    await page.screenshot({ path: `${values.screenshots}/gallery-light.png` });
  }
  await dialog.getByRole("button", { name: "Создать проект из шаблона" }).click();
  await dialog.waitFor({ state: "hidden" });
  if (values.screenshots) await page.screenshot({ path: `${values.screenshots}/editor-template.png` });
  const projects = page.getByRole("region", { name: "Проекты сайтов" });
  await projects.getByRole("button", { name: creationName, exact: true }).waitFor();
  if (values["full-export"]) {
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "IPFS-пакет CAR", exact: true }).click()]);
    const status = page.getByRole("status").filter({ hasText: "Пакет CAR сохранён" });
    await status.waitFor();
    const cid = (await status.innerText()).match(/bafy[a-z2-7]+/)?.[0];
    assert.ok(cid);
    trace(`Загрузка ${download.suggestedFilename()}: ${await download.failure() || "готова"}`);
    const chunks = [];
    for await (const chunk of await download.createReadStream()) chunks.push(chunk);
    const visitor = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await visitor.route("**/*", route => /^https?:/.test(route.request().url()) && !route.request().url().startsWith(values.url) ? route.abort() : route.continue());
    const visit = await visitor.newPage();
    await visit.goto(values.url);
    await visit.getByRole("button", { name: "Ещё", exact: true }).click();
    await visit.getByRole("button", { name: "Браузер .alt", exact: true }).click();
    await visit.getByText("Открыть IPFS-пакет CAR с устройства", { exact: true }).click();
    await visit.getByLabel("CID сайта для импорта").fill(cid);
    await visit.getByLabel("Файл CAR").setInputFiles({ name: "site.car", mimeType: "application/vnd.ipld.car", buffer: Buffer.concat(chunks) });
    await visit.getByRole("button", { name: "Проверить и открыть" }).click();
    const imported = visit.frameLocator(`iframe[title="${creationName}"]`);
    assert.ok(creationHeading);
    await imported.getByRole("heading", { name: creationHeading }).waitFor();
    await imported.locator("img").first().scrollIntoViewIfNeeded();
    await waitForImage(imported.locator("img").first());
    if (creationName === "Линия горизонта") {
      assert.equal(await imported.locator("img").count(), 3);
      await imported.locator("[data-lightbox-open]").first().click();
      const lightbox = imported.getByRole("dialog", { name: "Просмотр изображения" });
      await lightbox.waitFor({ state: "visible" });
      await waitForImage(lightbox.locator("img"));
      await lightbox.getByRole("button", { name: "Закрыть", exact: true }).click();
    }
    await visitor.close();
  }
  await projects.getByRole("button", { name: "Исходный проект", exact: true }).click();
  await page.getByText("Мой сохранённый текст", { exact: true }).first().waitFor();
  assert.deepEqual(unexpected, []);
  assert.deepEqual(pageErrors, []);
  if (blockedEnvironment.size) console.log("Blocked known test-environment requests:", [...blockedEnvironment].join(", "));
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
  trace("Проверка мобильной галереи");
  await mobile.route("**/*", route => /^https?:/.test(route.request().url()) && !route.request().url().startsWith(values.url) ? route.abort() : route.continue());
  const phone = await mobile.newPage();
  phone.setDefaultTimeout(10000);
  await phone.goto(values.url);
  await phone.getByRole("button", { name: "Ещё", exact: true }).click();
  await phone.getByRole("button", { name: "Браузер .alt", exact: true }).click();
  await phone.getByRole("button", { name: "Создать сайт", exact: true }).click();
  await phone.getByRole("button", { name: "Открыть панель виджетов" }).click();
  await phone.getByRole("button", { name: "Готовые сайты · 21" }).click();
  const phoneDialog = phone.getByRole("dialog", { name: "Галерея готовых сайтов" });
  await phoneDialog.getByRole("button", { name: /^Тихий север/ }).click();
  await phoneDialog.locator('iframe[title="Предпросмотр: Тихий север"]').waitFor();
  await waitForImage(phone.frameLocator('iframe[title="Предпросмотр: Тихий север"]').locator("img").first());
  await waitForImage(phoneDialog.getByRole("button", { name: /^Тихий север/ }).locator("img"));
  assert.equal(await phoneDialog.getByRole("button", { name: "Телефон", exact: true }).getAttribute("aria-pressed"), "true");
  if (values.screenshots) await phone.screenshot({ path: `${values.screenshots}/gallery-mobile.png` });
  await phoneDialog.getByRole("button", { name: "Закрыть", exact: true }).click();
  await mobile.close();
  console.log(values.engine, `PASS: ${namesToCheck.length} templates, responsive preview, local images, new project and preserved original${values["full-export"] ? ", CAR export/import with image" : ""}`);
  await context.close();
} finally { await browser.close(); }
