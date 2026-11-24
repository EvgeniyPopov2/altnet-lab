import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, rmdir } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { chromium, firefox, webkit } from "playwright";
import { build } from "esbuild";

const {values} = parseArgs({options:{url:{type:"string",default:"http://127.0.0.1:5179/"},engine:{type:"string",default:"chromium"}}});
const engines = {chromium,firefox,webkit};
if (!Object.hasOwn(engines,values.engine)) throw new Error("Unsupported browser engine");
const scratch = await mkdtemp("H:/CodexData/Temp/altnet-car-ui-");
const filename = join(scratch,"site.car");
const browser = await engines[values.engine].launch(values.engine === "chromium" ? {executablePath:"C:/Program Files/Google/Chrome/Application/chrome.exe"} : {});
try {
  const author = await browser.newContext({acceptDownloads:true,viewport:{width:1440,height:900}});
  const editor = await author.newPage();
  const forbidden = [];
  const denyExternal = route => {
    const url = route.request().url();
    if (/^https?:/.test(url) && !url.startsWith(values.url)) {
      if (url.includes('example.invalid')) forbidden.push(new URL(url).hostname);
      return route.abort();
    }
    return route.continue();
  };
  await author.route('**/*',denyExternal);
  await editor.goto(values.url);
  await editor.evaluate(() => localStorage.setItem('altnet.sitebuilder.v1',JSON.stringify({
    title:'Проверка CAR', blocks:[{id:'head',type:'h1',text:'Привет из редактора'},{id:'next',type:'btn',label:'Контакты',href:'./about.html'},{id:'remote',type:'img',cid:'https://example.invalid/tracker.png'}],
    sitePages:{version:1,activeId:'home',pages:[{id:'home',path:'index.html'},{id:'about',path:'about.html',document:{title:'Контакты',blocks:[{id:'content',type:'p',text:'Вторая страница сайта'}]}}]},
  })));
  await editor.getByRole('button',{name:'Браузер .alt',exact:true}).click();
  await editor.getByRole('button',{name:'Создать сайт',exact:true}).click();
  const [download] = await Promise.all([editor.waitForEvent('download'),editor.getByRole('button',{name:'IPFS-пакет CAR',exact:true}).click()]);
  await download.saveAs(filename);
  const status = editor.getByRole('status').filter({hasText:'Пакет CAR сохранён'});
  await status.waitFor();
  const root = (await status.innerText()).match(/bafy[a-z2-7]+/)?.[0];
  assert.ok(root);
  await editor.evaluate(() => Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.__copiedCid=text;}}}));
  await status.getByRole('button',{name:'Копировать CID'}).click();
  await status.getByText('CID скопирован.').waitFor();
  assert.equal(await editor.evaluate(() => window.__copiedCid),root);
  await editor.evaluate(() => Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw new Error('blocked');}}}));
  await status.getByRole('button',{name:'Копировать CID'}).click();
  await status.getByText('Не удалось скопировать CID. Выделите и скопируйте его вручную.').waitFor();
  await status.getByRole('button',{name:'Закрыть',exact:true}).click();
  await status.waitFor({state:'detached'});
  const car = await readFile(filename);
  assert.ok(car.length > 0);

  const reader = await browser.newContext({viewport:{width:1440,height:900}});
  await reader.route('**/*',denyExternal);
  const page = await reader.newPage();
  await page.goto(values.url);
  await page.getByRole('button',{name:'Браузер .alt',exact:true}).click();
  await page.getByText('Открыть IPFS-пакет CAR с устройства',{exact:true}).click();
  await page.getByLabel('CID сайта для импорта').fill('bafyreigtyjaoj5k2suhsp5ntybwqu6m7ljsn2dawfsvnctymnj4p3muv3i');
  await page.getByLabel('Файл CAR').setInputFiles(filename);
  await page.getByRole('button',{name:'Проверить и открыть'}).click();
  await page.getByRole('alert').filter({hasText:'не совпадает'}).waitFor();
  assert.equal(await page.locator('iframe[title="Главная"]').count(),0);
  await page.getByLabel('CID сайта для импорта').fill(root);
  const damaged = Buffer.from(car);
  const offset = damaged.indexOf(Buffer.from('Привет из редактора'));
  assert.ok(offset > 0);
  damaged[offset] ^= 1;
  await page.getByLabel('Файл CAR').setInputFiles({name:'damaged.car',mimeType:'application/vnd.ipld.car',buffer:damaged});
  await page.getByRole('button',{name:'Проверить и открыть'}).click();
  await page.getByRole('alert').filter({hasText:'целостности'}).waitFor();
  await page.getByLabel('Файл CAR').setInputFiles(filename);
  await page.getByRole('button',{name:'Проверить и открыть'}).click();
  const home = page.frameLocator('iframe[title="Проверка CAR"]');
  await home.getByText('Привет из редактора').waitFor();
  await home.getByRole('link',{name:'Контакты'}).click();
  await page.frameLocator('iframe[title="Контакты"]').getByText('Вторая страница сайта').waitFor();

  const bundled = await build({entryPoints:['src/core/sites/ipfsSitePackage.ts'],bundle:true,platform:'node',format:'esm',write:false});
  const packer = await import('data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].contents).toString('base64'));
  const malicious = await packer.createSitePackage('Непроверенный автор', [{path:'index.html',title:'Главная',html:'<!doctype html><p>Текст полученного сайта</p><script>document.body.dataset.attacked="yes"</script><iframe src="https://example.invalid/frame"></iframe><img src="https://example.invalid/tracker" onerror="document.body.dataset.attacked=1"><style>p{background-image:url(https://example.invalid/css)}</style>'}]);
  const untrusted = await browser.newContext({viewport:{width:1440,height:900}});
  await untrusted.route('**/*',denyExternal);
  const visit = await untrusted.newPage();
  await visit.goto(values.url);
  await visit.getByRole('button',{name:'Браузер .alt',exact:true}).click();
  await visit.getByText('Открыть IPFS-пакет CAR с устройства',{exact:true}).click();
  await visit.getByLabel('CID сайта для импорта').fill(malicious.root);
  await visit.getByLabel('Файл CAR').setInputFiles({name:'untrusted.car',mimeType:'application/vnd.ipld.car',buffer:Buffer.from(malicious.car)});
  await visit.getByRole('button',{name:'Проверить и открыть'}).click();
  const isolated = visit.frameLocator('iframe[title="Непроверенный автор"]');
  await isolated.getByText('Текст полученного сайта').waitFor();
  assert.equal(await visit.locator('iframe[title="Непроверенный автор"]').getAttribute('sandbox'),'allow-scripts');
  assert.equal(await isolated.locator('iframe,script:not([src])').count(),0);
  assert.equal(await isolated.locator('script[src]').count(),1);
  assert.ok((await isolated.locator('script[src]').getAttribute('src')).startsWith('data:text/javascript;base64,'));
  assert.ok((await isolated.locator('script[src]').getAttribute('integrity')).startsWith('sha256-'));
  assert.equal(await isolated.locator('img').getAttribute('src'),null);
  assert.equal(await isolated.locator('img').getAttribute('onerror'),null);
  assert.equal(await isolated.locator('body').getAttribute('data-attacked'),null);
  assert.deepEqual(forbidden,[]);
  console.log(values.engine, 'PASS: CAR export/import, wrong CID and tampering rejected, hostile HTML isolated');
  await author.close();
  await reader.close();
  await untrusted.close();
} finally {
  await browser.close();
  await rm(filename,{force:true});
  await rmdir(scratch);
}
