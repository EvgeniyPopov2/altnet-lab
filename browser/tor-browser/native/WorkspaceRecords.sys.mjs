/* Хранилище приложения принадлежит нативному окну. Обычные вкладки к нему не подключаются. */
import { setTimeout, clearTimeout } from "resource://gre/modules/Timer.sys.mjs";
const BUCKETS = new Set(["localStorage", "altnet-published-sites", "altnet-ipfs-site-cache", "altnet-sitebuilder-drafts"]);
const DB_NAME = "workspace-v1";
const STORE = "records";
const DATA_ORIGIN = "resource://altnet-client-data/";
let opening;

function database(window) {
  if (!opening) {
    const principal = Services.scriptSecurityManager.createContentPrincipal(Services.io.newURI(DATA_ORIGIN), {});
    opening = new Promise((resolve, reject) => {
      const req = window.indexedDB.openForPrincipal(principal, DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onerror = () => reject(new Error("Хранилище приложения недоступно"));
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => { db.close(); opening = undefined; };
        resolve(db);
      };
    }).catch(error => { opening = undefined; throw error; });
  }
  return opening;
}

function keyFor(bucket, key) {
  if (!BUCKETS.has(bucket) || typeof key !== "string" || !key || key.length > 2048 ||
      (bucket === "localStorage" && !key.startsWith("altnet."))) throw new Error("Неизвестная запись приложения");
  return [bucket, key];
}

// Только для доверенного владельца. Не экспортировать функцию сайту или через общий обработчик IPC.
export async function workspaceRecordBatch(window, bucket, changes) {
  if (!Array.isArray(changes) || !changes.length || changes.length > 10000) throw new Error("Некорректная операция");
  for (const item of changes) {
    if (!item || !["read", "add", "put", "delete", "metadata"].includes(item.op)) throw new Error("Некорректная запись");
    keyFor(bucket, item.key);
    if (item.op === "metadata" && (bucket !== "altnet-published-sites" || item.key !== "meta:")) throw new Error("Недоступно");
  }
  const db = await database(window);
  return new Promise((resolve, reject) => {
    const mode = changes.every(item => item.op === "read" || item.op === "metadata") ? "readonly" : "readwrite";
    const tx = db.transaction(STORE, mode, { durability: "strict" });
    const store = tx.objectStore(STORE), results = [];
    tx.oncomplete = () => resolve(results);
    tx.onabort = () => reject(new Error("Изменения хранилища отменены"));
    try {
      for (const [index, item] of changes.entries()) {
        const key = keyFor(bucket, item.key);
        if (item.op === "read") {
          const req = store.get(key);
          req.onsuccess = () => { results[index] = req.result; };
        } else if (item.op === "metadata") {
          const range = window.IDBKeyRange.bound([bucket,"meta:"],[bucket,"meta:\uffff"]);
          const req = store.openCursor(range);
          const rows = results[index] = [];
          req.onsuccess = () => {
            if (req.result) { rows.push([req.result.key[1], req.result.value]); req.result.continue(); }
          };
        } else if (item.op === "delete") store.delete(key);
        else store[item.op](item.value, key);
      }
    } catch (error) { tx.abort(); reject(error); }
  });
}


let localDb, ring;
function localDatabase() {
  if (!localDb) {
    const file = Services.dirsvc.get("ProfD", Ci.nsIFile).clone();
    file.append("altnet-workspace.sqlite");
    const db = Services.storage.openDatabase(file);
    try {
      db.executeSimpleSQL("PRAGMA synchronous=FULL");
      db.executeSimpleSQL("CREATE TABLE IF NOT EXISTS settings (name TEXT PRIMARY KEY, secret TEXT NOT NULL)");
      if (Services.appinfo.OS === "Linux") {
        ring = ChromeUtils.importESModule("moz-src:///browser/components/abouttor/LinuxWorkspaceCipher.sys.mjs").linuxRing();
      } else {
        const sdr = Cc["@mozilla.org/security/sdr;1"].getService(Ci.nsISecretDecoderRing);
        ring = {
          seal: (_, value) => sdr.encryptString(binaryText(value)),
          open: (_, value) => new TextDecoder().decode(Uint8Array.from(sdr.decryptString(value), ch => ch.charCodeAt(0))),
        };
      }
      localDb = db;
    } catch (error) { db.close(); throw error; }
  }
  return localDb;
}
function local(sql, values, read) {
  const stmt = localDatabase().createStatement(sql);
  try {
    for (const [key, value] of Object.entries(values)) stmt.params[key] = value;
    if (read) return stmt.executeStep() ? stmt.row.value : null;
    stmt.execute();
    return null;
  } finally { stmt.finalize(); }
}
function binaryText(text) {
  const bytes = new TextEncoder().encode(text), parts = [];
  for (let i = 0; i < bytes.length; i += 8192) parts.push(String.fromCharCode(...bytes.subarray(i, i + 8192)));
  return parts.join("");
}
function localOperation(role, op, name, value) {
  if (role === "viewer" && (op !== "get" || typeof name !== "string" || !name.startsWith("altnet.sites.published."))) throw new Error("Недоступно");
  if (op === "length") return local("SELECT count(*) AS value FROM settings", {}, true);
  if (op === "key" && Number.isSafeInteger(name) && name >= 0) return local("SELECT name AS value FROM settings ORDER BY rowid LIMIT 1 OFFSET :idx", {idx:name}, true);
  keyFor("localStorage", name);
  if (op === "get") {
    const secret = local("SELECT secret AS value FROM settings WHERE name=:name", {name}, true);
    return secret === null ? null : ring.open(name, secret);
  }
  if (op === "remove") return local("DELETE FROM settings WHERE name=:name", {name});
  if (op === "set" && typeof value === "string" && value.length <= 5 * 1024 * 1024) {
    localDatabase();
    return local("INSERT INTO settings(name,secret) VALUES(:name,:secret) ON CONFLICT(name) DO UPDATE SET secret=excluded.secret",
      {name, secret:ring.seal(name, value)});
  }
  throw new Error("Недоступно");
}

