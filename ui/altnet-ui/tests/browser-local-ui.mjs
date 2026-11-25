import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { parseArgs } from "node:util";
import { chromium, firefox, webkit } from "playwright";

const { values } = parseArgs({ options: { url: { type: "string", default: "http://127.0.0.1:5179/" }, engine: { type: "string", default: "chromium" }, screenshots: { type: "string" } } });
const engines = { chromium, firefox, webkit };
if (!Object.hasOwn(engines, values.engine)) throw new Error("Unsupported browser engine");
const browser = await engines[values.engine].launch(values.engine === "chromium" ? { executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" } : {});
try {
  for (const width of [320, 390, 768, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const requests = [];
    await context.route("**/*", route => {
      const url = route.request().url();
      if (/^https?:/.test(url) && !url.startsWith(values.url)) {
        const host = new URL(url).hostname;
        if (!["gc.kis.v2.scr.kaspersky-labs.com", "ff.kis.v2.scr.kaspersky-labs.com", "local.adguard.org"].includes(host)) requests.push(host);
        return route.abort();
      }
      return route.continue();
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(values.url);
    await page.evaluate(() => {
      localStorage.setItem("altnet.sites.published.index.v1", JSON.stringify([
        { slug: "alpha", title: "Сайт Альфа", createdAt: 1, updatedAt: 2 },
        { slug: "beta", title: "Сайт Бета", createdAt: 1, updatedAt: 2 },
      ]));
      localStorage.setItem("altnet.sites.published.site.v1:alpha", '<h1>Альфа содержимое</h1><script>document.body.dataset.attack="yes"</script><img src="https://example.invalid/pixel">');
      localStorage.setItem("altnet.sites.published.site.v1:beta", "<h1>Бета содержимое</h1>");
    });
    if (width < 768) await page.getByRole("button", { name: "Ещё", exact: true }).click();
    await page.getByRole("button", { name: "Браузер .alt", exact: true }).click();
    assert.equal(await page.locator(".browser-toolbar").evaluate(element => element.scrollWidth <= element.clientWidth), true, `toolbar overflow at ${width}px`);
    const address = page.getByRole("textbox", { name: "Адрес сайта" });
    await address.fill("alpha");
    await address.press("Enter");
    const alpha = page.frameLocator('iframe[title="Сайт Альфа"]');
    await alpha.getByText("Альфа содержимое").waitFor();
    assert.equal(await alpha.locator("body").getAttribute("data-attack"), null);
    assert.equal(await address.inputValue(), "alt://site/alpha");
    await page.getByRole("button", { name: "Домашняя страница", exact: true }).click();
    await page.getByText("Домашняя .alt").waitFor();
    await page.getByRole("button", { name: "Назад", exact: true }).click();
    await alpha.getByText("Альфа содержимое").waitFor();
    await page.getByRole("button", { name: "Добавить страницу в закладки" }).click();
    assert.equal(await page.getByRole("button", { name: "Убрать страницу из закладок" }).getAttribute("aria-pressed"), "true");
    if (values.screenshots) {
      await mkdir(values.screenshots, { recursive: true });
      await page.getByRole("button", { name: /^Закладки / }).click();
      await page.screenshot({ path: `${values.screenshots}/browser-${width}.png` });
      await page.getByRole("button", { name: /^Закладки / }).click();
    }
    if (width === 1440) {
      await page.keyboard.press("Control+L");
      assert.equal(await address.evaluate(element => element === document.activeElement), true);
      await page.keyboard.press("Control+T");
    } else await page.getByRole("button", { name: "Новая вкладка" }).click();
    await address.fill("alt://site/beta");
    await address.press("Enter");
    await page.frameLocator('iframe[title="Сайт Бета"]').getByText("Бета содержимое").waitFor();
    if (width >= 768) {
      await page.getByRole("button", { name: "Лента", exact: true }).click();
      await page.getByRole("button", { name: "Браузер .alt", exact: true }).click();
      await page.frameLocator('iframe[title="Сайт Бета"]').getByText("Бета содержимое").waitFor();
      assert.equal(await page.getByRole("tab").count(), 2);
    }
    if (width === 1440) {
      await page.getByRole("button", { name: "Создать сайт", exact: true }).click();
      await page.getByTitle("Закрыть конструктор").click();
      await page.frameLocator('iframe[title="Сайт Бета"]').getByText("Бета содержимое").waitFor();
      assert.equal(await page.getByRole("tab").count(), 2);
    }
    await page.getByRole("button", { name: "Назад", exact: true }).click();
    await page.getByText("Домашняя .alt").waitFor();
    await page.getByRole("button", { name: "Вперёд", exact: true }).click();
    await page.frameLocator('iframe[title="Сайт Бета"]').getByText("Бета содержимое").waitFor();
    await page.getByRole("tab", { name: "beta", exact: true }).focus();
    await page.keyboard.press("ArrowLeft");
    await alpha.getByText("Альфа содержимое").waitFor();
    await page.getByRole("button", { name: "Закрыть вкладку beta" }).click();
    assert.equal(await page.getByRole("tab").count(), 1);
    assert.equal(await page.getByRole("button", { name: "Закрыть вкладку alpha" }).isDisabled(), true);
    await page.getByRole("button", { name: "Новая вкладка" }).click();
    await address.fill("beta");
    await address.press("Enter");
    await page.frameLocator('iframe[title="Сайт Бета"]').getByText("Бета содержимое").waitFor();
    await page.getByRole("button", { name: "Закрыть вкладку beta" }).click();
    await alpha.getByText("Альфа содержимое").waitFor();
    assert.equal(await page.getByRole("tab").count(), 1);
    await address.fill("alt://homeevil");
    await address.press("Enter");
    await page.getByRole("alert").filter({ hasText: "Адрес не поддерживается" }).waitFor();
    await alpha.getByText("Альфа содержимое").waitFor();
    await address.fill("https://example.invalid/path");
    await address.press("Enter");
    await page.getByText("Сетевой запрос не выполнялся.", { exact: false }).waitFor();
    await address.fill("http://example.invalid/path");
    await address.press("Enter");
    await page.getByRole("alert").filter({ hasText: "Незащищённый HTTP не поддерживается" }).waitFor();
    await page.getByRole("button", { name: /^Закладки / }).click();
    await page.getByRole("region", { name: "Закладки" }).getByRole("button", { name: /^Сайт Альфа/ }).click();
    await alpha.getByText("Альфа содержимое").waitFor();
    await page.reload();
    if (width < 768) await page.getByRole("button", { name: "Ещё", exact: true }).click();
    await page.getByRole("button", { name: "Браузер .alt", exact: true }).click();
    await page.getByRole("button", { name: /^Закладки / }).click();
    const bookmarks = page.getByRole("region", { name: "Закладки" });
    await bookmarks.getByRole("button", { name: /^Сайт Альфа/ }).click();
    await alpha.getByText("Альфа содержимое").waitFor();
    await page.getByRole("button", { name: "Убрать страницу из закладок" }).click();
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("altnet.browser.bookmarks.v1")).length), 0);
    const dimensions = await page.locator("html").evaluate(element => ({ width: element.clientWidth, scroll: element.scrollWidth }));
    assert.ok(dimensions.scroll <= dimensions.width + 1, `${width}: ${JSON.stringify(dimensions)}`);
    assert.deepEqual(requests, []);
    assert.deepEqual(errors, []);
    await context.close();
  }
  const broken = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await broken.newPage();
  await page.goto(values.url);
  await page.evaluate(() => localStorage.setItem("altnet.browser.bookmarks.v1", "{broken"));
  await page.getByRole("button", { name: "Браузер .alt", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "Не удалось прочитать закладки" }).waitFor();
  assert.equal(await page.evaluate(() => localStorage.getItem("altnet.browser.bookmarks.v1")), "{broken");
  await broken.close();
  console.log(values.engine, "PASS: local navigation, tabs, bookmarks, corruption handling, isolation and responsive layout");
} finally { await browser.close(); }
