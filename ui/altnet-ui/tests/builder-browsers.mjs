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
async function verifyDownloadedPage(browser, url) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  try {
    const page = await context.newPage();
    await page.goto(url);
    await page.evaluate(() =>
      localStorage.setItem(
        "altnet.sitebuilder.v1",
        JSON.stringify({
          title: "Журнал",
          blocks: [
            {
              id: "body",
              type: "p",
              text: "Книга месяца",
              richRuns: [{ text: "Книга", bold: true }, { text: " месяца" }],
            },
            { id: "arc", type: "textpath", text: "По дуге", shape: "arc" },
            { id: "open", type: "btn", label: "Контакты", href: "#popup-6d5ja5" },
          ],
          sitePages: {
            version: 1,
            activeId: "home",
            pages: [
              { id: "home", path: "index.html" },
              {
                id: "popup",
                path: "contact.html",
                template: { kind: "popup", enabled: true, priority: 1 },
                document: { title: "Редакция", blocks: [{ id: "note", type: "p", text: "Связаться с редакцией" }] },
              },
            ],
          },
        })
      )
    );
    await page.getByRole("button", { name: "Браузер .alt", exact: true }).click();
    await page.getByRole("button", { name: "Создать сайт", exact: true }).click();
    await page.locator('[data-styled-block="open"]').waitFor();
    await page.locator('[data-canvas-block="body"] .cursor-pointer').click();
    await page.locator('#inspector-tab-style').click();
    await page.getByLabel('Углы блока — связать').click();
    await page.getByLabel('Угол блока — верхний левый').fill('28');
    await page.getByLabel('Угол блока — верхний правый').fill('8');
    await page.locator('label').filter({has:page.getByText('Стиль рамки',{exact:true})}).locator('select').selectOption('solid');
    await page.getByLabel('Стороны рамки — связать').click();
    await page.getByLabel('Рамка блока — сверху').fill('6');
    await page.getByLabel('Рамка блока — справа').fill('2');
    await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-styled-block="body"]')).borderTopLeftRadius === '28px');
    assert.equal(await page.locator('[data-styled-block="body"]').evaluate(e => getComputedStyle(e).borderTopRightRadius), '8px');
    await page.getByRole('button', {name:'Mobile', exact:true}).click();
    await page.locator('label').filter({hasText:'Скругление, px'}).locator('input[type=number]').fill('12');
    await page.locator('label').filter({hasText:'Ширина рамки, px'}).locator('input[type=number]').fill('3');
    await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-styled-block="body"]')).borderTopLeftRadius === '12px');
    await page.getByRole('button', {name:'Desktop', exact:true}).click();
    await page.locator('#inspector-tab-advanced').click();
    await page.locator('summary').filter({hasText:'Расположение и переполнение'}).click();
    await page.getByLabel('Позиция блока').selectOption('relative');
    await page.getByLabel('Смещение блока слева').fill('18');
    await page.locator('summary').filter({hasText:'Цветовые эффекты блока'}).click();
    await page.getByLabel('Фильтры блока').selectOption('on');
    await page.getByLabel('Яркость (%)',{exact:true}).fill('55');
    await page.getByRole('group',{name:'Состояние эффектов'}).getByRole('button',{name:'При наведении'}).click();
    await page.getByLabel('Контраст (%) при наведении',{exact:true}).fill('140');
    await page.locator('summary').filter({hasText:'Появление при прокрутке'}).click();
    await page.getByLabel('Анимация появления').selectOption('up');
    await page.getByLabel('Длительность появления, мс').fill('100');
    await page.locator('summary').filter({hasText:'Форма обрезки'}).click();
    await page.getByLabel('Форма обрезки блока').selectOption('hexagon');
    await page.getByRole('button', {name:'Mobile', exact:true}).click();
    await page.getByLabel('Анимация появления').selectOption('none');
    await page.getByLabel('Форма обрезки блока').selectOption('none');
    await page.getByLabel('Позиция блока').selectOption('normal');
    await page.getByRole('group',{name:'Состояние эффектов'}).getByRole('button',{name:'Обычное'}).click();
    await page.getByLabel('Фильтры блока').selectOption('none');
    await page.getByRole('group',{name:'Состояние эффектов'}).getByRole('button',{name:'При наведении'}).click();
    await page.getByLabel('Фильтры блока').selectOption('none');
    const [file] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Экспорт HTML", exact: true }).click(),
    ]);
    assert.ok(file.suggestedFilename().endsWith(".html"));
    const stream = await file.createReadStream(),
      parts = [];
    for await (const chunk of stream) parts.push(chunk);
    const html = Buffer.concat(parts),
      published = await context.newPage(),
      href = new URL("builder-export-check.html", url).href;
    await published.route(href, (route) => route.fulfill({ contentType: "text/html; charset=utf-8", body: html }));
    await published.goto(href);
    await published.locator('[data-entrance][data-entrance-state="shown"]').waitFor();
    assert.equal(await published.locator('[data-entrance]').evaluate(e => getComputedStyle(e).animationName), 'sb-entry-up');
    assert.ok((await published.locator('[data-entrance]').evaluate(e => getComputedStyle(e).clipPath)).startsWith('polygon('));
    assert.equal(await published.locator("main strong").first().textContent(), "Книга");
    assert.equal(await published.locator('.sb-style-0').evaluate(e => getComputedStyle(e).borderTopLeftRadius), '28px');
    assert.equal(await published.locator('.sb-style-0').evaluate(e => getComputedStyle(e).borderTopRightRadius), '8px');
    assert.equal(await published.locator('.sb-style-0').evaluate(e => getComputedStyle(e).borderTopWidth), '6px');
    assert.equal(await published.locator('.sb-style-0').evaluate(e => getComputedStyle(e).borderRightWidth), '2px');
    assert.equal(await published.locator('.sb-style-0').evaluate(e => getComputedStyle(e).left), '18px');
    assert.ok((await published.locator('.sb-style-0').evaluate(e => getComputedStyle(e).filter)).includes('brightness(0.55)'));
    await published.locator('.sb-style-0').hover();
    assert.ok((await published.locator('.sb-style-0').evaluate(e => getComputedStyle(e).filter)).includes('contrast(1.4)'));
    await published.setViewportSize({width:375,height:800});
    assert.equal(await published.locator('[data-entrance]').evaluate(e => getComputedStyle(e).animationName), 'none');
    assert.equal(await published.locator('[data-entrance]').evaluate(e => getComputedStyle(e).clipPath), 'none');
    assert.equal(await published.locator('.sb-style-0').evaluate(e => getComputedStyle(e).borderTopLeftRadius), '12px');
    assert.equal(await published.locator('.sb-style-0').evaluate(e => getComputedStyle(e).borderTopWidth), '3px');
    assert.equal(await published.locator('.sb-style-0').evaluate(e => getComputedStyle(e).position), 'static');
    assert.equal(await published.locator('.sb-style-0').evaluate(e => getComputedStyle(e).filter), 'none');
    await published.setViewportSize({width:1440,height:900});
    const textPath = published.locator("svg textPath");
    assert.ok(await textPath.evaluate((e) => e.getComputedTextLength() > 10));
    const opener = published.getByRole("link", { name: "Контакты", exact: true }),
      modal = published.getByRole("dialog", { name: "Редакция" });
    await opener.click();
    await modal.waitFor();
    assert.ok(await modal.getByText("Связаться с редакцией").isVisible());
    await published.keyboard.press("Escape");
    await modal.waitFor({ state: "hidden" });
    await published.waitForFunction(() => document.activeElement?.textContent === "Контакты");
    return {
      download: file.suggestedFilename(),
      bytes: html.length,
      richText: true,
      textPath: true,
      popupKeyboard: true,
      responsiveCorners: true,
      responsiveBorders: true,
      positionAndFilters: true,
    };
  } finally {
    await context.close();
  }
}

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
    const outcome = await verifyDownloadedPage(browser, values.url);
    reports.find((row) => row.engine === name && row.width === 1440 && row.theme === "dark").publishedHtml = outcome;
    console.log(name, "downloaded HTML · typography, SVG, dialog and focus PASS");
  } finally {
    await browser.close();
  }
}
if (values.report) await writeFile(values.report, JSON.stringify(reports, null, 2));