export function selectedProfile() {
  return localOperation("panel", "get", "altnet.profile.v1") === "fast" ? "fast" : "anon";
}

let frameUsers = 0;
const panels = new WeakSet(), owners = new WeakMap();
const FRAME = "moz-src:///browser/components/abouttor/WorkspaceRecordsFrame.js";
function scope(message) {
  const b = message.target, bc = b?.browsingContext, doc = bc?.currentWindowGlobal;
  if (!doc || bc !== bc.top || doc.innerWindowId !== message.data?.inner || doc.documentPrincipal.isSystemPrincipal ||
      doc.documentPrincipal.originNoSuffix !== "resource://altnet-workspace") return null;
  const uri = doc.documentURI.spec, window = b.ownerDocument.defaultView;
  if (!owners.has(window)) return null;
  if (panels.has(b) && uri === "resource://altnet-workspace/index.html") return "panel";
  if (!panels.has(b) && window.gBrowser?.getTabForBrowser(b) &&
      /^resource:\/\/altnet-workspace\/index\.html#altnet-(open|view)\?/.test(uri)) return "viewer";
  return null;
}
const transports = new Set();
function pausePublication(enabled) {
  const dir = Services.dirsvc.get("Home", Ci.nsIFile).clone();
  for (const part of [".local","share","altnet","published-car"]) dir.append(part);
  if (!dir.isDirectory()) return;
  const paused = dir.clone(); paused.append("paused");
  if (enabled) {
    if (!paused.exists()) paused.create(Ci.nsIFile.NORMAL_FILE_TYPE, 0o600);
    const current = dir.clone(); current.append("current");
    if (current.exists()) current.remove(false);
  } else if (paused.exists()) paused.remove(false);
}
const listenLocal = msg => {
  try {
    const role = scope(msg);
    if (!role) throw new Error();
    const {op,key,value} = msg.data;
    if (role === "panel" && op === "set") {
      if (key === "altnet.panic.v1" && value === "1" || key === "altnet.profile.v1" && value !== selectedProfile()) {
        for (const proc of transports) void proc.kill();
      }
      if (key === "altnet.panic.v1") pausePublication(value === "1");
    }
    return { ok:true, value:localOperation(role,op,key,value) };
  } catch { return {ok:false}; }
};
async function publication(msg, changes) {
  if (scope(msg) !== "panel" || Services.appinfo.OS !== "Linux" || !Array.isArray(changes) || changes.length !== 1) throw new Error();
  const {op, key, value} = changes[0];
  if (op === "mesh-configured") return [await IOUtils.exists("/etc/altnet-browser/mesh.json")];
  if (!["status","stop","start","route-status"].includes(op)) throw new Error();
  const args = ["share",op];
  if (op === "start") {
    if (localOperation("panel","get","altnet.panic.v1") === "1") throw new Error("Паника включена");
    if (!/^b[a-z2-7]{58}$/.test(key) || !["both","tor"].includes(value?.mode) ||
        !(value.car instanceof ArrayBuffer) || !value.car.byteLength || value.car.byteLength > 72*1024*1024) throw new Error();
    args.push(key,value.mode);
  }
  const { Subprocess } = ChromeUtils.importESModule("resource://gre/modules/Subprocess.sys.mjs");
  const script = PathUtils.join(Services.dirsvc.get("GreD",Ci.nsIFile).path,"altnet-linux","site_transport.py");
  const proc = await Subprocess.call({command:"/usr/bin/python3", arguments:["-I","-B",script,...args]});
  const timer = setTimeout(()=>proc.kill(),20000);
  try {
    if (op === "start") await proc.stdin.write(value.car);
    await proc.stdin.close();
    let text = "";
    for (;;) {
      const chunk = await proc.stdout.readString();
      if (!chunk) break;
      text += chunk;
      if (text.length > 2048) throw new Error();
    }
    if ((await proc.wait()).exitCode !== 0) throw new Error();
    return [JSON.parse(text)];
  } finally { clearTimeout(timer); await proc.kill(); }
}

let reads = 0;
async function fetchSite(msg, role, changes) {
  if (Services.appinfo.OS !== "Linux" || !["panel","viewer"].includes(role) ||
      !Array.isArray(changes) || changes.length !== 1 || reads >= 2) throw new Error("Маршрут недоступен");
  const { profile, cid, onion = "" } = changes[0];
  if (localOperation("panel","get","altnet.panic.v1") === "1" || profile !== selectedProfile() || !/^b[a-z2-7]{40,119}$/.test(cid) ||
      (profile === "anon" ? !/^[a-z2-7]{56}\.onion$/.test(onion) : onion !== "")) throw new Error("Некорректный маршрут");
  if (role === "viewer") {
    const uri = msg.target.browsingContext.currentWindowGlobal.documentURI.spec;
    const params = new URLSearchParams(uri.split("?")[1]);
    const address = params.get("address");
    if ((params.get("profile") ?? "anon") !== profile ||
        (profile === "anon" ? address !== `alt://onion/${onion}/${cid}` :
          !(address === `ipfs://${cid}` || address?.startsWith(`ipfs://${cid}/`) || address?.startsWith(`ipfs://${cid}#`)))) throw new Error("Адрес вкладки изменился");
  }
  const { Subprocess } = ChromeUtils.importESModule("resource://gre/modules/Subprocess.sys.mjs");
  const script = PathUtils.join(Services.dirsvc.get("GreD", Ci.nsIFile).path, "altnet-linux", "site_transport.py");
  let proc, timer;
  reads++;
  try {
    proc = await Subprocess.call({command:"/usr/bin/python3", arguments:["-I","-B",script,"get",profile,cid,onion]});
    transports.add(proc);
    timer = setTimeout(() => proc.kill(), 125000);
    await proc.stdin.close();
    const chunks = [];
    let size = 0;
    while (true) {
      const part = await proc.stdout.read();
      if (!part.byteLength) break;
      size += part.byteLength;
      if (size > 72*1024*1024 || !scope(msg) || selectedProfile() !== profile || localOperation("panel","get","altnet.panic.v1") === "1") throw new Error("Запрос отменён");
      chunks.push(new Uint8Array(part));
    }
    if ((await proc.wait()).exitCode !== 0 || !size) throw new Error("Сайт недоступен");
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const part of chunks) { bytes.set(part, offset); offset += part.length; }
    return [bytes.buffer];
  } finally {
    if (timer) clearTimeout(timer);
    transports.delete(proc);
    if (proc) await proc.kill();
    reads--;
  }
}
const listenRecords = async msg => {
  const inner = msg.data?.inner, id = msg.data?.id;
  if (!Number.isSafeInteger(id)) return;
  let reply = {inner,id,ok:false};
  try {
    const role = scope(msg);
    const { bucket, changes } = msg.data;
    if (role === "panel" && bucket === "site-publication") {
      reply = {inner,id,ok:true,value:await publication(msg,changes)};
    } else if (role && bucket === "site-transport") {
      reply = {inner,id,ok:true,value:await fetchSite(msg,role,changes)};
    } else {
    if (!role || !BUCKETS.has(bucket) || bucket === "localStorage" || !Array.isArray(changes)) throw new Error();
    if (role === "viewer" && (bucket === "altnet-sitebuilder-drafts" || changes.some(item => item?.op !== "read"))) throw new Error();
    const value = await workspaceRecordBatch(msg.target.ownerDocument.defaultView,bucket,changes);
    reply = {inner,id,ok:true,value};
    }
  } catch { /* закрытый документ или отклонённая транзакция */ }
  if (scope(msg)) msg.target.messageManager?.sendAsyncMessage("AltNet:RecordsReply",reply);
};

export function bindWorkspaceRecords(window, panel) {
  owners.set(window,panel);
  panels.add(panel);
  if (!frameUsers++) {
    Services.mm.addMessageListener("AltNet:Local",listenLocal);
    Services.mm.addMessageListener("AltNet:Records",listenRecords);
    Services.mm.loadFrameScript(FRAME,true);
  }
  return () => {
    panels.delete(panel);
    owners.delete(window);
    if (!--frameUsers) {
      Services.mm.removeDelayedFrameScript(FRAME);
      Services.mm.removeMessageListener("AltNet:Local",listenLocal);
      Services.mm.removeMessageListener("AltNet:Records",listenRecords);
      if (localDb) { localDb.asyncClose(); localDb=null; }
    }
  };
}
