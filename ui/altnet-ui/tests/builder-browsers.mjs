import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { firefox, webkit, chromium } from "playwright";

const { values } = parseArgs({
  options: {
    url: { type: "string", default: "http://127.0.0.1:5179/" },
    engines: { type: "string", default: "firefox,webkit" },
    report: { type: "string" },
  },
});
const engines = { firefox, webkit, chromium },
  reports = [];
for (const name of values.engines.split(",")) {
  if (!Object.hasOwn(engines, name)) throw new Error("Неизвестный движок " + name);
  const browser = await engines[name].launch({ headless: true });
  try {
    for (const width of [320, 390, 768, 1024, 1440, 1920]) {
      const context = await browser.newContext({
        viewport: { width, height: 900 },
        locale: "ru-RU",
        hasTouch: width <= 768,
      });
      const page = await context.newPage(),
        errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      try {
        await page.goto(values.url);
        await page.evaluate(() =>
          localStorage.setItem("altnet.sitebuilder.v1", JSON.stringify({ title: "Макеты", blocks: [] }))
        );
        const more = page.getByRole("button", { name: "Ещё", exact: true });
        await page.locator(".altnet-shell").waitFor();
        if (await more.isVisible()) {
          const point = await more.evaluate((button) => {
            const rect = button.getBoundingClientRect();
            for (const y of [6, rect.height / 2, rect.height - 6])
              for (const x of [6, rect.width / 2, rect.width - 6])
                if (button.contains(document.elementFromPoint(rect.x + x, rect.y + y))) return { x, y };
            return null;
          });
          assert.ok(point, "Кнопка мобильного меню полностью перекрыта");
          await more.click({ position: point });
        }
        await page.getByRole("button", { name: "Браузер .alt", exact: true }).click();
        await page.getByRole("button", { name: "Создать сайт", exact: true }).click();
        const root = page.locator(".altnet-builder");
        await root.waitFor();
        const tray = page.getByRole("button", { name: "Открыть панель виджетов", exact: true });
        if (width < 768 && (await tray.isVisible())) {
          await tray.tap();
          await page.getByRole("button", { name: "Закрыть панель виджетов", exact: true }).tap();
        }
        await page.getByTitle("Добавить секцию", { exact: true }).click();
        await page.getByRole("button", { name: /^CSS Grid/ }).click();
        const preview = page.locator('[data-layout-preview="2-1-1"]');
        await preview.waitFor();
        await page.locator(".sb-preset-rows select").selectOption("2");
        for (const theme of ["dark", "light"]) {
          if ((await root.getAttribute("data-editor-theme")) !== theme) {
            await page.locator('button[aria-label$="тему конструктора"]').click();
          }
          const m = await preview.evaluate((el) => {
            const rects = Array.from(el.children, (c) => {
              const { x, y, width, height } = c.getBoundingClientRect();
              return { x, y, width, height };
            });
            return {
              rects,
              well: getComputedStyle(el).backgroundColor,
              fill: getComputedStyle(el.children[0]).backgroundColor,
              viewport: document.documentElement.clientWidth,
              pageWidth: document.documentElement.scrollWidth,
            };
          });
          assert.equal(m.rects.length, 6);
          assert.ok(m.rects[0].width > 1.7 * m.rects[1].width);
          assert.ok(m.rects[3].y >= m.rects[0].y + m.rects[0].height);
          assert.notEqual(m.well, m.fill);
          assert.ok(m.pageWidth <= m.viewport + 1, "Горизонтальная прокрутка при " + width);
          reports.push({ engine: name, version: browser.version(), width, theme, columns: 3, rows: 2 });
        }
        await preview.locator("..").click();
        await page.waitForFunction(() => document.querySelectorAll("[data-layout-cell]").length === 6);
        assert.deepEqual(errors, []);
        console.log(name, browser.version(), width, "PASS");
      } catch (error) {
        console.error(
          name,
          width,
          errors,
          await page
            .locator("body")
            .innerText()
            .then((t) => t.slice(0, 600))
        );
        throw error;
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
}
if (values.report) await writeFile(values.report, JSON.stringify(reports, null, 2));
