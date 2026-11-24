import assert from "node:assert/strict";
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
      const untrusted = exported.replace("</body>", '<script>window.attacked=true</script><img src="https://example.invalid/tracker" onerror="alert(1)"></body>');
      const sanitized = await preview.prepareLocalSite(untrusted);
      const frame = document.createElement("iframe");
      frame.id="safety-test"; frame.setAttribute("sandbox","allow-scripts"); frame.srcdoc=sanitized;
      document.body.appendChild(frame);
      return {exported,sanitized};
    });
    const frame = page.frameLocator("#safety-test");
    await frame.getByText("Безопасный текст").waitFor();
    assert.equal(await frame.locator(".safe-html script,.safe-html iframe,.safe-html img").count(), 0);
    assert.equal(await frame.locator(".code-block code").textContent(), "<script>window.attacked=true</script>");
    assert.equal(await frame.locator(".site-search button").isDisabled(), true);
    assert.equal(await frame.locator(".site-search input").isDisabled(), true);
    assert.match(await frame.locator(".site-search [role=status]").textContent(), /Поиск пока недоступен/);
    assert.equal(await frame.locator(".site-share button").isDisabled(), true);
    assert.equal(await frame.locator(".site-share a").getAttribute("aria-disabled"), "true");
    await frame.getByRole("button",{name:"Открыть",exact:true}).click();
    assert.equal(await frame.getByRole("button",{name:"Открыть",exact:true}).getAttribute("aria-expanded"),"true");
    assert.ok(result.sanitized.includes("connect-src 'none'"));
    assert.ok(!result.sanitized.includes('<script>window.attacked=true</script>'));
    assert.ok(!result.sanitized.includes("example.invalid/tracker"));
    assert.deepEqual(requests, []);
    console.log(name, "safe HTML, inert code, restricted widgets and accordion PASS");
  } finally {
    await context.close();
    await browser.close();
  }
}
