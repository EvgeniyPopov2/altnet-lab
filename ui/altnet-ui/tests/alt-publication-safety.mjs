import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chromium, firefox, webkit } from "playwright";

const engines = [
  ["chromium", chromium, { executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" }],
  ["firefox", firefox, {}], ["webkit", webkit, {}],
];
for (const [name, engine, options] of engines) {
  const browser = await engine.launch(options);
  const context = await browser.newContext();
  const requests = [];
  await context.route("**/*", route => {
    const url = route.request().url();
    if (/^https?:/.test(url) && !url.startsWith("http://127.0.0.1:5179/")) {
      if (route.request().frame().url() === "about:srcdoc" || url.includes("example.invalid")) requests.push(new URL(url).hostname);
      return route.abort();
    }
    return route.continue();
  });
  try {
    const page = await context.newPage();
    await page.goto("http://127.0.0.1:5179/");
    const keyframesLimited = await page.evaluate(async () => {
      const { cleanPreviewCss } = await import('/src/core/sites/previewResources.ts');
      try { cleanPreviewCss('@keyframes test{' + '0%{opacity:0}'.repeat(20001) + '}'); return false; }
      catch (error) { return String(error).includes('Слишком много правил оформления'); }
    });
    assert.equal(keyframesLimited, true);
    const result = await page.evaluate(async () => {
      const builder = await import("/src/builder/exporter.ts");
      const preview = await import("/src/core/sites/localPreview.ts");
      const model = builder.adaptFromSiteBuilderDoc({title:"Проверка",blocks:[
        {id:"html",type:"html",html:'<p>Безопасный текст</p><script>window.attacked=true</script><img src="https://example.invalid/x" onerror="alert(1)"><iframe src="https://example.invalid/"></iframe>'},
        {id:"code",type:"code",code:'<script>window.attacked=true</script>'},
        {id:"search",type:"search",action:"/search"},
        {id:"share",type:"share",networks:["copy","telegram"]},
        {id:"accordion",type:"accordion",items:[{id:"a",title:"Открыть",content:"Содержимое",open:false}]},
        {id:"photo",type:"img",cid:"https://example.invalid/photo.png"},
      ]});
      const exported = await (await builder.exportSingleHtml(model,{bundleAssets:false,restrictExternalMedia:true})).text();
      const untrusted = exported.replace("</body>", '<style>@import url(https://example.invalid/tracker.css);#style-probe{background-image:url(https://example.invalid/x)}#normal-priority{color:rgb(9,9,9)}#important-author,#important-inline{color:rgb(9,9,9)!important}</style><div id="style-probe" style="color:rgb(2,3,4)">Проверка стиля</div><div id="normal-priority" style="color:rgb(2,3,4)">1</div><div id="important-author" style="color:rgb(2,3,4)">2</div><div id="important-inline" style="color:rgb(2,3,4)!important">3</div><script>window.attacked=true</script><script src="data:text/javascript,window.attacked%3Dtrue" integrity="sha256-nottrusted"></script><img src="https://example.invalid/tracker" onerror="alert(1)"><svg width="200" height="40"><a id="svg-escape"><animate attributeName="href" values="https://example.invalid/escape" dur="0.01s" fill="freeze"/><text x="0" y="20">Внешний адрес</text></a></svg></body>');
      const popup = document.createElement('dialog');
      popup.id = 'popup-test';
      popup.dataset.popupOptions = JSON.stringify({triggers:['unknown'],devices:['desktop','bogus'],delay:1e30,clicks:-99,idle:1e30,anchor:'<script>'});
      const sanitized = await preview.prepareLocalSite(untrusted.replace('</body>', popup.outerHTML + '</body>'));
      const temporary = document.createElement('template'); temporary.innerHTML = sanitized;
      const stylesheet = temporary.content.querySelector('link[rel=stylesheet]').getAttribute('href');
      const css = atob(stylesheet.split(',')[1]);
      const frame = document.createElement("iframe");
      frame.id="safety-test"; frame.setAttribute("sandbox","allow-scripts"); frame.srcdoc=sanitized;
      document.body.appendChild(frame);
      return {exported,sanitized,css};
    });
    const frame = page.frameLocator("#safety-test");
    await frame.getByText("Безопасный текст").waitFor();
    await (await (await page.locator('#safety-test').elementHandle()).contentFrame()).waitForLoadState('load');
    assert.equal(await frame.locator('style, [style], script:not([src])').count(), 0);
    assert.equal(await frame.locator('#style-probe').evaluate(e => getComputedStyle(e).color), 'rgb(2, 3, 4)');
    assert.equal(await frame.locator('#normal-priority').evaluate(e => getComputedStyle(e).color), 'rgb(2, 3, 4)');
    assert.equal(await frame.locator('#important-author').evaluate(e => getComputedStyle(e).color), 'rgb(9, 9, 9)');
    assert.equal(await frame.locator('#important-inline').evaluate(e => getComputedStyle(e).color), 'rgb(2, 3, 4)');
    await frame.locator('#normal-priority').evaluate(e => e.setAttribute('style', 'color:rgb(200,0,0)'));
    assert.equal(await frame.locator('#normal-priority').evaluate(e => getComputedStyle(e).color), 'rgb(2, 3, 4)');
    assert.equal(await frame.locator(".safe-html script,.safe-html iframe,.safe-html img").count(), 0);
    assert.equal(await frame.locator(".code-block code").textContent(), "<script>window.attacked=true</script>");
    assert.equal(await frame.locator(".site-search button").isDisabled(), true);
    assert.equal(await frame.locator(".site-search input").isDisabled(), true);
    assert.match(await frame.locator(".site-search [role=status]").textContent(), /Поиск пока недоступен/);
    assert.equal(await frame.locator(".site-share button").isDisabled(), true);
    assert.equal(await frame.locator(".site-share a").getAttribute("aria-disabled"), "true");
    await frame.getByRole("button",{name:"Открыть",exact:true}).click();
    assert.equal(await frame.getByRole("button",{name:"Открыть",exact:true}).getAttribute("aria-expanded"),"true");
    assert.equal(await frame.locator('#svg-escape animate').count(),0);
    const popup = JSON.parse(await frame.locator('#popup-test').getAttribute('data-popup-options'));
    assert.deepEqual(popup.triggers, []);
    assert.deepEqual(popup.devices, ['desktop']);
    assert.equal(popup.delay, 3600);
    assert.equal(popup.clicks, 1);
    assert.equal(popup.idle, 3600);
    assert.equal(popup.anchor, '');
    const code = "document.body.dataset.injected='yes'";
    const hash = createHash('sha256').update(code).digest('base64');
    await frame.locator('body').evaluate((body, value) => {
      const script = document.createElement('script');
      script.src = 'data:text/javascript;base64,' + btoa(value.code);
      script.integrity = 'sha256-' + value.hash;
      script.crossOrigin = 'anonymous';
      body.append(script);
    }, {code,hash});
    await page.waitForTimeout(300);
    assert.equal(await frame.locator('body').getAttribute('data-injected'),null);
    await frame.locator('#svg-escape text').click();
    await page.waitForTimeout(500);
    assert.ok(result.sanitized.includes("connect-src 'none'"));
    assert.ok(result.sanitized.includes("style-src-attr 'none'"));
    assert.ok(!result.sanitized.includes("unsafe-inline"));
    assert.ok(!result.css.includes("@import"));
    assert.ok(!result.sanitized.includes('<script>window.attacked=true</script>'));
    assert.ok(!result.sanitized.includes("example.invalid/tracker"));
    assert.deepEqual(requests, []);
    console.log(name, "safe HTML, inert code, restricted widgets and accordion PASS");
  } finally {
    await context.close();
    await browser.close();
  }
}
