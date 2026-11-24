import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { build } from "esbuild";

const { values } = parseArgs({ options: { browser: { type: "string" } } });
if (!values.browser) throw new Error("Укажите путь к проверенному firefox.exe Tor Browser: --browser <путь>");
const scratch = await mkdtemp(join(tmpdir(), "altnet-tor-browser-"));
const profile = join(scratch, "profile"), appdata = join(scratch, "appdata"), localdata = join(scratch, "localappdata");
await Promise.all([profile, appdata, localdata].map(path => mkdir(path)));
await writeFile(join(profile, "user.js"), [
  'user_pref("network.proxy.type", 1);',
  'user_pref("network.proxy.socks", "127.0.0.1");',
  'user_pref("network.proxy.socks_port", 1);',
  'user_pref("network.proxy.socks_remote_dns", true);',
  'user_pref("network.proxy.no_proxies_on", "localhost, 127.0.0.1");',
  'user_pref("network.dns.disablePrefetch", true);',
  'user_pref("media.peerconnection.enabled", false);',
].join("\n"));
const bundled = await build({ entryPoints: ["tests/tor-ipfs-fixture.ts"], bundle: true, platform: "browser", format: "esm", write: false });
let outcome = null;
let resolveReport;
const report = new Promise(resolve => { resolveReport = resolve; });
const requested = [];
const server = createServer((req, res) => {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  requested.push(url.pathname);
  res.setHeader("Cache-Control", "no-store");
  if (url.pathname === "/") { res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); res.end('<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="4"><body>Проверка…<script src="/boot.js"></script><script type="module" src="/test.js"></script></body>'); }
  else if (url.pathname === "/boot.js") { res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" }); res.end('window.addEventListener("error",e=>fetch("/report?result=fail&detail="+encodeURIComponent(e.message||"script error")));window.addEventListener("unhandledrejection",e=>fetch("/report?result=fail&detail="+encodeURIComponent(String(e.reason))));'); }
  else if (url.pathname === "/test.js") { res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" }); res.end(bundled.outputFiles[0].contents); }
  else if (url.pathname === "/report") { outcome = { result: url.searchParams.get("result"), detail: url.searchParams.get("detail") }; res.writeHead(204); res.end(); resolveReport(outcome); }
  else { res.writeHead(404); res.end(); }
});
await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
const env = { ...process.env, APPDATA: appdata, LOCALAPPDATA: localdata, TOR_SKIP_LAUNCH: "1", TOR_SKIP_CONTROLPORTTEST: "1", MOZ_DISABLE_NONLOCAL_CONNECTIONS: "1", MOZ_HEADLESS: "1" };
const child = spawn(values.browser, ["-no-remote", "-profile", profile, "-headless", `http://127.0.0.1:${server.address().port}/`], { env, cwd: scratch, windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
let stderr = "";
child.stderr.on("data", data => { stderr = (stderr + data.toString()).slice(-4000); });
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Tor Browser не завершил локальный тест за 45 секунд (${requested.join(", ")})`)), 45000);
    report.then(() => { clearTimeout(timer); resolve(); });
    child.once("error", error => { clearTimeout(timer); reject(error); });
    child.once("exit", code => { clearTimeout(timer); reject(new Error(`Tor Browser завершился до результата (${code}): ${stderr}`)); });
  });
  assert.equal(outcome?.result, "pass", `Локальная проверка не прошла (${requested.join(", ")}): ${outcome?.detail || stderr}`);
  console.log("PASS: Tor Browser, локальный CAR, проверка CID, повторное чтение и отказ при повреждении");
  console.log("Тест без соединения Tor; изолированный профиль:", scratch);
} finally {
  if (child.exitCode === null) child.kill();
  server.close();
}
