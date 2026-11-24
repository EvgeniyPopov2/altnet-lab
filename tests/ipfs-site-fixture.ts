import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createSitePackage, verifySitePackage } from "../ui/altnet-ui/src/core/sites/ipfsSitePackage";

const [action, dir] = process.argv.slice(2);
if (!dir || !["create", "verify"].includes(action)) throw new Error("Укажите create|verify и каталог теста");
if (action === "create") {
  await mkdir(dir, {recursive:true});
  const site = await createSitePackage("Испытательный сайт", [
    {path:"index.html",title:"Главная",html:"<!doctype html><h1>Привет из AltNet</h1><a href=\"./about.html\">Далее</a>"},
    {path:"about.html",title:"Контакты",html:"<!doctype html><p>Вторая страница</p>" + "x".repeat(300000)},
  ]);
  await writeFile(join(dir,"site.car"),site.car,{flag:"wx"});
  await writeFile(join(dir,"root.txt"),site.root,{flag:"wx"});
  console.log("Created:",site.root,site.car.length,"bytes");
} else {
  const root = (await readFile(join(dir,"root.txt"),"utf8")).trim();
  const site = await verifySitePackage(new Uint8Array(await readFile(join(dir,"received.car"))),root);
  if (site.pages.length !== 2 || !site.pages.some(page => page.html.includes("Привет из AltNet"))) throw new Error("Содержимое не совпадает");
  console.log("Verified:",site.root,site.pages.length,"pages");
}
